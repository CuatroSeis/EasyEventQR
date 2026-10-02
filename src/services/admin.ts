/**
 * Cliente del panel super-admin.
 *
 * TODO el panel habla con UN solo endpoint (`/api/admin-organizadores`)
 * y se differentiate por `?accion=`. No es una decisión estética: el plan
 * Hobby de Vercel corta en 12 funciones serverless y la app ya tiene 9
 * archivos en `api/`. Un endpoint por pantalla nos dejaría sin margen
 * para las fases siguientes, así que el router vive adentro del archivo.
 *
 * Sobre la autorización: acá se manda el ID token real de Firebase en
 * `Authorization`, y el backend lo verifica con `verifyIdToken`. La
 * versión anterior mandaba `x-user-uid`, que es un header que pone el
 * cliente y por lo tanto lo puede mandar cualquiera: con sólo saber el
 * UID del super-admin (que es un dato público, aparece en la URL del
 * panel) cualquiera se autopromovía. Un header no es una credencial.
 */

import { auth } from './firebase'

export interface OrganizadorAdmin {
  uid: string
  nombre: string
  email: string
  plan: 'gratis' | 'pro' | 'pro+'
  estadoSuscripcion: 'activo' | 'suspendido'
  fechaAlta: Date | string
  limitesPersonalizacion: {
    bannerPermitido: boolean
    colorPersonalizadoPermitido: boolean
    logoPermitido: boolean
    capacidadMaximaPorEvento: number
  }
}

export interface EventoAdmin {
  id: string
  organizadorId: string
  organizadorNombre: string
  organizadorEmail: string
  nombre: string
  fecha: Date | string
  lugar: string
  descripcion: string
  capacidadMaxima: number
  reservas: number
  estado: 'activo' | 'cerrado'
  requierePago: boolean
  precioEntrada: number | null
  creadoEn: Date | string | null
}

export interface RegistroAdmin {
  id: string
  eventoId: string
  eventoNombre: string
  organizadorId: string
  organizadorNombre: string
  nombre: string
  email: string
  dni: string
  telefono: string
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  pago: {
    requerido: boolean
    estado: 'no_aplica' | 'pendiente' | 'pagado' | 'rechazado'
    montoPagado: number | null
    medioPago: string | null
    idTransaccion: string | null
    fechaPago: Date | string | null
  }
  usado: boolean
  fechaRegistro: Date | string
  fechaUso: Date | string | null
}

export interface DashboardStats {
  totalOrganizadores: number
  organizadoresActivos: number
  organizadoresSuspendidos: number
  totalEventos: number
  eventosActivos: number
  totalRegistros: number
  registrosHoy: number
  entradasUsadas: number
  ingresosMes: number
}

export interface ExcepcionAdmin {
  organizadorId: string
  organizadorNombre: string
  organizadorEmail: string
  plan: OrganizadorAdmin['plan']
  limitesPersonalizacion: OrganizadorAdmin['limitesPersonalizacion']
  campos: string[]
}

export interface AuditoriaLog {
  id: string
  accion: string
  entidad: string
  entidadId: string
  usuarioId: string
  usuarioEmail: string
  detalles: Record<string, unknown>
  creadoEn: Date | string
}

const ENDPOINT = '/api/admin-organizadores'

async function tokenDeId(): Promise<string> {
  const usuario = auth.currentUser
  if (!usuario) {
    throw new Error('Tu sesión no está activa. Volvé a iniciar sesión.')
  }
  return usuario.getIdToken()
}

/**
 * Habla con el router del panel y normaliza los errores.
 *
 * Se usa `getIdToken()` sin `forzar`: el token cacheado sirve para
 * autorizar durante una hora y pedir uno nuevo en cada request multiplica
 * las llamadas al servidor de Auth sin agregar seguridad. Como el panel
 * es de bajo tráfico, el costo no se nota y la simplicidad suma.
 */
async function pedir<T>(
  accion: string,
  opciones: { method?: string; body?: unknown; query?: Record<string, string | number> } = {},
): Promise<T> {
  const params = new URLSearchParams({ accion })
  for (const [clave, valor] of Object.entries(opciones.query ?? {})) {
    params.set(clave, String(valor))
  }

  const cabeceras: Record<string, string> = {
    Authorization: `Bearer ${await tokenDeId()}`,
  }
  if (opciones.body !== undefined) {
    cabeceras['Content-Type'] = 'application/json'
  }

  const respuesta = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: opciones.method ?? 'GET',
    headers: cabeceras,
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  })

  let datos: { ok?: boolean; error?: string } & T
  try {
    datos = await respuesta.json()
  } catch {
    throw new Error('El servidor devolvió una respuesta ilegible.')
  }

  if (!respuesta.ok || !datos.ok) {
    throw new Error(datos.error ?? `Error ${respuesta.status}.`)
  }
  return datos
}

export function pedirOrganizadores(): Promise<{ ok: true; organizadores: OrganizadorAdmin[] }> {
  return pedir('organizadores')
}

export function pedirDashboard(): Promise<{ ok: true; stats: DashboardStats }> {
  return pedir('dashboard')
}

export function pedirEventos(): Promise<{ ok: true; eventos: EventoAdmin[] }> {
  return pedir('eventos')
}

export function pedirRegistrosAdmin(query: {
  search?: string
  estado?: string
  pagoEstado?: string
  limite?: number
  offset?: number
}): Promise<{ ok: true; registros: RegistroAdmin[]; total: number }> {
  return pedir('registros', { query })
}

export function pedirExcepciones(): Promise<{ ok: true; excepciones: ExcepcionAdmin[] }> {
  return pedir('excepciones')
}

export function pedirAuditoria(query: { filtroAccion?: string; entidad?: string }): Promise<{
  ok: true
  logs: AuditoriaLog[]
}> {
  return pedir('auditoria', { query })
}

export function cambiarPlan(uid: string, plan: OrganizadorAdmin['plan']): Promise<{ ok: true }> {
  return pedir('organizadores', { method: 'PATCH', body: { uid, plan } })
}

export function cambiarSuscripcion(
  uid: string,
  estadoSuscripcion: OrganizadorAdmin['estadoSuscripcion'],
): Promise<{ ok: true }> {
  return pedir('organizadores', { method: 'PATCH', body: { uid, estadoSuscripcion } })
}

export function eliminarOrganizador(uid: string): Promise<{ ok: true; eliminados: number }> {
  return pedir('organizadores', {
    method: 'DELETE',
    query: { uid, confirmar: 'eliminar' },
  })
}

export function concederExcepcion(
  organizadorId: string,
  limitesPersonalizacion: OrganizadorAdmin['limitesPersonalizacion'],
): Promise<{ ok: true }> {
  return pedir('excepciones', { method: 'POST', body: { organizadorId, limitesPersonalizacion } })
}

export function revocarExcepciones(organizadorId: string): Promise<{ ok: true }> {
  return pedir('excepciones', { method: 'DELETE', query: { organizadorId } })
}

export function cerrarEvento(eventoId: string, estado: 'activo' | 'cerrado'): Promise<{ ok: true }> {
  return pedir('eventos', { method: 'PATCH', body: { eventoId, estado } })
}