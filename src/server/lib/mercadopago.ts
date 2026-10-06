/**
 * Cliente Mercado Pago.
 *
 * Hay dos modos, y cuál está activo lo decide `MERCADOPAGO_SIMULADO`:
 *
 *   - `MERCADOPAGO_SIMULADO=true`: no se toca Mercado Pago. La preferencia
 *     es inventada y devuelve una URL a `/pago/simulado`, que es una
 *     pantalla de checkout falsa donde se aprieba o se rechaza a mano.
 *     Sirve para demo y para probar el circuito entero (QR, mail,
 *     check-in) sin gastar un peso.
 *
 *   - Sin la variable (o `false`): los endpoints de pago se niegan a
 *     servir. No es que "no esté configurado Mercado Pago": es que este
 *     archivo NO tiene el SDK real, y fingir que sí lo tiene sería peor.
 *
 * POR QUÉ EL MODO SIMULADO ESTÁ APAGADO POR DEFECTO
 *
 * La pantalla simulada aprueba pagos desde el navegador. Si eso quedara
 * prendido en producción, cualquiera que tuviera el link de una reserva
 * podría marcarse su propia entrada como pagada con un clic. Como no hay
 * plata real de por medio el daño es bajo, pero el ticket gratis no lo es:
 * es el producto entero.
 *
 * Por eso no se decide en el código si "estamos en dev". Se decide con una
 * variable que alguien tiene que prender a propósito, y apagada nadie
 * puede crear preferencias ni disparar webhooks.
 */

/**
 * El modo simulado tiene que estar prendido EXPLÍCITAMENTE.
 *
 * Se compara contra el string exacto 'true' a propósito, y no con un
 * `Boolean(process.env.X)`, porque `Boolean('false')` es `true`: un
 * `MERCADOPAGO_SIMULADO=false` en el panel de Vercel prendería la
 * simulación en vez de apagarla.
 */
export function simulacionActiva(): boolean {
  return process.env.MERCADOPAGO_SIMULADO === 'true'
}

/**
 * ¿Hay Mercado Pago real configurado?
 *
 * Con `MERCADOPAGO_ACCESS_TOKEN` puesto y sin el flag de simulación, los
 * endpoints de pago salen contra la API de verdad. Sin token ni flag: 501,
 * porque fingir que hay algo que no hay es peor que negarse.
 */
export function modoRealActivo(): boolean {
  return !simulacionActiva() && Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)
}

/** ¿El checkout funciona en cualquiera de los dos modos? */
export function pagosDisponibles(): boolean {
  return simulacionActiva() || modoRealActivo()
}

export interface PreferenceResponse {
  id: string
  init_point: string
  sandbox_init_point: string
}

export interface WebhookNotification {
  action: 'payment.created' | 'payment.updated'
  data: {
    id: string
  }
  type: 'payment'
}

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Pagos simulados en memoria.
 *
 * OJO con esto, porque es una trampa de serverless y no creo que quede
 * claro al leerlo: en Vercel cada invocación puede caer en una instancia
 * distinta de la función, y el contenedor se recicla. Un `Map` de módulo
 * NO es un store: la preferencia que se crea en un request casi seguro no
 * está en el map cuando llega el webhook del siguiente.
 *
 * Por eso el webhook NO depende de este map para decidir (usa el `status`
 * del query, que sí viaja), y `consultarPagoMP` devuelve `null` casi
 * siempre en producción sin romper nada.
 *
 * La fuente de verdad del estado de un pago es el documento del registro
 * en Firestore, que sí persiste. Este map sirve para el desarrollo local,
 * donde el proceso es uno solo y dura.
 */
const MOCK_PAYMENTS = new Map<string, {
  preferenceId: string
  status: 'pending' | 'approved' | 'rejected'
  externalReference: string
}>()

/**
 * Crea una preferencia de pago SIMULADA.
 *
 * `init_point` NO es Mercado Pago: es una URL de esta misma app que
 * apunta a la pantalla de checkout falsa. En el SDK real esto es un
 * `POST https://api.mercadopago.com/checkout/preferences` con el token de
 * acceso, y lo que vuelve es una URL en `mercadopago.com`.
 *
 * Los parámetros `_amount`, `_description` y `_backUrls` se reciben y no
 * se usan, y a propósito: firmarlos acá y no usarlos es lo que hace que
 * cambiar a MP real sea SÓLO cambiar esta función, sin tocar su firma.
 * El importe real se valida contra Firestore antes de llegar acá.
 */
