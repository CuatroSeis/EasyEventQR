/**
 * El mail de la entrada, armado como un objeto y sin enviar nada.
 *
 * MÓDULO HOJA A PROPÓSITO: ver el comentario de api/lib/qr.ts sobre por
 * qué los módulos de api/lib/ no se importan entre sí.
 *
 * POR QUÉ ESTE ARCHIVO NO HACE UNA LLAMADA HTTP Y ES EL MÓDULO MÁS
 * IMPORTANTE DE LA FASE
 *
 * El mail es la única parte del flujo que nadie puede verificar en un
 * test end-to-end sin mandar un mail de verdad, y sin embargo
 * es donde se decide si el token en claro llega a su destino. Por eso el
 * armado del mensaje está en una función pura que no tiene ni la clave de
 * la API ni un `fetch`: el test le pasa una imagen QR falsa y mira lo que
 * sale, y lo que sale es byte por byte lo que va a mandar el endpoint.
 *
 * Lo que este archivo NO hace, y por qué:
 *
 *   - No manda. `api/registro.ts` llama a `enviarMail()` (SMTP, en
 *     `mail.ts`). La separación es para que un test pueda assertar sobre el
 *     contenido sin red.
 *   - No dibuja el QR. Recibe `imagenQr` ya generada en el servidor con
 *     `api/lib/qr.ts`, para no tener aquí una dependencia de `qrcode`.
 *   - No lee Firestore. Recibe lo mínimo del evento por parámetro.
 */

/** Lo mínimo del evento que necesita el mail. Deliberadamente poco. */
export interface DatosParaElMail {
  eventoId: string
  nombre: string
  /** Ya viene como string ISO: el mail no formatea fechas de Firestore. */
  fechaIso: string
  lugar: string
  /** `textoConfirmacion` del evento, o null. */
  textoConfirmacion: string | null
  /** El color primario del evento, para pintar el botón. */
  colorPrimario: string | null
}

export interface EntradaDelMail {
  /** A quién le mandamos el mail. */
  destinatario: string
  /** El nombre del asistente, para el saludo. */
  nombreAsistente: string
  /** La URL que codifica el QR, con el token en claro adentro. */
  urlQr: string
  /** La misma URL como data URL PNG, para que se vea sin abrir nada. */
  imagenQr: string
  evento: DatosParaElMail
}

/**
 * El mensaje listo para mandar: destinatario, asunto y HTML.
 *
 * El remitente lo pone el transporte (`mail.ts`), no va acá.
 */
export interface MensajeMail {
  sender: { name: string; email: string }
  to: Array<{ email: string; name: string }>
  subject: string
  htmlContent: string
  tags: Array<{ name: string }>
}

const NOMBRE_REMITENTE = 'EasyEventQR'

/**
 * Escapa texto para poder meterlo en el HTML del mail.
 *
 * `textoConfirmacion` lo escribe el organizador y `lugar` también. Un
 * mail es un documento HTML que un cliente de correo va a renderizar, y
 * un `<script>` o un `<a href="javascript:...">` adentro llega a
 * ejecutarse en algunos clientes. El QR no se ve afectado porque es un
 * data URL que genera el servidor.
 *
 * Se escapan los cinco caracteres que importan para HTML y no se
 * permiten etiquetas. Es la misma decisión que en el widget, donde el
 * nombre del evento se escribe con `textContent` y nunca con
 * `innerHTML`.
 */
function escapar(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Un color cualquiera, derivado del primario del evento o el por
 * defecto.
 *
 * El color lo eligió un organizador y llega a un atributo `style`. Un
 * `colorPrimario` con un `;` o un `url(...)` inyectaría CSS. La
 * validación de hexadecimal ya la hace `aplicarTema()` del lado del
 * cliente, pero acá el HTML lo renderiza un cliente de correo que no
 * pasó por esa función, así que se revalida en el borde donde importa.
 */
function colorSeguro(color: string | null, porDefecto: string): string {
  return color && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim()) ? color.trim() : porDefecto
}

