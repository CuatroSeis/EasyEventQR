import { auth } from './firebase'

/**
 * URL del backend: relativa, no absoluta.
 *
 * Antes era `import.meta.env.VITE_APP_URL || 'https://easyeventqr.vercel.app'`.
 * En local `VITE_APP_URL` no existe (el `.env.local` define `APP_URL`, sin
 * el prefijo `VITE_` que es el único que lee Vite), así que el fallback se
 * activaba y el panel de desarrollo listaba, exportaba y reenviaba registros
 * contra la API de PRODUCCIÓN. Una variable mal nombrada que sólo se
 * descubre tarde. Con `/api/...` el frontend llama siempre a su propio
 * origen.
 */

/**
 * ID token real del usuario conectado.
 *
 * `/api/registros` (listar, exportar, reenviar, recontar) toma el UID del
 * token verificado por Firebase. Antes el backend caía a un header
 * `x-user-uid` que ponía el cliente, o sea que la autorización se apoyaba
 * en un dato que el atacante elige. Por eso TODOS los calls de acá van con
 * `Authorization`: sin esto el backend responde 401, y está bien que lo haga.
 */
async function cabecerasAuth(contenido: Record<string, string> = {}): Promise<Record<string, string>> {
  const usuario = auth.currentUser
  if (!usuario) {
    throw new Error('Tu sesión no está activa. Volvé a iniciar sesión.')
  }
  return { ...contenido, Authorization: `Bearer ${await usuario.getIdToken()}` }
}

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

  const resp = await fetch(`/api/registros?${params.toString()}`, {
    headers: await cabecerasAuth(),
  })
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
  const resp = await fetch(`/api/registros/export?eventoId=${eventoId}`, {
    headers: await cabecerasAuth(),
  })
  if (!resp.ok) throw new Error('Error exportando')
  return resp.blob()
}

export interface ResultadoReenvio {
  enviados: number
  fallidos: number
  /**
   * Cuántos tokens se rotaron. Va a par de `enviados` porque reenviar
   * SIEMPRE rota: el token en claro no se guarda, así que la única forma de
   * mandar un QR que valide es emitir uno nuevo. Los QR de los mails
   * anteriores dejan de servir y el organizador tiene que estar enterado.
   */
  tokensRotados: number
}

export async function reenviarMails(eventoId: string, registroIds: string[]): Promise<ResultadoReenvio> {
  const resp = await fetch(`/api/registros/resend?eventoId=${eventoId}`, {
    method: 'POST',
    headers: await cabecerasAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ registroIds }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.ok) throw new Error(data.error)
  return { enviados: data.enviados, fallidos: data.fallidos, tokensRotados: data.tokensRotados ?? data.enviados }
}

export async function recountRegistros(eventoId: string): Promise<number> {
  const resp = await fetch(`/api/registros/recount?eventoId=${eventoId}`, {
    method: 'POST',
    headers: await cabecerasAuth(),
  })
  const data = await resp.json()
  if (!resp.ok || !data.ok) throw new Error(data.error)
  return data.reservas
}

/** Los campos que el organizador puede editar de una reserva. */
export interface CambiosRegistro {
  estado?: 'pendiente' | 'aprobado' | 'rechazado'
  nombre?: string
  email?: string
  telefono?: string
}

export async function actualizarRegistro(
  eventoId: string,
  registroId: string,
  cambios: CambiosRegistro,
): Promise<void> {
  const resp = await fetch(`/api/registros/${registroId}?eventoId=${eventoId}`, {
    method: 'PATCH',
    headers: await cabecerasAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(cambios),
  })
  const data = await resp.json()
  if (!resp.ok || !data.ok) throw new Error(data.error || 'No se pudo guardar')
}

export async function eliminarRegistro(eventoId: string, registroId: string): Promise<void> {
  const resp = await fetch(`/api/registros/${registroId}?eventoId=${eventoId}`, {
    method: 'DELETE',
    headers: await cabecerasAuth(),
  })
  const data = await resp.json()
  if (!resp.ok || !data.ok) throw new Error(data.error || 'No se pudo borrar')
}
export interface LinkOperador {
  url: string
  expiraEn: string
}

/**
 * Genera el link firmado del operador de puerta para un evento.
 *
 * La API existía desde la Fase 7 pero ninguna pantalla la llamaba: el
 * organizador tenía una función en el server y ningún botón, así que el
 * recorrido de `docs/arquitectura/ENDPOINTS.md` se trababa en el paso 11. Para probarlo
 * había que abrir la consola del navegador y pegarle un `fetch` a mano.
 *
 * El link vence a las 4 horas (es lo que server-side), así que la UI lo
 * dice: sin eso, el operador reutiliza un link vencido en la puerta y
 * deduce que la app está rota.
 */
export async function crearLinkOperador(eventoId: string): Promise<LinkOperador> {
  const resp = await fetch('/api/operador/link', {
    method: 'POST',
    headers: await cabecerasAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ eventoId }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.ok) throw new Error(data.error || 'No se pudo generar el link')
  return { url: data.url, expiraEn: data.expiraEn }
}
