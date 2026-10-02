import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getDb } from '@server/firebase-admin.js'
import { FieldValue } from 'firebase-admin/firestore'
import {
  crearPreferenceMP,
  verificarFirmaMP,
  actualizarEstadoPagoMock,
  consultarPagoMP,
  simulacionActiva,
} from '@server/mercadopago.js'
import type { Registro } from '../src/shared/types.js'

/**
 * Por qué los endpoints se niegan cuando `MERCADOPAGO_SIMULADO` no está.
 *
 * La pantalla simulada aprueba pagos con un botón. Si esa ruta quedara
 * abierta en producción, cualquiera con el link de una reserva se
 * marcaba su propia entrada como pagada. No se decide en el código si
 * "esto es dev": se decide con una variable que hay que prender a mano.
 *
 * El 501 es deliberado y no un 404: "no existe" sería mentira, la ruta
 * existe y está apagada a propósito.
 */
function pagosDisponibles(res: VercelResponse): boolean {
  if (simulacionActiva()) return true
  res.status(501).json({
    ok: false,
    error: 'Los pagos no están disponibles en este entorno. Mercado Pago real todavía no está integrado.',
  })
  return false
}

/**
 * POST /api/pagos/preference
 *
 * Crea una preferencia de pago en Mercado Pago (simulado).
 * Requiere: registroId (para vincular el pago a la reserva).
 *
 * Body: { registroId: string }
 * Response: { ok: true, init_point: string, preferenceId: string }
 */
