import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getDb } from './lib/firebase-admin.js'
import { esFormatoToken, hashearToken } from './lib/qr.js'
import type { Registro } from '../src/shared/types.js'

/**
 * GET /api/validar-qr?t=<token> — ¿este código sirve?
 *
 * ES LA FUNCIÓN DE SOLO LECTURA, Y ESO ES EL DISEÑO ENTERO
 *
 * La validación de verdad (marcar `usado`, tocar la fecha, avisarle al
 * organizador) es la Fase 7, cuando haya un operador con un teléfono en la
 * puerta. Esta versión responde lo único que hace falta para probarla:
 *
 *   - el token tiene el formato correcto
 *   - existe una reserva con esa huella
 *   - esa reserva es del evento que se está mostrando
 *   - no está anulada
 *
 * Y NADA MÁS. En concreto, no marca nada. Escanear cinco veces el mismo
 * código tiene que poder hacerse sin invalidar la entrada, porque la
 * Fase 7 va a tener un botón de "ya lo usé" que es una escritura
 * explícita y con nombre.
 *
 * LO QUE NO SE DEVUELVE, Y POR QUÉ CADA COSA
 *
 *   - El email. Es el dato personal que hay en el documento. Devolverlo
 *     "para que el puerta sepa a quién buscar" es la idea detrás de
 *     mostrarlo en una pantalla compartida, y es un error: el que está
 *     parado al lado puede leerlo. El nombre tampoco va, y por el mismo
 *     motivo.
 *   - `usado` con su fecha. La fecha de uso es dato del organizador.
 *   - El nombre del evento. Ya lo sabe quien está mirando la pantalla, y
 *     si el QR se escaneó desde otro lado, se lo da el `eventoId` del
 *     request.
 *
 * O sea que la respuesta es deliberadamente escueta: dice si el código
 * sirve, y nada más que sirva para decidir eso.
 */

/** Lo que el lector necesita, y nada más. */
interface RespuestaValidacion {
  ok: true
  valido: boolean
  motivo: string
  /** Para que la pantalla diga algo. No es dato del asistente. */
  eventoId: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Nunca cacheado. Un `no-store` explícito porque la respuesta depende
  // de un documento que el Fase 7 va a cambiar, y un token que se cachea
  // en el browser queda para siempre con el veredicto viejo.
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Solo se acepta GET' })
  }

  // El formato se chequea ANTES de tocar la base. Es un filtro, no una
  // validación de seguridad: un `?t=hola` de un escáner mal apuntado se
  // responde sin gastar una lectura, que en el plan Spark es el recurso
  // más caro.
  if (!esFormatoToken(tokenDe(req.query.t))) {
    return res.status(200).json(noValido('Ese código no es válido.'))
  }

  try {
    const db = getDb()

    // Un `get`, no una query: la huella ES el ID del documento. Y no se
    // usa `getDoc` con un ID armado con el token, sino con el hash: si el
    // token se usara crudo como ID, un dump de la colección sería una
    // lista de entradas válidas.
    const snap = await db.collection('registros').doc(hashearToken(tokenDe(req.query.t))).get()

    if (!snap.exists) {
      return res.status(200).json(noValido('Ese código no existe.'))
    }

    const registro = snap.data() as Registro

    if (registro.estado === 'rechazado') {
      return res.status(200).json(noValido('Esta entrada fue anulada.'))
    }

    // El evento_id del request es opcional. Si viene, se exige que la
    // reserva sea de ese evento, para que el QR de un evento no pueda
    // validar en la pantalla de otro. Si no viene, se acepta el token solo:
    // un lector que no tiene el evento cargado igual tiene que poder
    // escanear.
    const pedido = eventoPedido(req.query.eventoId)
    if (pedido && registro.eventoId !== pedido) {
      return res.status(200).json(noValido('Ese código es de otro evento.'))
    }

    const valido = registro.estado === 'aprobado'
    return res.status(200).json({
      ok: true,
      valido,
      motivo: valido ? 'Entrada válida.' : 'Esta entrada todavía no está confirmada.',
      eventoId: registro.eventoId,
    })
  } catch (error) {
    console.error('[validar-qr]', error instanceof Error ? error.message : error)
    return res.status(500).json({ ok: false, error: 'No pudimos validar el código.' })
  }
}

/**
 * La forma en que responde un token inválido.
 *
 * `ok: true` con `valido: false` a propósito, y no un 404: el endpoint
 * responde bien HTTP y el que falla es el código, que es lo que pasó. Un
 * 404 haría que un cliente bien escrito lo trate como error de red y
 * reintente, y uno mal escrito adivine.
 *
 * El texto es el mismo para "no existe" y "tiene otra forma": si los dos
 * dieran mensajes distintos, este endpoint sería un oráculo para
 * enumerar los tokens emitidos, probando hasta que uno exista. Y los
 * tokens tienen 192 bits, así que probarlos es imposible de todas
 * maneras: la diferencia entre los dos mensajes sólo le serviría a quien
 * ya tiene una lista.
 */
function noValido(motivo: string): RespuestaValidacion {
  return { ok: true, valido: false, motivo, eventoId: null }
}

function tokenDe(bruto: string | string[] | undefined): string {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto
  return typeof valor === 'string' ? valor : ''
}

/** El evento contra el que se valida, si el que escanea lo mandó. */
function eventoPedido(bruto: string | string[] | undefined): string | null {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto
  if (typeof valor !== 'string') return null
  const id = valor.trim()
  return /^[A-Za-z0-9_-]{1,1500}$/.test(id) ? id : null
}
