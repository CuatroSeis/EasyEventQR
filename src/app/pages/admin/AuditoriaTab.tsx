import { useCallback, useEffect, useState } from 'react'

import { pedirAuditoria, type AuditoriaLog } from '../../../services/admin'
import { Cargando } from './Cargando'
import { MensajeError } from './MensajeError'
import { useIdioma } from '../../components/IdiomaContext'

const ENTIDADES = ['', 'organizador', 'evento']

/**
 * Historial de acciones del super-admin.
 *
 * Sólo lectura: la auditoría se escribe desde el backend con el Admin SDK
 * (ver `auditar` en el router) justamente para que ninguna ruta del
 * frontend pueda reescribirla. Si esta pantalla pudiera escribir, dejaría
 * de ser evidencia.
 */
export function AuditoriaTab() {
  const { t } = useIdioma()
  const [logs, setLogs] = useState<AuditoriaLog[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroAccion, setFiltroAccion] = useState('')
  const [entidad, setEntidad] = useState('')

  const cargar = useCallback(async () => {
    try {
      const { logs: lista } = await pedirAuditoria({ filtroAccion, entidad })
      setLogs(lista)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('adm.aud.err'))
    } finally {
      setCargando(false)
    }
  }, [filtroAccion, entidad])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (cargando) return <Cargando etiqueta={t('adm.aud.cargando')} />

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-bold text-texto">{t('adm.tabs.aud')}</h1>
        <p className="text-sm text-texto-suave">
          Quién hizo qué en el panel. Sólo lectura: el registro se escribe en el servidor y no se puede editar
          desde la aplicación.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={filtroAccion}
          onChange={(e) => setFiltroAccion(e.target.value)}
          placeholder={t('adm.aud.filtrar')}
          className="campo flex-1"
          aria-label="Filtrar por acción"
        />
        <select
          value={entidad}
          onChange={(e) => setEntidad(e.target.value)}
          className="campo sm:w-40"
          aria-label="Filtrar por entidad"
        >
          {ENTIDADES.map((e) => (
            <option key={e} value={e}>
              {e === '' ? 'Toda entidad' : e}
            </option>
          ))}
        </select>
      </div>

      {error && <MensajeError texto={error} />}

      {logs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-borde p-6 text-center text-sm text-texto-suave">
          Todavía no hay acciones registradas.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde">
          <table className="w-full text-sm">
            <thead className="bg-superficie text-left text-xs text-texto-suave">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.cuando')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.accion')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.sobre')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.autor')}</th>
                <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">{t('adm.th.detalles')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-superficie/50">
                  <td className="whitespace-nowrap px-3 py-2 text-texto-suave">
                    {formatearFechaHora(log.creadoEn)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-primario/10 px-2 py-0.5 text-xs font-medium text-primario">
                      {log.accion}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-texto">{log.entidad}</p>
                    <p className="truncate font-mono text-xs text-texto-suave">{log.entidadId}</p>
                  </td>
                  <td className="px-3 py-2 text-texto-suave">{log.usuarioEmail || log.usuarioId}</td>
                  <td className="hidden px-3 py-2 lg:table-cell">
                    <pre className="max-w-xs overflow-auto whitespace-pre-wrap text-xs text-texto-suave">
                      {JSON.stringify(log.detalles, null, 2)}
                    </pre>
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