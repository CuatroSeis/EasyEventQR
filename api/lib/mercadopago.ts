/**
 * Cliente Mercado Pago simulado para MVP.
 *
 * En el MVP no usamos MP real: simulamos la creación de preference
 * y la verificación del webhook. Cuando se pase a producción,
 * se reemplaza este archivo por el SDK real de Mercado Pago.
 */

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

const MOCK_PAYMENTS = new Map<string, {
  preferenceId: string
  status: 'pending' | 'approved' | 'rejected'
  externalReference: string
}>()

/**
 * Crea una preferencia de pago simulada.
 * En producción: POST a https://api.mercadopago.com/checkout/preferences
 */
export async function crearPreferenceMP(
  externalReference: string,
  _amount: number,
  _description: string,
  _backUrls: { success: string; failure: string; pending: string }
): Promise<PreferenceResponse> {
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
 * En producción: valida HMAC SHA256 con MERCADOPAGO_WEBHOOK_SECRET.
 * Aquí siempre retorna true (mock).
 */
export function verificarFirmaMP(
  _signature: string | undefined,
  _requestId: string | undefined,
  _body: string
): boolean {
  // Mock: siempre válido
  return true
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
  // Buscar en nuestro mock por paymentId
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