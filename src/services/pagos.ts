/**
 * Servicios de pagos para el frontend.
 */
const APP_URL = import.meta.env.VITE_APP_URL || 'https://easyeventqr.vercel.app'

export interface PreferenceResponse {
  ok: boolean
  init_point?: string
  preferenceId?: string
  error?: string
}

/**
 * Crea una preferencia de pago para una reserva.
 */
export async function crearPreferenciaPago(registroId: string): Promise<PreferenceResponse> {
  try {
    const resp = await fetch(`${APP_URL}/api/pagos/preference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registroId }),
    })

    const data = await resp.json()

    if (!resp.ok || !data.ok) {
      return { ok: false, error: data.error || 'No se pudo crear la preferencia' }
    }

    return { ok: true, init_point: data.init_point, preferenceId: data.preferenceId }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}

/**
 * Abre el checkout de Mercado Pago en una nueva ventana/pestaña.
 */
export function abrirCheckoutMP(initPoint: string): Window | null {
  // En móvil, mejor abrir en la misma ventana para evitar problemas con popups bloqueados
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  if (isMobile) {
    window.location.href = initPoint
    return null
  }

  return window.open(initPoint, '_blank', 'noopener,noreferrer')
}

/**
 * Verifica el estado de un pago (para polling si se necesita).
 */
export async function verificarEstadoPago(registroId: string): Promise<{ ok: boolean; estado?: string; error?: string }> {
  try {
    const resp = await fetch(`${APP_URL}/api/registros/${registroId}`)
    const data = await resp.json()

    if (!resp.ok || !data.ok) {
      return { ok: false, error: data.error }
    }

    return { ok: true, estado: data.registro?.pago?.estado }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}