async function handlePreference(req: VercelRequest, res: VercelResponse) {
  if (!pagosDisponibles(res)) return

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

/**
 * POST /api/pagos/webhook
 *
 * Recibe notificaciones de Mercado Pago (simulado).
 * Verifica firma, consulta el pago y actualiza la reserva si fue aprobado.
 *
 * En MP real, el body trae: { action: 'payment.created', data: { id: 'payment_id' }, type: 'payment' }
 * En nuestro mock, el query trae: ?preference_id=xxx&payment_id=xxx&external_reference=xxx&status=approved
 */
async function handleWebhook(req: VercelRequest, res: VercelResponse) {
  if (!pagosDisponibles(res)) return

  // Los parámetros del modo simulado vienen en el query, porque la
  // pantalla falsa "es" Mercado Pago: el botón que aprieta el visitante
  // arma la URL y la pega acá.
  const { preference_id, payment_id: paymentId, external_reference, status } = req.query as {
    preference_id?: string
    payment_id?: string
    external_reference?: string
    status?: 'approved' | 'rejected' | 'pending'
  }

  // Camino real: la firma HMAC manda y es obligatoria.
  //
  // La firma se verifica contra el `data.id` del cuerpo, que es lo que
  // dice el manifiesto de MP. En el modo simulado el cuerpo viene vacío,
  // así que no hay nada que verificar: no es que la firma "pase", es que
  // en simulación la firma no es el control de acceso. El control es el
  // flag, que está apagado por defecto.
  const signature = req.headers['x-signature'] as string | undefined
  const requestId = req.headers['x-request-id'] as string | undefined
  const dataId = (req.body as { data?: { id?: string } } | undefined)?.data?.id

  if (dataId) {
    if (!verificarFirmaMP(signature, requestId, dataId)) {
      console.warn('[pagos/webhook] Firma inválida')
      return res.status(401).json({ ok: false, error: 'Firma inválida' })
    }
  } else if (process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    // Hay secreto configurado pero el request no viene firmado: es un
    // intento de colarse por el camino que el mock dejaba abierto.
    return res.status(401).json({ ok: false, error: 'Falta la firma del webhook' })
  }

  const preferenceId = preference_id
  const registroId = external_reference || dataId

  if (!registroId) {
    return res.status(400).json({ ok: false, error: 'Faltan parámetros requeridos' })
  }

  try {
    const db = getDb()

    // Consultar el pago. Devuelve `null` casi siempre en serverless (el
    // map es de memoria, ver mercadopago.ts), y no es un problema: el
    // `status` del query es el que manda cuando la consulta no puede.
    const pagoInfo = await consultarPagoMP(paymentId ?? '')
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

    // El map en memoria casi nunca va a tener la preferencia, y por eso
    // el resultado se ignora a propósito: que devuelva `false` no puede
    // dar vuelta un pago que ya quedó confirmado en Firestore.
    if (preferenceId) actualizarEstadoPagoMock(preferenceId, 'approved')

    console.log(`[pagos/webhook] Pago aprobado para registro ${registroId}`)

    // TODO: Reenviar mail con QR (Fase 6)
    // await reenviarMailConQR(registroId)

    return res.status(200).json({ ok: true, mensaje: 'Pago aprobado y reserva confirmada' })
  } catch (error) {
    console.error('[pagos/webhook] error:', error)
    return res.status(500).json({ ok: false, error: 'Error procesando webhook' })
  }
}

/**
 * GET /api/pagos/estado?registroId=xxx
 *
 * Estado del pago de una reserva, para el polling de /pago/exito.
 *
 * Existe porque `verificarEstadoPago()` pedía `/api/registros/<id>`,
 * una ruta que el router de `api/registros.ts` nunca tuvo: sin `eventoId`
 * caía en el 400 de auth. O sea que la pantalla de pago confirmado
 * arrancaba en error y se quedaba ahí para siempre.
 *
 * DEVUELVE SOLO EL ESTADO. Sin nombre, sin email, sin evento. El que
 * llama no está autenticado (es el invitado que recién pagó, no tiene
 * sesión) y el `registroId` es adivinable, así que cualquier dato más
 * que el estado del pago sería una fuga de PII por GET. Si algún día hace
 * falta mostrar el nombre, se agrega un endpoint con el token del QR, que
 * sí es una credencial.
 */
async function handleEstado(req: VercelRequest, res: VercelResponse) {
  const { registroId } = req.query as { registroId?: string }

  if (!registroId) {
    return res.status(400).json({ ok: false, error: 'Falta registroId' })
  }

  try {
    const snap = await getDb().collection('registros').doc(registroId).get()

    if (!snap.exists) {
      // Mismo 200 con `ok: false` que el resto de la API: distinguir
      // "no existe" de "no se encontró" acá no le sirve de nada al cliente
      // y confirmaría la existencia del registro a quien pruebe ids.
      return res.status(200).json({ ok: false, error: 'Reserva no encontrada' })
    }

    return res.status(200).json({
      ok: true,
      estado: (snap.data() as Registro).pago?.estado ?? 'no_aplica',
    })
  } catch (error) {
    console.error('[pagos/estado] error:', error)
    return res.status(500).json({ ok: false, error: 'No pudimos consultar el pago' })
  }
}

/**
 * GET /api/pagos/resumen?registroId=xxx
 *
 * Lo que la pantalla simulada muestra antes de "pagar": nombre del evento,
 * fecha, importe y estado.
 *
 * No devuelve ni nombre ni email del asistente. No hay auth en esta ruta
 * y el `registroId` es adivinable, así que cualquier dato más que esto
 * sería una fuga de PII por GET. Para una pantalla de checkout alcanza con
 * esto, y el nombre del asistente ya lo tiene el propio invitado.
 *
 * El importe sale del EVENTO, no de lo que manda el cliente: si el
 * cliente dijera el precio, el botón de "pagar" sería decorativo.
 */
async function handleResumen(req: VercelRequest, res: VercelResponse) {
  if (!pagosDisponibles(res)) return

  const { registroId } = req.query as { registroId?: string }
  if (!registroId) {
    return res.status(400).json({ ok: false, error: 'Falta registroId' })
  }

  try {
    const db = getDb()
    const snapRegistro = await db.collection('registros').doc(registroId).get()
    if (!snapRegistro.exists) {
      return res.status(404).json({ ok: false, error: 'Reserva no encontrada' })
    }

    const registro = snapRegistro.data() as Registro

    // Si el evento ya no pide pago, esta pantalla no tiene sentido.
    if (!registro.pago?.requerido) {
      return res.status(400).json({ ok: false, error: 'Esta reserva no requiere pago.' })
    }

    const snapEvento = await db.collection('eventos').doc(registro.eventoId).get()
    if (!snapEvento.exists) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' })
    }
    const evento = snapEvento.data()!

    const fecha = (evento.fecha as { toDate?: () => Date }).toDate?.() ?? new Date(evento.fecha as string)

    return res.status(200).json({
      ok: true,
      evento: {
        nombre: evento.nombre,
        lugar: evento.lugar,
        fechaIso: fecha.toISOString(),
      },
      monto: evento.precioEntrada ?? 0,
      moneda: 'ARS',
      estado: registro.pago.estado,
    })
  } catch (error) {
    console.error('[pagos/resumen] error:', error)
    return res.status(500).json({ ok: false, error: 'No pudimos cargar el pago' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  // Router por path: /api/pagos/preference vs /api/pagos/webhook
  const path = req.url?.split('?')[0] || ''

  if (path.endsWith('/resumen')) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ ok: false, error: 'Solo se acepta GET' })
    }
    return handleResumen(req, res)
  }

  if (path.endsWith('/estado')) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ ok: false, error: 'Solo se acepta GET' })
    }
    return handleEstado(req, res)
  }

  if (path.endsWith('/webhook')) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
    }
    return handleWebhook(req, res)
  }

  // Default: /api/pagos/preference
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
  }
  return handlePreference(req, res)
}