export async function crearPreferenceMP(
  externalReference: string,
  amount: number,
  description: string,
  backUrls: { success: string; failure: string; pending: string }
): Promise<PreferenceResponse> {
  if (modoRealActivo()) {
    // Import dinámico: `mercadopago` es pesado y sólo se empaqueta en la
    // función que lo usa. Mismo patrón que `getAdminAuth()`.
    const { MercadoPagoConfig, Preference } = await import('mercadopago')
    const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
    const preference = new Preference(client)
    const res = await preference.create({
      body: {
        items: [{ id: externalReference, title: description, quantity: 1, unit_price: amount }],
        external_reference: externalReference,
        back_urls: backUrls,
        auto_return: 'approved',
        notification_url: process.env.APP_URL
          ? `${process.env.APP_URL}/api/pagos/webhook`
          : undefined,
      },
    })
    return {
      id: res.id ?? externalReference,
      init_point: res.init_point ?? '',
      sandbox_init_point: res.sandbox_init_point ?? '',
    }
  }

  // Modo simulado (lo demás de la función, sin cambios).
  const preferenceId = `pref_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  MOCK_PAYMENTS.set(preferenceId, {
    preferenceId,
    status: 'pending',
    externalReference,
  })

  const baseUrl = process.env.APP_URL || 'https://easyeventqr.vercel.app'

  // En sandbox, MP redirige a backUrls con query params: ?payment_id=...&status=...&external_reference=...
  const initPoint = `${baseUrl}/pago/simulado?preference_id=${preferenceId}&payment_id=${paymentId}&external_reference=${externalReference}`

  return {
    id: preferenceId,
    init_point: initPoint,
    sandbox_init_point: initPoint,
  }
}

/**
 * Verifica la firma del webhook de Mercado Pago.
 *
 * Es el mecanismo REAL de MP, implementado con `timingSafeEqual` para no
 * filtrar el secreto por tiempo de respuesta. Antes esta función
 * devolvía `true` siempre, con un comentario que decía "mock": eso no es
 * un mock, es una firma que no verifica nada, y en producción el
 * webhook aceptaba el primer POST que llegara.
 *
 * El header `x-signature` de MP viene así:
 *
 *     ts=1700000000,v1=<hmac hex>
 *
 * y el HMAC es sobre el manifiesto:
 *
 *     id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * con el `MERCADOPAGO_WEBHOOK_SECRET` como clave. Los dos timestamp son
 * los mismos del header, y `data.id` viene del cuerpo.
 *
 * Devuelve `false` si falta el secreto: sin secreto no se puede verificar
 * nada, y un "verificador" que aprueba cuando no tiene con qué verificar
 * es un agujero con nombre de función.
 */
export function verificarFirmaMP(
  signature: string | undefined,
  requestId: string | undefined,
  dataId: string | undefined,
): boolean {
  const secreto = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (!secreto) return false
  if (!signature || !requestId || !dataId) return false

  const partes = new Map(
    signature.split(',').map((p) => {
      const [k, ...resto] = p.split('=')
      return [k.trim(), resto.join('=').trim()] as const
    }),
  )

  const ts = partes.get('ts')
  const v1 = partes.get('v1')
  if (!ts || !v1) return false

  // Ventana de 5 minutos. Sin esto, una firma capturada sirve para
  // siempre y el "secreto" deja de ser una credencial temporaria.
  const ahora = Math.floor(Date.now() / 1000)
  const edad = Math.abs(ahora - Number(ts))
  if (!Number.isFinite(edad) || edad > 300) return false

  const manifiesto = `id:${dataId};request-id:${requestId};ts:${ts};`
  const esperado = createHmac('sha256', secreto).update(manifiesto).digest('hex')

  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(v1, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Simula la consulta de un pago en MP.
 * En producción: GET https://api.mercadopago.com/v1/payments/{id}
 */
export async function consultarPagoMP(paymentId: string): Promise<{
  id: string
  status: 'pending' | 'approved' | 'rejected'
  external_reference: string
} | null> {
  if (modoRealActivo()) {
    const { MercadoPagoConfig, Payment } = await import('mercadopago')
    const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN! })
    const payment = new Payment(client)
    try {
      const res = await payment.get({ id: paymentId })
      return {
        id: String(res.id ?? paymentId),
        status: (res.status as 'pending' | 'approved' | 'rejected') ?? 'pending',
        external_reference: res.external_reference ?? '',
      }
    } catch {
      return null
    }
  }

  // Modo simulado.
  for (const [, payment] of MOCK_PAYMENTS) {
    if (payment.preferenceId.includes(paymentId.replace('pay_', ''))) {
      return {
        id: paymentId,
        status: payment.status,
        external_reference: payment.externalReference,
      }
    }
  }
  return null
}

/**
 * Actualiza el estado de un pago simulado (para testing via webhook).
 */
export function actualizarEstadoPagoMock(preferenceId: string, status: 'approved' | 'rejected'): boolean {
  const payment = MOCK_PAYMENTS.get(preferenceId)
  if (!payment) return false
  payment.status = status
  return true
}

/**
 * Obtiene un pago mock por externalReference (eventoId + registroId).
 */
export function obtenerPagoPorReferencia(externalReference: string) {
  for (const [prefId, payment] of MOCK_PAYMENTS) {
    if (payment.externalReference === externalReference) {
      return { ...payment, preferenceId: prefId }
    }
  }
  return null
}