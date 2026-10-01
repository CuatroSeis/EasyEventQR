import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getDb } from '../lib/firebase-admin.js'
import { crearPreferenceMP } from '../lib/mercadopago.js'
import type { Registro } from '../../src/shared/types.js'

/**
 * POST /api/pagos/preference
 *
 * Crea una preferencia de pago en Mercado Pago (simulado).
 * Requiere: registroId (para vincular el pago a la reserva).
 *
 * Body: { registroId: string }
 * Response: { ok: true, init_point: string, preferenceId: string }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
  }

  const { registroId } = req.body as { registroId?: string }

  if (!registroId) {
    return res.status(400).json({ ok: false, error: 'Falta registroId' })
  }

  try {
    const db = getDb()

    // Obtener el registro
    const snapRegistro = await db.collection('registros').doc(registroId).get()
    if (!snapRegistro.exists) {
      return res.status(404).json({ ok: false, error: 'Reserva no encontrada' })
    }

    const registro = snapRegistro.data() as Registro

    // Verificar que esté pendiente de pago
    if (!registro.pago?.requerido || registro.pago.estado !== 'pendiente') {
      return res.status(400).json({ ok: false, error: 'Esta reserva no requiere pago o ya fue procesada' })
    }

    // Obtener el evento para el monto y descripción
    const snapEvento = await db.collection('eventos').doc(registro.eventoId).get()
    if (!snapEvento.exists) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' })
    }

    const evento = snapEvento.data()!
    const monto = evento.precioEntrada ?? 0

    // externalReference = "registroId" para vincular webhook -> reserva
    const externalReference = registroId

    const baseUrl = process.env.APP_URL || 'https://easyeventqr.vercel.app'
    const backUrls = {
      success: `${baseUrl}/pago/exito?registroId=${registroId}`,
      failure: `${baseUrl}/pago/fallo?registroId=${registroId}`,
      pending: `${baseUrl}/pago/pendiente?registroId=${registroId}`,
    }

    const preference = await crearPreferenceMP(
      externalReference,
      monto,
      `Entrada para ${evento.nombre}`,
      backUrls
    )

    return res.status(201).json({
      ok: true,
      init_point: preference.init_point,
      preferenceId: preference.id,
    })
  } catch (error) {
    console.error('[pagos/preference] error:', error)
    return res.status(500).json({ ok: false, error: 'No se pudo crear la preferencia de pago' })
  }
}