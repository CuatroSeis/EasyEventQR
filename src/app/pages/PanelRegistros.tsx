import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { useOrganizador } from '../ContextoOrganizador'
import {
  obtenerRegistros,
  exportarRegistros,
  reenviarMails,
  recountRegistros,
  crearLinkOperador,
  type RegistroUI,
} from '../../services/registros'

/** Los dos salen del tipo del service, para no mantener la lista dos veces. */
type EstadoRegistro = RegistroUI['estado']
type EstadoPago = RegistroUI['pago']['estado']

const ESTADO_LABELS: Record<EstadoRegistro, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
}

const ESTADO_COLORS: Record<EstadoRegistro, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  aprobado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
}

const PAGO_LABELS: Record<EstadoPago, string> = {
  no_aplica: 'Gratis',
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  rechazado: 'Rechazado',
}

const PAGO_COLORS: Record<EstadoPago, string> = {
  no_aplica: 'bg-slate-100 text-slate-700',
  pendiente: 'bg-yellow-100 text-yellow-700',
  pagado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
}

export default function PanelRegistros() {
  const { eventoId } = useParams<{ eventoId: string }>()
  const [busca] = useSearchParams()
  const organizador = useOrganizador()
  const [registros, setRegistros] = useState<RegistroUI[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, ] = useState(busca.get('search') || '')
  const [estadoFiltro, ] = useState(busca.get('estado') || '')
  const [pagoFiltro, ] = useState(busca.get('pagoEstado') || '')
  const [pagina, setPagina] = useState(1)
  const [porPagina] = useState(20)
  const [acciones, setAcciones] = useState<Record<string, 'enviando' | 'reintentando' | undefined>>({})
  const [recontando, setRecontando] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; advertencia: boolean } | null>(null)
  const [linkOperador, setLinkOperador] = useState<{ url: string; expiraEn: string } | null>(null)
  const [generandoLink, setGenerandoLink] = useState(false)
  const [copiado, setCopiado] = useState(false)

  /** Atajo para no repetir el objeto en cadallamada. */
  function avisar(texto: string, advertencia = false) {
    setAviso({ texto, advertencia })
  }

  async function handleGenerarLinkOperador() {
    setGenerandoLink(true)
    setError(null)
    try {
      setLinkOperador(await crearLinkOperador(eventoId!))
      setCopiado(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el link de operador')
    } finally {
      setGenerandoLink(false)
    }
  }

  async function handleCopiarLink() {
    if (!linkOperador) return
    try {
      await navigator.clipboard.writeText(linkOperador.url)
      setCopiado(true)
    } catch {
      // clipboard.writeText falla sin HTTPS o sin permiso. El link queda a
      // la vista igual, asi que solo se avisa que el boton no sirvio y se
      // deja que lo copien a mano.
      avisar('No se pudo copiar automático. Copiá el link seleccionándolo.', true)
    }
  }

  const LIMITE = organizador.limitesPersonalizacion.capacidadMaximaPorEvento

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const { registros: lista, total:cuantos } = await obtenerRegistros({
        eventoId: eventoId!,
        search,
        estado: estadoFiltro,
        pagoEstado: pagoFiltro,
        limite: porPagina,
        offset: (pagina - 1) * porPagina,
      })
      setRegistros(lista)
      setTotal(cuantos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando registros')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [search, estadoFiltro, pagoFiltro, pagina])

  async function handleReenviar(registroId: string) {
    setAcciones((prev) => ({ ...prev, [registroId]: 'enviando' }))
    try {
      const r = await reenviarMails(eventoId!, [registroId])
      avisar(
        `Reenviado a ${r.enviados}. Ojo: el QR anterior dejó de servir, el mail lleva uno nuevo.`,
        r.tokensRotados > 0,
      )
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error reenviando')
    } finally {
      setAcciones((prev) => ({ ...prev, [registroId]: undefined }))
    }
  }

  async function handleReenviarTodos() {
    const ids = registros.filter((r) => r.pago.requerido && r.pago.estado === 'pagado').map((r) => r.id)
    if (ids.length === 0) {
      setError('No hay reservas pagadas para reenviar.')
      return
    }
    if (
      !confirm(
        `Reenviar el mail a ${ids.length} asistentes?\n\n` +
          'OJO: reenviar rota el token de cada QR. Los códigos de los mails anteriores ' +
          'dejan de validar y los nuevos son los que sirven.',
      )
    ) {
      return
    }

    setAcciones((prev) => {
      const n = { ...prev }
      ids.forEach((id) => (n[id] = 'enviando'))
      return n
    })
    try {
      const r = await reenviarMails(eventoId!, ids)
      avisar(
        `Reenviados ${r.enviados} de ${ids.length}. Los QR anteriores dejaron de servir: ` +
          `los mails llevan tokens nuevos.`,
        r.tokensRotados > 0,
      )
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error reenviando')
    } finally {
      setAcciones((prev) => {
        const n = { ...prev }
        ids.forEach((id) => delete n[id])
        return n
      })
    }
  }

  async function handleExport() {
    try {
      const blob = await exportarRegistros(eventoId!)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `registros-${eventoId}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error exportando CSV')
    }
  }

  async function handleRecount() {
    if (!confirm('Recalcular cupo real desde las reservas? Esto actualiza el contador del evento.')) return
    setRecontando(true)
    try {
      const reservas = await recountRegistros(eventoId!)
      avisar(`Reconteo hecho: ${reservas} reservas reales.`, false)
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en reconteo')
    } finally {
      setRecontando(false)
    }
  }

  function formatearFecha(fecha: Date | string): string {
    const d = new Date(fecha)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const reservados = registros.filter((r) => r.estado === 'aprobado' || r.pago.estado === 'pagado').length
  const usados = registros.filter((r) => r.usado).length

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg font-bold text-texto">Registros</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleGenerarLinkOperador}
            disabled={generandoLink}
            className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-superficie disabled:opacity-60"
          >
            {generandoLink ? 'Generando…' : 'Link de operador'}
          </button>
          <button onClick={handleExport} className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-superficie">
            Exportar CSV
          </button>
          <button onClick={handleReenviarTodos} disabled={cargando} className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-superficie">
            Reenviar mails pagados
          </button>
          <button onClick={handleRecount} disabled={recontando} className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-superficie">
            {recontando ? 'Recalculando…' : 'Recalcular cupo'}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-4 text-sm text-texto-suave">
        <span>Total: <strong>{total}</strong></span>
        <span>Reservados: <strong>{reservados}</strong> / {LIMITE}</span>
        <span>Usados: <strong>{usados}</strong></span>
        <span>Disponibles: <strong>{LIMITE - reservados}</strong></span>
      </div>

      {linkOperador && (
        <section
          aria-label="Link del operador de puerta"
          className="rounded-xl border-2 border-primario bg-superficie p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-texto">Link del operador de puerta</h2>
            <span className="text-xs text-texto-suave">Vence en {linkOperador.expiraEn}</span>
          </div>
          <p className="mt-1 text-xs text-texto-suave">
            Pasáselo a quien atiende la puerta. Le deja escanear los QR de este evento
            y marcar cada entrada como usada. Sirve para un solo evento.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-superficie-2 p-2 text-xs">
              {linkOperador.url}
            </code>
            <button
              onClick={handleCopiarLink}
              className="rounded-lg bg-primario px-3 py-2 text-xs font-semibold text-sobre-primario"
            >
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <button
              onClick={() => setLinkOperador(null)}
              className="rounded-lg border border-borde px-3 py-2 text-xs text-texto"
            >
              Cerrar
            </button>
          </div>
        </section>
      )}

      {aviso && (
        <p
          role="status"
          className={`rounded-xl border p-3 text-sm ${
            aviso.advertencia
              ? 'border-yellow-300 bg-yellow-50 text-yellow-900'
              : 'border-borde bg-superficie text-texto'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {cargando ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-borde" />
          ))}
        </div>
      ) : registros.length === 0 ? (
        <div className="rounded-xl border border-dashed border-borde p-6 text-center">
          <p className="text-sm text-texto-suave">No hay reservas para este evento</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-borde">
            <table className="w-full text-sm" role="grid">
              <thead className="bg-superficie">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-texto-suave">Asistente</th>
                  <th className="px-3 py-2 text-left font-medium text-texto-suave">DNI</th>
                  <th className="px-3 py-2 text-left font-medium text-texto-suave hidden md:table-cell">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-texto-suave">Estado</th>
                  <th className="px-3 py-2 text-left font-medium text-texto-suave">Pago</th>
                  <th className="px-3 py-2 text-left font-medium text-texto-suave hidden lg:table-cell">Registrado</th>
                  <th className="px-3 py-2 text-left font-medium text-texto-suave">Usado</th>
                  <th className="px-3 py-2 text-right font-medium text-texto-suave">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {registros.map((r) => (
                  <tr key={r.id} className="hover:bg-superficie/50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-texto">{r.nombre}</div>
                      <div className="text-xs text-texto-suave">{r.telefono || '—'}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-texto">{r.dni}</td>
                    <td className="px-3 py-2 hidden md:table-cell text-texto-suave truncate max-w-xs">{r.email}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[r.estado]}`}>
                        {ESTADO_LABELS[r.estado]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAGO_COLORS[r.pago.estado]}`}>
                        {PAGO_LABELS[r.pago.estado]}
                      </span>
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell text-texto-suave">{formatearFecha(r.fechaRegistro)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.usado ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                        {r.usado ? 'Sí' : 'No'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.pago.requerido && r.pago.estado === 'pagado' && (
                          <button
                            onClick={() => handleReenviar(r.id)}
                            disabled={acciones[r.id] === 'enviando'}
                            className="px-2 py-1 rounded text-xs text-primario hover:bg-primario/10 disabled:opacity-50"
                            title="Reenviar mail con QR"
                          >
                            {acciones[r.id] === 'enviando' ? '⏳' : '📧'}
                          </button>
                        )}
                        <a
                          href={`/q/${r.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded text-xs text-texto-suave hover:bg-superficie"
                          title="Ver QR"
                        >
                          👁
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > porPagina && (
            <nav className="flex items-center justify-center gap-2" aria-label="Paginación">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="px-3 py-1.5 rounded-lg border border-borde text-sm disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="px-3 text-sm text-texto-suave">
                Página {pagina} de {Math.ceil(total / porPagina)}
              </span>
              <button
                onClick={() => setPagina((p) => Math.min(Math.ceil(total / porPagina), p + 1))}
                disabled={pagina >= Math.ceil(total / porPagina)}
                className="px-3 py-1.5 rounded-lg border border-borde text-sm disabled:opacity-50"
              >
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}