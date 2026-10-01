import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getDb } from './lib/firebase-admin.js'
import { FieldValue } from 'firebase-admin/firestore'

/**
 * POST /api/validar-uso
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
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
  }

  const { token, eventoId } = req.body as { token?: string; eventoId?: string }

  if (!token || !eventoId) {
    return res.status(400).json({ ok: false, error: 'Faltan token o eventoId' })
  }

  try {
    const db = getDb()

    const resultado = await db.runTransaction(async (tx) => {
      const refRegistro = db.collection('registros').doc(token)
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
    console.error('[validar-uso] error:', error)
    return res.status(500).json({ ok: false, error: 'Error validando el código' })
  }
}