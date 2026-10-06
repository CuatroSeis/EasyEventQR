import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getDb } from '../src/server/lib/firebase-admin.js'
import { FieldValue } from 'firebase-admin/firestore'
import type { Transaction } from 'firebase-admin/firestore'
import { esFormatoToken, hashearToken } from '../src/server/lib/qr.js'
import type { Registro } from '../src/shared/types.js'
import { capturarError } from '../src/server/lib/sentry.js'

/**
 * La forma en que responde un token inválido.
 *
 * `ok: true` con `valido: false` a propósito, y no un 404.
 */
interface RespuestaValidacion {
  ok: true
  valido: boolean
  motivo: string
  eventoId: string | null
}

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

/**
 * GET /api/validar?q=<token>&eventoId=<id> — ¿este código sirve?
 *
 * ES LA FUNCIÓN DE SOLO LECTURA.
 *
 * La validación de verdad (marcar `usado`, tocar la fecha) es POST /api/validar.
 *
 * Responde:
 *   - el token tiene el formato correcto
 *   - existe una reserva con esa huella
 *   - esa reserva es del evento que se está mostrando
 *   - no está anulada
 */
async function handleValidarQr(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (!esFormatoToken(tokenDe(req.query.t))) {
    return res.status(200).json(noValido('Ese código no es válido.'))
  }

  try {
    const db = getDb()

    const snap = await db.collection('registros').doc(hashearToken(tokenDe(req.query.t))).get()

    if (!snap.exists) {
      return res.status(200).json(noValido('Ese código no existe.'))
    }

    const registro = snap.data() as Registro

    if (registro.estado === 'rechazado') {
      return res.status(200).json(noValido('Esta entrada fue anulada.'))
    }

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
 * POST /api/validar
 *
 * Valida y marca un QR como usado de forma atómica.
 * Body: { token: string, eventoId: string }
 *
 * Usa transacción para evitar race conditions:
 * - Lee el registro
 * - Si ya está usado → error
 * - Si no está usado → marca usado: true, fechaUso: now
 *
 * Response: { ok: true, evento: string, asistente: string, usado: boolean }
 */
async function handleValidarUso(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
  }

  const { token, eventoId } = req.body as { token?: string; eventoId?: string }

  if (!token || !eventoId) {
    return res.status(400).json({ ok: false, error: 'Faltan token o eventoId' })
  }

  // Mismo filtro que el GET: no tiene que ver si el token EXISTE, solo que
  // tenga la forma que `generarToken()` produce. Sin esto, un token con la
  // forma de un id de Firestore hacía 32 bytes de SHA-256 para terminar
  // siempre en el mismo 404.
  if (!esFormatoToken(token)) {
    return res.status(404).json({ ok: false, error: 'Código no válido' })
  }

  try {
    const db = getDb()

    const resultado = await db.runTransaction(async (tx: Transaction) => {
      // El doc se llama por el SHA-256 del token, NO por el token.
      //
      // Antes se usaba `doc(token)` y eso rompía el escáner de la puerta
      // siempre: el token es aleatorio de 192 bits y lo que se guarda es su
      // huella, así que buscar por el token en claro no encontraba nunca
      // nada y toda entrada daba "Código no válido". El GET de más arriba
      // ya hasheaba; ahora los dos caminos hashean y hay una sola manera
      // de encontrar un registro.
      const refRegistro = db.collection('registros').doc(hashearToken(token))
      const snapRegistro = await tx.get(refRegistro)

      if (!snapRegistro.exists) {
        throw new Error('REGISTRO_NO_EXISTE')
      }

      const registro = snapRegistro.data()!

      // Verificar que pertenece al evento correcto
      if (registro.eventoId !== eventoId) {
        throw new Error('EVENTO_INCORRECTO')
      }

      // Verificar si ya fue usado
      if (registro.usado) {
        throw new Error('YA_USADO')
      }

      // Verificar estado de la reserva
      if (registro.estado !== 'aprobado' && registro.pago?.estado !== 'pagado') {
        throw new Error('RESERVA_NO_VALIDA')
      }

      // Marcar como usado
      await tx.update(refRegistro, {
        usado: true,
        fechaUso: FieldValue.serverTimestamp(),
      })

      // Obtener nombre del evento para la respuesta
      const snapEvento = await tx.get(db.collection('eventos').doc(eventoId))
      const evento = snapEvento.data()!

      return {
        evento: evento.nombre || 'Evento',
        asistente: registro.nombre,
        usado: true,
      }
    })

    return res.status(200).json({ ok: true, ...resultado })
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case 'REGISTRO_NO_EXISTE':
          return res.status(404).json({ ok: false, error: 'Código no válido' })
        case 'EVENTO_INCORRECTO':
          return res.status(400).json({ ok: false, error: 'Este código no corresponde al evento' })
        case 'YA_USADO':
          return res.status(409).json({ ok: false, error: 'Este código ya fue usado', usado: true })
        case 'RESERVA_NO_VALIDA':
          return res.status(400).json({ ok: false, error: 'La reserva no está confirmada' })
      }
    }
    await capturarError(error, { ruta: '[validar-uso]' })
    return res.status(500).json({ ok: false, error: 'Error validando el código' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  // GET = validar QR (solo lectura)
  if (req.method === 'GET') {
    return handleValidarQr(req, res)
  }

  // POST = validar uso (transacción atómica)
  if (req.method === 'POST') {
    return handleValidarUso(req, res)
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Solo se acepta GET o POST' })
}