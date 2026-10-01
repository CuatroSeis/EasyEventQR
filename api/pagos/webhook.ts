import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getDb } from '../lib/firebase-admin.js'
import { FieldValue } from 'firebase-admin/firestore'
import { verificarFirmaMP, actualizarEstadoPagoMock, consultarPagoMP } from '../lib/mercadopago.js'
import type { Registro } from '../../src/shared/types.js'

/**
 * POST /api/pagos/webhook
 *
 * Recibe notificaciones de Mercado Pago (simulado).
 * Verifica firma, consulta el pago y actualiza la reserva si fue aprobado.
 *
 * En MP real, el body trae: { action: 'payment.created', data: { id: 'payment_id' }, type: 'payment' }
 * En nuestro mock, el query trae: ?preference_id=xxx&payment_id=xxx&external_reference=xxx&status=approved
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
  }

  // En producción: verificar firma del header x-signature + x-request-id
  const signature = req.headers['x-signature'] as string | undefined
  const requestId = req.headers['x-request-id'] as string | undefined
  const rawBody = JSON.stringify(req.body)

  if (!verificarFirmaMP(signature, requestId, rawBody)) {
    console.warn('[pagos/webhook] Firma inválida')
    return res.status(400).json({ ok: false, error: 'Firma inválida' })
  }

  // En nuestro mock, los parámetros vienen en query string (simulación de redirect de MP)
  const { preference_id, payment_id, external_reference, status } = req.query as {
    preference_id?: string
    payment_id?: string
    external_reference?: string
    status?: 'approved' | 'rejected' | 'pending'
  }

  const preferenceId = preference_id
  const paymentId = payment_id
  const registroId = external_reference

  if (!preferenceId || !registroId) {
    return res.status(400).json({ ok: false, error: 'Faltan parámetros requeridos' })
  }

  try {
    const db = getDb()

    // Consultar pago en MP (mock)
    const pagoInfo = await consultarPagoMP(paymentId || '')
    const estadoPago = pagoInfo?.status || status || 'pending'

    if (estadoPago !== 'approved') {
      // Solo procesamos si está aprobado
      if (estadoPago === 'rejected') {
        // Actualizar registro a rechazado
        await db.collection('registros').doc(registroId).update({
          'pago.estado': 'rechazado',
          estado: 'rechazado',
        })
        console.log(`[pagos/webhook] Pago rechazado para registro ${registroId}`)
      }
      return res.status(200).json({ ok: true, mensaje: `Pago ${estadoPago}` })
    }

    // Pago aprobado: actualizar registro en transacción para decrementar cupo si es necesario
    // (el cupo ya se reservó al crear el registro, solo cambiamos estado)
    const refRegistro = db.collection('registros').doc(registroId)
    const snapRegistro = await refRegistro.get()

    if (!snapRegistro.exists) {
      console.error(`[pagos/webhook] Registro ${registroId} no encontrado`)
      return res.status(404).json({ ok: false, error: 'Registro no encontrado' })
    }

    const registro = snapRegistro.data() as Registro

    if (registro.pago?.estado === 'pagado') {
      // Idempotencia: ya procesado
      return res.status(200).json({ ok: true, mensaje: 'Pago ya procesado' })
    }

    // Actualizar registro: pago aprobado + estado aprobado
    await refRegistro.update({
      'pago.estado': 'pagado',
      'pago.fechaPago': FieldValue.serverTimestamp(),
      estado: 'aprobado',
    })

    // Actualizar mock
    actualizarEstadoPagoMock(preferenceId, 'approved')

    console.log(`[pagos/webhook] Pago aprobado para registro ${registroId}`)

    // TODO: Reenviar mail con QR (Fase 6)
    // await reenviarMailConQR(registroId)

    return res.status(200).json({ ok: true, mensaje: 'Pago aprobado y reserva confirmada' })
  } catch (error) {
    console.error('[pagos/webhook] error:', error)
    return res.status(500).json({ ok: false, error: 'Error procesando webhook' })
  }
}