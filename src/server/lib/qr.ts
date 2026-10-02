/**
 * El token del QR: generación, huella y dibujo.
 *
 * MÓDULO HOJA A PROPÓSITO. No importa nada relativo de `api/`, y esa es
 * la razón, no una manía de estilo:
 *
 *   - En Vercel los imports relativos de /api/ llevan extensión `.js`
 *     (ver el comentario de api/salud.ts), porque el runtime resuelve
 *     como ESM puro.
 *   - Los tests corren los archivos tal cual con el type-stripping
 *     nativo de Node, que resuelve como nodenext y NO sabe que
 *     './otro.js' significa './otro.ts'.
 *
 * O sea que un import relativo entre dos módulos de api/lib/ sería
 * imposible de testear. Los módulos hoja se esquivan el problema entero.
 * El único import relativo que sí hay en todo /api/ es el `import type`
 * hacia src/shared, y ese no es un import: `verbatimModuleSyntax` lo
 * borra en compilación, así que en runtime no existe. De ahí que
 * `src/shared/types.ts` sea la única fuente de la forma de los datos sin
 * que /api/ dependa de que el bundler de Vercel siga imports fuera de
 * la carpeta.
 */

import { createHash, randomBytes } from 'node:crypto'
import QRCode from 'qrcode'

/**
 * 24 bytes = 192 bits de entropía.
 *
 * No es que 192 bits "alcancen": es que el costo de adivinar uno es
 * 2^192 intentos, y aunque el atacante pudiera hacer un billón por
 * segundo, el universo se acaba antes. Con 16 bytes (128 bits) también
 * estaría bien; 24 deja margen de sobra sin agrandar el QR, que se
 * dibuja más chico mientras más datos lleva.
 */
const BYTES_TOKEN = 24

/**
 * Cuántos caracteres ocupa el token en base64url.
 *
 * base64url rinde 4 caracteres por cada 3 bytes, sin padding: 24 bytes
 * son exactamente 32 caracteres. El formato va en el patrón de
 * `esFormatoToken()` y en el nombre del documento, así que el número no
 * es arbitrario: cambiar BYTES_TOKEN sin cambiar esto rompe el chequeo
 * de formato para todos los tokens emitidos.
 */
const LONGITUD_TOKEN = 32

/**
 * El token EN CLARO. Viaja una sola vez: al mail del asistente.
 *
 * Nunca se guarda, nunca se registra en un log, nunca se devuelve en una
 * respuesta HTTP. Lo que llega a Firestore es `hashearToken()`.
 */
export function generarToken(): string {
  return randomBytes(BYTES_TOKEN).toString('base64url')
}

/**
 * La huella del token, en hexadecimal.
 *
 * SHA-256 sobre la cadena UTF-8. Un hash criptográfico y no un `encode`
 * cualquiera: el punto es que el token sea de un solo sentido, para que
 * un dump de la base no sirva para fabricar entradas.
 *
 * Sale en hexadecimal y no en base64url a propósito. Los IDs de
 * documento de Firestore admiten los dos, pero el hex evita cualquier
 * duda sobre qué caracteres pueden aparecer en una URL de la API de
 * Firestore y sobre cómo los escapan las librerías intermedias.
 */
export function hashearToken(token: string): string {
  return sha256Hex(token)
}

/**
 * El mismo SHA-256, con un nombre que no diga "token".
 *
 * Existe porque el limitador también necesita hashear algo, y esa cosa es
 * una IP, no un token. Que el cálculo esté en UNA función importada de acá
 * y no copiado en el endpoint es lo que garantiza que el hash del
 * limitador y el hash del token no pueden empezar a diferir: si difieren,
 * el mismo valor produce dos documentos distintos y nadie se da cuenta
 * hasta que el límite deja de limitar.
 */
export function sha256Hex(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex')
}

/**
 * El token tiene la forma que `generarToken()` produce.
 *
 * Es un filtro de formato, NO una validación de seguridad: no verifica
 * que el token exista ni que sea de este producto, y no tiene que. Está
 * para no hashear basura ni gastar una lectura de Firestore en un
 * `?t=<cualquier cosa>` que un escáner mal apuntado o un bot mandan.
 *
 * Un token con la forma correcta pero que no existe da exactamente la
 * misma respuesta que uno con la forma incorrecta: "no encontrado". Si
 * los dos casos dieran respuestas distintas, este filtro se convierte
 * en un oráculo para enumerar los tokens emitidos, que es justo lo que
 * hay que evitar.
 */
const FORMATO_TOKEN = new RegExp(`^[A-Za-z0-9_-]{${LONGITUD_TOKEN}}$`)

export function esFormatoToken(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_TOKEN.test(valor)
}

/**
 * El QR como data URL PNG, para embeberlo en el mail.
 *
 * Lo que se dibuja es una URL, no el token desnudo: la del asistente
 * apunta a /q/<token>, y el que escanea en la puerta la abre con la
 * cámara de su teléfono sin necesidad de que exista el escáner de la
 * Fase 7 todavía.
 *
 * Se genera en el servidor y no en el cliente a propósito. El QR viaja
 * dentro de un mail que arma el servidor, así que el servidor es el que
 * lo tiene que dibujar; hacerlo en el navegador dejaría el token en el
 * bundle y en el DOM de una página que el asistente puede cerrar.
 */
export async function imagenQrDe(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
}

/** Para los tests, que fijan que la longitud del token no se mueva sola. */
export const LONGITUD_TOKEN_ESPERADA = LONGITUD_TOKEN
