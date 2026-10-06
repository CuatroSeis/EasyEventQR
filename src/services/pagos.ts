/**
 * Servicios de pagos para el frontend.
 *
 * Las URLs van RELATIVAS a propósito. Antes se armaban con
 * `import.meta.env.VITE_APP_URL || 'https://easyeventqr.vercel.app'`, que
 * tenía dos problemas: en local, `VITE_APP_URL` no está definida (el
 * `.env.local` define `APP_URL`, sin el prefijo `VITE_`, que es el que sí
 * lee Vite), así que la app de desarrollo pegaba contra la API de
 * PRODUCCIÓN; y en producción la variable era redundante, porque la app y
 * las funciones ya viven en el mismo dominio.
 *
 * Con `/api/...` no hay variable que olvidar ni que pueda apuntar al lugar
 * equivocado: el frontend llama a su propio origen, y listo.
 */

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
    const resp = await fetch('/api/pagos', {
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
    const resp = await fetch(`/api/pagos/estado?registroId=${encodeURIComponent(registroId)}`)
    const data = await resp.json()

    if (!resp.ok || !data.ok) {
      return { ok: false, error: data.error }
    }

    // /api/pagos/estado devuelve { ok, estado } plano, sin envoltorio
    // `registro`: leer otra forma deja el estado en undefined y /pago/exito
    // nunca llega a "aprobado".
    return { ok: true, estado: data.estado }
  } catch {
    return { ok: false, error: 'Error de conexión' }
  }
}