/**
 * La fecha en castellano, sin `toLocaleDateString`.
 *
 * `toLocaleDateString` depende del locale del runtime, y el de una
 * función serverless puede no tener los datos de es-AR: el resultado
 * sería "Invalid Date" o una fecha en inglés dentro de un mail en
 * castellano. El formato se arma a mano.
 */
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function fechaLegible(fechaIso: string): string {
  const fecha = new Date(fechaIso)
  if (Number.isNaN(fecha.getTime())) return ''
  const dia = fecha.getDate()
  const mes = MESES[fecha.getMonth()] ?? ''
  const horas = String(fecha.getHours()).padStart(2, '0')
  const minutos = String(fecha.getMinutes()).padStart(2, '0')
  return `${dia} de ${mes}, ${horas}:${minutos}`
}

/**
 * Arma el mensaje. Puro: no lee nada, no manda nada, no sabe de dónde
 * vinieron los datos.
 *
 * Lo que hay que mirar acá, más que el texto:
 *
 *  1. `urlQr` es lo ÚNICO del mensaje que lleva el token en claro, y
 *     va una sola vez, en el atributo `href` del botón. Si algún día
 *     alguien agrega el token a otro lado del mail, ese otro lugar es
 *     una fuga hacia el historial del cliente de correo del asistente.
 *  2. No aparece el `organizadorId` ni el `plan` del organizador: el
 *     mail es la vista pública del evento.
 *  3. No aparece el email de nadie más, porque la función ni siquiera
 *     lo recibe.
 */export function construirMensaje(
  entrada: EntradaDelMail,
  remitente: string,
  nombreRemitente: string = NOMBRE_REMITENTE,
): MensajeMail {
  // `imagenQr` (data URL) ya no va en el HTML: Gmail bloquea imágenes
  // `data:` y el QR llegaba roto. El transporte la adjunta con CID
  // (`mail.ts`); acá sólo se necesita `urlQr` para el botón fallback.
  const { destinatario, nombreAsistente, urlQr, evento } = entrada

  const nombre = escapar(evento.nombre)
  const lugar = escapar(evento.lugar)
  const saludo = escapar(nombreAsistente)
  const confirmacion = evento.textoConfirmacion ? escapar(evento.textoConfirmacion) : null
  const cuando = escapar(fechaLegible(evento.fechaIso))
  const primario = colorSeguro(evento.colorPrimario, '#7c3aed')
  const idEvento = escapar(evento.eventoId)

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">

            <tr>
              <td style="background:${primario};padding:20px 24px;">
                <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.08em;color:#ffffff;text-transform:uppercase;">Entrada reservada</p>
                <h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;color:#ffffff;">${nombre}</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#0f172a;">Hola ${saludo}, tu lugar está reservado.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px;color:#334155;">
                  <tr><td style="padding:3px 0;width:80px;color:#64748b;">Cuándo</td><td style="padding:3px 0;font-weight:600;color:#0f172a;">${cuando}</td></tr>
                  <tr><td style="padding:3px 0;color:#64748b;">Dónde</td><td style="padding:3px 0;font-weight:600;color:#0f172a;">${lugar}</td></tr>
                </table>

                ${confirmacion ? `<p style="margin:0 0 20px;padding:12px 14px;background:#f8fafc;border-left:3px solid ${primario};font-size:14px;line-height:1.5;color:#334155;">${confirmacion}</p>` : ''}

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="padding:8px 0 20px;">
                      <img src="cid:qr-entrada" alt="Tu código de entrada" width="220" height="220" style="display:block;width:220px;height:220px;border:1px solid #e2e8f0;border-radius:12px;" />
                      <p style="margin:8px 0 0;font-size:12px;color:#64748b;">Mostralo en la puerta, con el brillo alto.</p>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="padding:0 0 8px;">
                      <a href="${escapar(urlQr)}" style="display:inline-block;padding:14px 28px;background:${primario};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">Ver mi entrada</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">
                  Si el botón no funciona, abrí este enlace:<br />
                  <a href="${escapar(urlQr)}" style="color:#64748b;word-break:break-all;">${escapar(urlQr)}</a>
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;">
                  Evento ${idEvento} en EasyEventQR. Guardá este mail: es la única copia de tu código.
                  Si te registraste por error, no hace falta que hagas nada.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return {
    sender: { name: nombreRemitente, email: remitente },
    to: [{ email: destinatario, name: nombreAsistente }],
    subject: `Tu entrada para ${evento.nombre}`,
    htmlContent: html,
    tags: [{ name: 'entrada' }],
  }
}
