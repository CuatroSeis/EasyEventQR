/**
 * De dónde sale la URL pública del QR.
 *
 * MÓDULO HOJA A PROPÓSITO: ver el comentario de api/lib/qr.ts sobre por
 * qué los módulos de api/lib/ no se importan entre sí.
 *
 * PUREO, Y POR QUÉ IMPORTA QUE LO SEA
 *
 * La URL del QR es la mitad de la entrada: si este archivo compone mal
 * una URL, el QR escaneado lleva a `/q/undefined` y el asistente llega a
 * una pantalla de error, sin aviso en ningún lado. Y la forma de armarla
 * depende de cabeceras de proxy, que son imposibles de reproducir en un
 * test sin fabricar un request entero.
 *
 * Recibo las cabeceras como un objeto plano y devuelvo un string. Eso
 * permite testear los cuatro casos raros (preview, producción, sin
 * cabeceras, cabeceras mentirosas) con tres líneas cada uno, sin
 * `VercelRequest` ni `@vercel/node` en el medio.
 */

/** Las cabeceras que alcanzan, en minúsculas. */
export type Cabeceras = Record<string, string | string[] | undefined>

/**
 * `x-forwarded-for` puede ser una cadena con varios saltos.
 *
 * El primero es el que puso el cliente y el último es el proxy de Vercel.
 * Se usa el primero porque es el único que el cliente no controla por
 * atrás: si se usara el último, un atacante que mandara su propio
 * `x-forwarded-for` elegiría qué documento del limitador quiere pisar, y
 * con eso esquivaría el límite mandando cualquier cadena.
 */
function primeraIp(cabecera: string | string[] | undefined): string | null {
  const valor = Array.isArray(cabecera) ? cabecera[0] : cabecera
  if (typeof valor !== 'string') return null
  const primera = valor.split(',')[0]?.trim()
  if (!primera) return null
  // Una IP de IPv6 entre corchetes: [::1]
  const limpia = primera.startsWith('[') ? (primera.slice(1).split(']')[0] ?? '') : primera
  return limpia || null
}

/**
 * La IP del visitante, o null si no se puede saber.
 *
 * El orden de las cabeceras es el que dice Vercel: en un despliegue real
 * `x-vercel-forwarded-for` la pone la plataforma y no se puede falsear
 * desde el exterior, así que es la fuente de verdad. Las otras dos están
 * para `vercel dev` y para probar con curl.
 */
export function ipDelVisitante(cabeceras: Cabeceras): string | null {
  return (
    primeraIp(cabeceras['x-vercel-forwarded-for']) ??
    primeraIp(cabeceras['x-forwarded-for']) ??
    primeraIp(cabeceras['x-real-ip'])
  )
}

/**
 * El origen público de la app, sin barra final.
 *
 * `APP_URL` gana si está, porque en producción es la única fuente
 * confiable: el `Host` lo manda el cliente y un atacante puede mandar
 * cualquiera. Con `APP_URL` en las variables de Vercel la URL del QR es
 * siempre la buena, y el `Host` es sólo el plan B de `vercel dev` y de un
 * deploy sin la variable.
 */
export function resolverBasePublica(
  cabeceras: Cabeceras,
  entorno: { APP_URL?: string; VERCEL_URL?: string } = {},
): string {
  if (entorno.APP_URL) return sinBarra(entorno.APP_URL)

  // VERCEL_URL es el dominio del despliegue actual: en un preview es el
  // del preview, que es justo lo que hay que usar.
  if (entorno.VERCEL_URL) return `https://${sinBarra(entorno.VERCEL_URL)}`

  const host = cabeceraComoTexto(cabeceras.host)
  if (!host) return ''

  // El protocolo se deduce de la cabecera del proxy y no de un
  // forwarded-proto arbitrario: sin https, el QR de un despliegue
  // proxificado es un http y el cliente de correo lo bloquea.
  const protocolo = cabeceraComoTexto(cabeceras['x-forwarded-proto']) === 'http' ? 'http' : 'https'
  return `${protocolo}://${sinBarra(host)}`
}

/**
 * La URL completa del QR de un token.
 *
 * El `eventoId` va en la query, y no en la ruta, por dos razones. Una:
 * el token es el secreto y ya ocupa la ruta; el evento no es secreto y no
 * necesita un segmento más. Dos, y la importante: al validar, el
 * servidor puede exigir que la reserva sea de ESE evento, así que un QR
 * del evento A no valida en la pantalla del evento B. Sin esto, el único
 * control es que quien escanea mire la pantalla de la puerta.
 *
 * Sin `eventoId` la URL sigue siendo válida: el validador acepta el token
 * solo. Por eso el parámetro es opcional en vez de obligatorio, y no
 * rompe ningún QR emitido.
 */
export function urlQrDe(token: string, base: string, eventoId?: string): string {
  const baseLimpia = sinBarra(base)
  const url = `${baseLimpia}/q/${token}`
  // Se encodea igual: el patrón de ids de Firestore lo acepta sin
  // escapear, pero no hace falta confiar en que todos los ids históricos
  // lo cumplan para armar una URL.
  return eventoId ? `${url}?eventoId=${encodeURIComponent(eventoId)}` : url
}

function cabeceraComoTexto(valor: string | string[] | undefined): string | null {
  const texto = Array.isArray(valor) ? valor[0] : valor
  return typeof texto === 'string' && texto.trim() ? texto.trim() : null
}

function sinBarra(url: string): string {
  return url.trim().replace(/\/+$/, '')
}
