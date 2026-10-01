const APP_URL = import.meta.env.VITE_APP_URL || 'https://easyeventqr.vercel.app'

export interface RegistroFiltros {
  eventoId: string
  search?: string
  estado?: string
  pagoEstado?: string
  limite?: number
  offset?: number
}

export interface RegistrosResponse {
  ok: boolean
  registros: RegistroUI[]
  total: number
}

export interface RegistroUI {
  id: string
  nombre: string
  email: string
  dni: string
  fechaNacimiento: string
  telefono: string
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  pago: {
    requerido: boolean
    estado: 'no_aplica' | 'pendiente' | 'pagado' | 'rechazado'
    montoPagado: number | null
    medioPago: string | null
    idTransaccion: string | null
    fechaPago: Date | null
  }
  usado: boolean
  fechaRegistro: Date
  fechaUso: Date | null
}

interface RegistroRaw {
  id: string
  nombre: string
  email: string
  dni: string
  fechaNacimiento: string
  telefono?: string
  estado: RegistroUI['estado']
  pago?: {
    requerido?: boolean
    estado?: RegistroUI['pago']['estado']
    montoPagado?: number | null
    medioPago?: string | null
    idTransaccion?: string | null
    fechaPago?: string | null
  }
  usado: boolean
  fechaRegistro: string | Date
  fechaUso?: string | Date | null
}

function normalizarRegistro(r: RegistroRaw): RegistroUI {
  return {
    id: r.id,
    nombre: r.nombre,
    email: r.email,
    dni: r.dni,
    fechaNacimiento: r.fechaNacimiento,
    telefono: r.telefono || '',
    estado: r.estado,
    pago: {
      requerido: r.pago?.requerido ?? false,
      estado: r.pago?.estado ?? 'no_aplica',
      montoPagado: r.pago?.montoPagado ?? null,
      medioPago: r.pago?.medioPago ?? null,
      idTransaccion: r.pago?.idTransaccion ?? null,
      fechaPago: r.pago?.fechaPago ? new Date(r.pago.fechaPago) : null,
    },
    usado: r.usado,
    fechaRegistro: new Date(r.fechaRegistro),
    fechaUso: r.fechaUso ? new Date(r.fechaUso) : null,
  }
}

export async function obtenerRegistros(filtros: RegistroFiltros): Promise<{ registros: RegistroUI[]; total: number }> {
  const params = new URLSearchParams({
    eventoId: filtros.eventoId,
    search: filtros.search || '',
    estado: filtros.estado || '',
    pagoEstado: filtros.pagoEstado || '',
    limite: String(filtros.limite || 50),
    offset: String(filtros.offset || 0),
  })

  const resp = await fetch(`${APP_URL}/api/registros?${params.toString()}`)
  const data = await resp.json()

  if (!resp.ok || !data.ok) {
    throw new Error(data.error || 'Error cargando registros')
  }

  return {
    registros: data.registros.map(normalizarRegistro),
    total: data.total,
  }
}

export async function exportarRegistros(eventoId: string): Promise<Blob> {
  const resp = await fetch(`${APP_URL}/api/registros/export?eventoId=${eventoId}`)
  if (!resp.ok) throw new Error('Error exportando')
  return resp.blob()
}

export async function reenviarMails(eventoId: string, registroIds: string[]): Promise<{ enviados: number; fallidos: number }> {
  const resp = await fetch(`${APP_URL}/api/registros/resend?eventoId=${eventoId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registroIds }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.ok) throw new Error(data.error)
  return { enviados: data.enviados, fallidos: data.fallidos }
}

export async function recountRegistros(eventoId: string): Promise<number> {
  const resp = await fetch(`${APP_URL}/api/registros/recount?eventoId=${eventoId}`, { method: 'POST' })
  const data = await resp.json()
  if (!resp.ok || !data.ok) throw new Error(data.error)
  return data.reservas
}