import nodemailer, { type Transporter } from 'nodemailer'

import { construirMensaje, type EntradaDelMail } from './email.js'

/**
 * El transporte: el único lugar del proyecto que manda mail, por SMTP de
 * Gmail con App Password.
 *
 * Acá hay una conexión SMTP y dos variables de entorno, que es justo lo
 * que `email.ts` no tiene. La división deja el contenido del mail
 * testeable sin red y deja este archivo reducido a un `sendMail`.
 *
 * Antes fueron Brevo y Resend (fetch a sus APIs). Se sacaron porque
 * Brevo no entregaba y Resend exige dominio verificado para escribirle
 * a invitados. Gmail SMTP no pide dominio: el remitente es la propia
 * cuenta, con una App Password (requiere verificación en 2 pasos).
 *
 * LA REGLA DE ESTE ARCHIVO: NUNCA TIRA.
 *
 * `enviarMail` devuelve un resultado, no lanza. La razón es el orden de
 * las operaciones en el alta: la reserva se escribe en Firestore DENTRO
 * de una transacción, y el mail se manda DESPUÉS, porque no se puede
 * meter red dentro de una transacción de Firestore sin holdear los
 * locks. Entonces, si mandar el mail explota, la reserva ya quedó
 * escrita.
 *
 * Hay dos salidas y son malas las dos:
 *
 *   - Tirar: el endpoint devuelve 500 y el usuario cree que no se
 *     registró, pero SÍ se registró. Reintenta, entra el segundo
 *     registro, y la persona termina con dos entradas o dos mails.
 *   - Devolver el error y responder 201: el usuario cree que se
 *     registró y efectivamente se registró, pero no tiene el mail y no
 *     puede avisar porque no tiene el token.
 *
 * La segunda es menos mala. Por eso el 201 no promete que el mail salió:
 * la respuesta dice que la reserva se guardó. El mail perdido se resuelve
 * con el reenvío de la Fase 6, que es un problema conocido y con
 * solución, en vez de una reserva duplicada que es un problema raro y sin
 * solución. Un 500 que miente es peor que un 201 que es cierto.
 */

export type ResultadoEnvio =
  | { enviado: true; transporte: 'smtp' | 'consola' }
  | { enviado: false; transporte: 'ninguno'; motivo: string }

/** Lo que hay que tener para mandar de verdad. */
export function smtpConfigurado(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
}

let transporte: Transporter | null = null

function obtenerTransporte(): Transporter {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        // Google la muestra con espacios ("xxxx xxxx xxxx xxxx"): acá no
        // van, y si el usuario los pega con espacios igual anda.
        pass: (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, ''),
      },
      // El alta no puede quedar colgada esperando a Gmail. Si Gmail está
      // lento, la reserva ya está escrita y el usuario igual está
      // esperando una respuesta: mejor un timeout y un reenvío después
      // que una request que muere a los 30 segundos del lado del
      // navegador.
      connectionTimeout: 8_000,
      socketTimeout: 8_000,
    })
  }
  return transporte
}

/**
 * Manda el mail, o lo registra en la consola.
 *
 * Sin `GMAIL_USER` + `GMAIL_APP_PASSWORD` no tira: imprime en el log y
 * dice que salió. Es lo que permite probar el alta entera en local sin
 * credenciales, y lo que evita que un deploy sin variables rompa el
 * alta: la reserva se guarda igual y el mail queda pendiente de reenvío.
 */
export async function enviarMail(entrada: EntradaDelMail): Promise<ResultadoEnvio> {
  if (!smtpConfigurado()) {
    return registrarEnConsola(entrada)
  }

  // De `construirMensaje` sólo se usan subject y htmlContent: el
  // resto del objeto tiene forma de la API de Brevo y acá no sirve.
  const mensaje = construirMensaje(
    entrada,
    process.env.GMAIL_USER!,
    process.env.GMAIL_SENDER_NAME ?? 'EasyEventQR',
  )

  try {
    // El QR va ADJUNTO con CID, no como data URL: Gmail bloquea las
    // imágenes `data:` y el QR llegaba roto. El botón "Ver mi entrada"
    // del HTML queda como fallback por si el cliente no muestra el adjunto.
    const base64 = entrada.imagenQr.includes(',') ? entrada.imagenQr.split(',').slice(1).join(',') : entrada.imagenQr
    await obtenerTransporte().sendMail({
      from: `"${process.env.GMAIL_SENDER_NAME ?? 'EasyEventQR'}" <${process.env.GMAIL_USER}>`,
      to: mensaje.to[0].email,
      subject: mensaje.subject,
      html: mensaje.htmlContent,
      attachments: [
        {
          filename: 'entrada-qr.png',
          content: Buffer.from(base64, 'base64'),
          contentType: 'image/png',
          cid: 'qr-entrada',
        },
      ],
    })
    return { enviado: true, transporte: 'smtp' }
  } catch (error) {
    // Auth mal ( App Password inválida o 2FA apagado), red caída, Gmail
    // caído. Mismo criterio que antes: se registra y se sigue, la
    // reserva ya está escrita. El texto del error de nodemailer dice
    // la causa real (EAUTH, ETIMEDOUT, ESOCKET...).
    console.error(
      `[mail] no se pudo mandar a ${entrada.destinatario}: ${
        error instanceof Error ? error.message : 'error desconocido'
      }`,
    )
    return { enviado: false, transporte: 'ninguno', motivo: 'smtp' }
  }
}

/**
 * El transporte de desarrollo.
 *
 * Imprime el QR en la terminal como un data URL, que es largo y feo, y
 * también la URL del QR, que es lo que hay que abrir a mano para probar
 * la validación. El log de Vercel con `vercel dev` muestra todo esto.
 */
function registrarEnConsola(entrada: EntradaDelMail): ResultadoEnvio {
  const { evento, destinatario, urlQr, imagenQr } = entrada
  console.log(
    [
      '',
      '========== MAIL (transporte de consola) ==========',
      `Para:       ${destinatario}`,
      `Evento:     ${evento.nombre}`,
      `Cuándo:     ${evento.fechaIso}`,
      `Dónde:      ${evento.lugar}`,
      `QR:         ${urlQr}`,
      `Imagen:     ${imagenQr.slice(0, 60)}... (${imagenQr.length} caracteres)`,
      '==================================================',
      '',
    ].join('\n'),
  )
  return { enviado: true, transporte: 'consola' }
}
