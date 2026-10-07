import { useCallback, useEffect, useState } from 'react'

import { cerrarEvento, pedirEventos, type EventoAdmin } from '../../../services/admin'
import { Cargando } from './Cargando'
import { MensajeError } from './MensajeError'
import { useIdioma } from '../../components/IdiomaContext'

/**
 * Listado global de eventos con cierre y reapertura.
 *
 * El super-admin puede cortar la emisión de un evento (por ejemplo si se
 * publicó algo que el organizador no puede retirar desde su panel), pero
 * no editar su contenido: tocar el nombre de un evento es territorio del
 * organizador y de las reglas de Firestore.
 */
export function EventosTab() {
  const { t } = useIdioma()
  const [eventos, setEventos] = useState<EventoAdmin[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<EventoAdmin['estado'] | ''>('')
  const [soloPagados, setSoloPagados] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const { eventos: lista } = await pedirEventos()
      setEventos(lista)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los eventos.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function alternarEstado(evento: EventoAdmin) {
    const destino = evento.estado === 'activo' ? 'cerrado' : 'activo'
    const pregunta =
      destino === 'cerrado'
        ? t('adm.ev.cerrar.q', { nombre: evento.nombre })
        : t('adm.ev.reabrir.q', { nombre: evento.nombre })
    if (!window.confirm(pregunta)) return

    setOcupado(evento.id)
    setError(null)
    try {
      await cerrarEvento(evento.id, destino)
      setEventos((prev) => prev.map((e) => (e.id === evento.id ? { ...e, estado: destino } : e)))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('adm.ev.err.estado'))
      await cargar()
    } finally {
      setOcupado(null)
    }
  }

  const filtrados = eventos.filter((e) => {
    const q = busqueda.trim().toLowerCase()
    const coincide =
      !q ||
      e.nombre.toLowerCase().includes(q) ||
      e.lugar.toLowerCase().includes(q) ||
      e.organizadorNombre.toLowerCase().includes(q) ||
      e.id.includes(q)
    return coincide && (!estado || e.estado === estado) && (!soloPagados || e.requierePago)
  })

  const activos = eventos.filter((e) => e.estado === 'activo').length

  if (cargando) return <Cargando etiqueta={t('adm.ev.cargando')} />

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-bold text-texto">{t('adm.tabs.ev')}</h1>
        <p className="text-sm text-texto-suave">
          {eventos.length} eventos · {activos} activos
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t('adm.ev.buscar')}
          className="campo flex-1"
          aria-label="Buscar evento"
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EventoAdmin['estado'] | '')}
          className="campo sm:w-36"
          aria-label="Filtrar por estado"
        >
          <option value="">{t('adm.ev.todos')}</option>
          <option value="activo">{t('adm.ev.activos')}</option>
          <option value="cerrado">{t('adm.ev.cerrados')}</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-texto">
          <input
            type="checkbox"
            checked={soloPagados}
            onChange={(e) => setSoloPagados(e.target.checked)}
          />
          Solo con pago
        </label>
      </div>

      {error && <MensajeError texto={error} />}

      {filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-borde p-6 text-center text-sm text-texto-suave">
          No hay eventos que coincidan.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde">
          <table className="w-full text-sm">
            <thead className="bg-superficie text-left text-xs text-texto-suave">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.evento')}</th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">{t('adm.th.org')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.fecha')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.reservas')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.pago')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.estado')}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('adm.th.acciones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filtrados.map((e) => (
                <tr key={e.id} className="hover:bg-superficie/50">
                  <td className="px-3 py-2">
                    <p className="font-medium text-texto">{e.nombre}</p>
                    <p className="text-xs text-texto-suave">{e.lugar}</p>
                  </td>
                  <td className="hidden px-3 py-2 text-texto-suave md:table-cell">{e.organizadorNombre}</td>
                  <td className="px-3 py-2 text-texto-suave">{formatearFechaHora(e.fecha)}</td>
                  <td className="px-3 py-2 text-texto">
                    {e.reservas} / {e.capacidadMaxima}
                  </td>
                  <td className="px-3 py-2 text-texto-suave">
                    {e.requierePago ? `$${e.precioEntrada ?? 0}` : 'Gratis'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        e.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {e.estado}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void alternarEstado(e)}
                      disabled={ocupado === e.id}
                      className="rounded px-2 py-1 text-xs text-texto-suave hover:bg-superficie disabled:opacity-50"
                    >
                      {e.estado === 'activo' ? t('adm.ev.cerrar') : t('adm.ev.reabrir')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatearFechaHora(valor: Date | string): string {
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}