import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getDb } from '../src/server/lib/firebase-admin.js'
import { FieldValue } from 'firebase-admin/firestore'
import {
  crearPreferenceMP,
  verificarFirmaMP,
  actualizarEstadoPagoMock,
  consultarPagoMP,
  pagosDisponibles as mpDisponibles,
} from '../src/server/lib/mercadopago.js'
import type { Registro, Evento } from '../src/shared/types.js'
import { capturarError } from '../src/server/lib/sentry.js'
import { rotarToken } from '../src/server/lib/rotacion.js'
import { resolverBasePublica } from '../src/server/lib/url.js'

/**
 * Sin `MERCADOPAGO_SIMULADO=true` ni `MERCADOPAGO_ACCESS_TOKEN`: 501
 * deliberado (no 404). Con la simulación prendida, cualquiera con el link
 * de una reserva se marcaría su propia entrada como pagada.
 */
function pagosDisponibles(res: VercelResponse): boolean {
  if (mpDisponibles()) return true
  res.status(501).json({
    ok: false,
    error: 'Los pagos no están disponibles en este entorno: falta MERCADOPAGO_ACCESS_TOKEN y la simulación está apagada.',
  })
  return false
}

/**
 * POST /api/pagos/preference — crea la preferencia (real o simulada).
 * Body: { registroId }. Response: { ok, init_point, preferenceId }.
 */
async function handlePreference(req: VercelRequest, res: VercelResponse) {
  if (!pagosDisponibles(res)) return

  const { registroId } = req.body as { registroId?: string }

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

    if (!registro.pago?.requerido || registro.pago.estado !== 'pendiente') {
      return res.status(400).json({ ok: false, error: 'Esta reserva no requiere pago o ya fue procesada' })
    }

    const snapEvento = await db.collection('eventos').doc(registro.eventoId).get()
    if (!snapEvento.exists) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' })
    }

    const evento = snapEvento.data()!
    const monto = evento.precioEntrada ?? 0

    // externalReference = registroId: así el webhook encuentra la reserva.
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
    await capturarError(error, { ruta: '[pagos/preference]' })
    return res.status(500).json({ ok: false, error: 'No se pudo crear la preferencia de pago' })
  }
}

/**
 * POST /api/pagos/webhook — notificación de MP (real o simulada).
 * Verifica firma, actualiza la reserva si fue aprobado y, sólo en pagos,
 * manda el mail con el QR rotado.
 */
async function handleWebhook(req: VercelRequest, res: VercelResponse) {
  if (!pagosDisponibles(res)) return

  const { preference_id, payment_id: paymentId, external_reference, status } = req.query as {
    preference_id?: string
    payment_id?: string
    external_reference?: string
    status?: 'approved' | 'rejected' | 'pending'
  }

  // Firma HMAC obligatoria en modo real. En simulado el cuerpo viene
  // vacío y no hay nada que verificar: el control ahí es el flag.
  const signature = req.headers['x-signature'] as string | undefined
  const requestId = req.headers['x-request-id'] as string | undefined
  const dataId = (req.body as { data?: { id?: string } } | undefined)?.data?.id

  if (dataId) {
    if (!verificarFirmaMP(signature, requestId, dataId)) {
      console.warn('[pagos/webhook] Firma inválida')
      return res.status(401).json({ ok: false, error: 'Firma inválida' })
    }
  } else if (process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    // Con secreto configurado, un request sin firma es un intento de colarse.
    return res.status(401).json({ ok: false, error: 'Falta la firma del webhook' })
  }

  const preferenceId = preference_id
  const registroId = external_reference || dataId

  if (!registroId) {
    return res.status(400).json({ ok: false, error: 'Faltan parámetros requeridos' })
  }

  try {
    const db = getDb()

    // En serverless el map en memoria casi nunca tiene el pago: manda
    // el `status` del query.
    const pagoInfo = await consultarPagoMP(paymentId ?? '')
    const estadoPago = pagoInfo?.status || status || 'pending'

    if (estadoPago !== 'approved') {
      if (estadoPago === 'rejected') {
        await db.collection('registros').doc(registroId).update({
          'pago.estado': 'rechazado',
          estado: 'rechazado',
        })
      }
      return res.status(200).json({ ok: true, mensaje: `Pago ${estadoPago}` })
    }

    const refRegistro = db.collection('registros').doc(registroId)
    const snapRegistro = await refRegistro.get()

    if (!snapRegistro.exists) {
      console.error(`[pagos/webhook] Registro ${registroId} no encontrado`)
      return res.status(404).json({ ok: false, error: 'Registro no encontrado' })
    }

    const registro = snapRegistro.data() as Registro

    if (registro.pago?.estado === 'pagado') {
      // Webhook reenviado: ya procesado, no reenviar el QR.
      return res.status(200).json({ ok: true, mensaje: 'Pago ya procesado' })
    }

    await refRegistro.update({
      'pago.estado': 'pagado',
      'pago.fechaPago': FieldValue.serverTimestamp(),
      estado: 'aprobado',
    })

    if (preferenceId) actualizarEstadoPagoMock(preferenceId, 'approved')

    // Sólo eventos PAGOS: al aprobarse el pago se manda el mail con el
    // QR. En los gratuitos el QR ya salió al registrarse y no hay nada
    // que reenviar (el TODO viejo pedía reenviar siempre).
    //
    // No se reusa el token del alta porque no existe en ningún lado (sólo
    // su hash): se rota, y el QR del mail de registro deja de validar,
    // que es lo correcto porque esa reserva estaba pendiente de pago.
    // Si el mail no sale, NO se rota y el pago igual queda confirmado.
    if (registro.pago?.requerido) {
      const snapEvento = await db.collection('eventos').doc(registro.eventoId).get()
      if (snapEvento.exists) {
        const rotacion = await rotarToken(db, {
          registroId,
          eventoId: registro.eventoId,
          evento: snapEvento.data() as Evento,
          base: resolverBasePublica(req.headers, process.env),
        })
        if (!rotacion.ok) {
          console.error(`[pagos/webhook] pago ok pero no se pudo mandar el QR (${rotacion.motivo})`)
        }
      }
    }

    return res.status(200).json({ ok: true, mensaje: 'Pago aprobado y reserva confirmada' })
  } catch (error) {
    await capturarError(error, { ruta: '[pagos/webhook]' })
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
    let snap = await getDb().collection('registros').doc(registroId).get()

    if (!snap.exists) {
      // Mismo 200 con `ok: false` que el resto de la API: distinguir
      // "no existe" de "no se encontró" acá no le sirve de nada al cliente
      // y confirmaría la existencia del registro a quien pruebe ids.
      return res.status(200).json({ ok: false, error: 'Reserva no encontrada' })
    }

    // Si el pago aprobado rotó el token, el id viejo es una lápida: se
    // sigue el puntero una vez en vez de decir "no encontrada" en la
    // pantalla de pago confirmado.
    const datos = snap.data() as Registro
    if (typeof datos.reemplazadoPor === 'string' && datos.reemplazadoPor) {
      snap = await getDb().collection('registros').doc(datos.reemplazadoPor).get()
      if (!snap.exists) {
        return res.status(200).json({ ok: false, error: 'Reserva no encontrada' })
      }
    }

    return res.status(200).json({
      ok: true,
      estado: (snap.data() as Registro).pago?.estado ?? 'no_aplica',
    })
  } catch (error) {
    await capturarError(error, { ruta: '[pagos/estado]' })
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
    await capturarError(error, { ruta: '[pagos/resumen]' })
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