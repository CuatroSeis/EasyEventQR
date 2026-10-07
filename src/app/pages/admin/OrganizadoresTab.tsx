import { useCallback, useEffect, useState } from 'react'

import {
  cambiarPlan,
  cambiarSuscripcion,
  eliminarOrganizador,
  pedirOrganizadores,
  type OrganizadorAdmin,
} from '../../../services/admin'
import { Cargando } from './Cargando'
import { MensajeError } from './MensajeError'
import { useIdioma } from '../../components/IdiomaContext'

const PLAN_LABELS: Record<OrganizadorAdmin['plan'], string> = {
  gratis: 'Gratis',
  pro: 'Pro',
  'pro+': 'Pro+',
}

const PLANES: OrganizadorAdmin['plan'][] = ['gratis', 'pro', 'pro+']

/**
 * Alta, plan, suspensión y baja de organizadores.
 *
 * Después de cada escritura el backend devuelve `ok` pero no el documento
 * actualizado, y esta tabla actualiza en local en vez de recargar todo. Es
 * deliberado: la lista entera son potencialmente cientos de filas y
 * recargarla después de mover un select se ve como un parpadeo.
 */
export function OrganizadoresTab() {
  const { t } = useIdioma()
  const [organizadores, setOrganizadores] = useState<OrganizadorAdmin[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [plan, setPlan] = useState<OrganizadorAdmin['plan'] | ''>('')

  const cargar = useCallback(async () => {
    try {
      const { organizadores: lista } = await pedirOrganizadores()
      setOrganizadores(lista)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('adm.org.err.carga'))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function conOcupado<T>(uid: string, accion: () => Promise<T>): Promise<void> {
    setOcupado(uid)
    setError(null)
    try {
      await accion()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('adm.org.err.op'))
      // El estado local quedó mentiroso: la escritura falló, así que hay que
      // volver a leer la verdad de la base en vez de seguir mostrando lo que
      // el admin acaba de tocar.
      await cargar()
    } finally {
      setOcupado(null)
    }
  }

  function moverPlan(uid: string, nuevoPlan: OrganizadorAdmin['plan']) {
    void conOcupado(uid, async () => {
      await cambiarPlan(uid, nuevoPlan)
      setOrganizadores((prev) => prev.map((o) => (o.uid === uid ? { ...o, plan: nuevoPlan } : o)))
    })
  }

  function alternarSuscripcion(org: OrganizadorAdmin) {
    const suspendido = org.estadoSuscripcion === 'activo'
    const destino = suspendido ? 'suspendido' : 'activo'
    const pregunta = suspendido
      ? t('adm.org.suspender.q', { nombre: org.nombre })
      : t('adm.org.reactivar.q', { nombre: org.nombre })
    if (!window.confirm(pregunta)) return

    void conOcupado(org.uid, async () => {
      await cambiarSuscripcion(org.uid, destino)
      setOrganizadores((prev) =>
        prev.map((o) => (o.uid === org.uid ? { ...o, estadoSuscripcion: destino } : o)),
      )
    })
  }

  function eliminar(org: OrganizadorAdmin) {
    const pregunta = t('adm.org.borrar.q', { nombre: org.nombre, email: org.email })
    if (!window.confirm(pregunta)) return
    if (!window.confirm(t('adm.org.borrar.q2'))) return

    void conOcupado(org.uid, async () => {
      await eliminarOrganizador(org.uid)
      setOrganizadores((prev) => prev.filter((o) => o.uid !== org.uid))
    })
  }

  const filtrados = organizadores.filter((o) => {
    const q = busqueda.trim().toLowerCase()
    const coincide = !q || o.nombre.toLowerCase().includes(q) || o.email.toLowerCase().includes(q) || o.uid.includes(q)
    return coincide && (!plan || o.plan === plan)
  })

  const activos = organizadores.filter((o) => o.estadoSuscripcion === 'activo').length
  const suspendidos = organizadores.length - activos

  if (cargando) return <Cargando etiqueta={t('adm.org.cargando')} />

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-bold text-texto">{t('adm.tabs.org')}</h1>
        <p className="text-sm text-texto-suave">
          {t('adm.org.sub', { n: organizadores.length, a: activos, s: suspendidos })}
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t('adm.org.buscar')}
          className="campo flex-1"
          aria-label={t('adm.org.buscar.aria')}
        />
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as OrganizadorAdmin['plan'] | '')}
          className="campo sm:w-40"
          aria-label={t('adm.org.filtrar')}
        >
          <option value="">{t('adm.org.todos')}</option>
          {PLANES.map((p) => (
            <option key={p} value={p}>
              {PLAN_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      {error && <MensajeError texto={error} />}

      {filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-borde p-6 text-center text-sm text-texto-suave">
          No hay organizadores que coincidan.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde">
          <table className="w-full text-sm">
            <thead className="bg-superficie text-left text-xs text-texto-suave">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.org')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.plan')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.estado')}</th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">{t('adm.th.cupo')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.alta')}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('adm.th.acciones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filtrados.map((o) => (
                <tr key={o.uid} className="hover:bg-superficie/50">
                  <td className="px-3 py-2">
                    <p className="font-medium text-texto">{o.nombre}</p>
                    <p className="text-xs text-texto-suave">{o.email}</p>
                    <p className="truncate font-mono text-xs text-texto-suave">{o.uid}</p>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={o.plan}
                      onChange={(e) => moverPlan(o.uid, e.target.value as OrganizadorAdmin['plan'])}
                      disabled={ocupado === o.uid}
                      className="campo px-2 py-1 text-xs"
                      aria-label={`Plan de ${o.nombre}`}
                    >
                      {PLANES.map((p) => (
                        <option key={p} value={p}>
                          {PLAN_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        o.estadoSuscripcion === 'activo'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {o.estadoSuscripcion}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2 text-texto-suave md:table-cell">
                    {o.limitesPersonalizacion?.capacidadMaximaPorEvento ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-texto-suave">{formatearFecha(o.fechaAlta)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => alternarSuscripcion(o)}
                        disabled={ocupado === o.uid}
                        className="rounded px-2 py-1 text-xs text-texto-suave hover:bg-superficie disabled:opacity-50"
                      >
                        {o.estadoSuscripcion === 'activo' ? t('adm.org.suspender') : t('adm.org.reactivar')}
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminar(o)}
                        disabled={ocupado === o.uid}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {t('adm.org.eliminar')}
                      </button>
                    </div>
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

function formatearFecha(valor: Date | string): string {
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}