import { construirMensajeBrevo, type EntradaDelMail } from './email.js'

/**
 * El transporte: el único lugar del proyecto que habla con Brevo.
 *
 * Acá hay un fetch y una variable de entorno, que es justo lo que
 * `api/lib/email.ts` no tiene. La división deja el contenido del mail
 * testeable sin red y deja este archivo, que no se puede probar sin
 * mandar un mail de verdad, reducido a una llamada HTTP.
 *
 * LA REGLA DE ESTE ARCHIVO: NUNCA TIRA.
 *
 * `enviarMail` devuelve un resultado, no lanza. La razón es el orden de
 * las operaciones en el alta: la reserva se escribe en Firestore DENTRO
 * de una transacción, y el mail se manda DESPUÉS, porque no se puede
 * meter un fetch a otro servicio dentro de una transacción de Firestore
 * sin holdear los locks. Entonces, si mandar el mail explota, la reserva
 * ya quedó escrita.
 *
 * Hay dos salidas y son malas las dos:
 *
 *   - Tirar: el endpoint devuelve 500 y el usuario cree que no se
 *     registró, pero SÍ se registró. Reintenta, entra el segundo
 *     registro, y la persona termina con dos entradas cobradas o con
 *     dos mails.
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
  | { enviado: true; transporte: 'brevo' | 'consola' }
  | { enviado: false; transporte: 'ninguno'; motivo: string }

const URL_BREVO = 'https://api.brevo.com/v3/smtp/email'

/** Lo que hay que tener para mandar de verdad. */
export function brevoConfigurado(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL)
}

/**
 * Manda el mail, o lo registra en la consola.
 *
 * Sin `BREVO_API_KEY` no tira: imprime el HTML en el log y dice que
 * salió. Es lo que permite probar el alta entera en local sin gastar un
 * envío de la cuota de Brevo ni tener la cuenta configurada, y es
 * también lo que evita que un deploy sin la variable configurada rompa el
 * alta: la reserva se guarda igual y el mail queda pendiente de reenvío.
 */
export async function enviarMail(entrada: EntradaDelMail): Promise<ResultadoEnvio> {
  if (!brevoConfigurado()) {
    return registrarEnConsola(entrada)
  }

  const mensaje = construirMensajeBrevo(
    entrada,
    process.env.BREVO_SENDER_EMAIL!,
    process.env.BREVO_SENDER_NAME,
  )

  try {
    const respuesta = await fetch(URL_BREVO, {
      method: 'POST',
      headers: {
        // OJO: la API key va en el header `api-key`, no en un Bearer y
        // no en el body. Es lo que espera /v3/smtp/email.
        'api-key': process.env.BREVO_API_KEY!,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(mensaje),
      // El alta no puede quedar colgada esperando a Brevo. Si Brevo está
      // lento, la reserva ya está escrita y el usuario igual está
      // esperando una respuesta: mejor un timeout y un reenvío después
      // que una request que muere a los 30 segundos del lado del
      // navegador.
      signal: AbortSignal.timeout(8_000),
    })

    if (!respuesta.ok) {
      // El body de Brevo dice por qué, y casi siempre es una de dos
      // cosas que hay que poder leer en el log de Vercel: el remitente
      // no está verificado (401/400) o se pasó la cuota diaria del plan
      // (402/429). Sin este texto, un 400 de Brevo es indistinguible de
      // cualquier otro error.
      const cuerpo = await respuesta.text().catch(() => '')
      console.error(
        `[mail] Brevo respondió ${respuesta.status} para ${entrada.destinatario}: ${cuerpo.slice(0, 500)}`,
      )
      return { enviado: false, transporte: 'ninguno', motivo: `Brevo ${respuesta.status}` }
    }

    return { enviado: true, transporte: 'brevo' }
  } catch (error) {
    // Timeout, DNS, Brevo caído. Mismo criterio que antes: se registra y
    // se sigue, la reserva ya está escrita.
    console.error(
      `[mail] no se pudo mandar a ${entrada.destinatario}: ${
        error instanceof Error ? error.message : 'error desconocido'
      }`,
    )
    return { enviado: false, transporte: 'ninguno', motivo: 'red' }
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
