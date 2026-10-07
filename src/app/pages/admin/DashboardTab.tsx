import { useEffect, useState } from 'react'

import { pedirDashboard, type DashboardStats } from '../../../services/admin'
import { Cargando } from './Cargando'
import { MensajeError } from './MensajeError'
import { useIdioma } from '../../components/IdiomaContext'

/**
 * Métricas globales de la plataforma.
 *
 * Todas vienen de consultas de agregación de Firestone que corren en el
 * servidor (ver `rutaDashboard`), así que este componente no trae nada:
 * sólo las pinta. Si el panel crece en métricas, el trabajo heavy va al
 * backend, no a un `for` sobre documentos acá.
 */
export function DashboardTab() {
  const { t } = useIdioma()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true

    async function cargar() {
      try {
        const { stats: datos } = await pedirDashboard()
        // `vigente` evita pintar sobre un componente que ya se desmontó:
        // cambiar de tab mientras carga genera respuestas fuera de orden.
        if (vigente) setStats(datos)
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : t('adm.dash.err'))
      } finally {
        if (vigente) setCargando(false)
      }
    }

    void cargar()
    return () => {
      vigente = false
    }
  }, [])

  if (cargando) return <Cargando etiqueta={t('adm.tab.cargando')} />

  const tarjetas: { etiqueta: string; valor: string }[] = [
    { etiqueta: t('adm.dash.org'), valor: String(stats?.totalOrganizadores ?? 0) },
    { etiqueta: t('adm.dash.org.act'), valor: String(stats?.organizadoresActivos ?? 0) },
    { etiqueta: t('adm.dash.org.susp'), valor: String(stats?.organizadoresSuspendidos ?? 0) },
    { etiqueta: t('adm.dash.ev'), valor: String(stats?.totalEventos ?? 0) },
    { etiqueta: t('adm.dash.ev.act'), valor: String(stats?.eventosActivos ?? 0) },
    { etiqueta: t('adm.dash.reg'), valor: String(stats?.totalRegistros ?? 0) },
    { etiqueta: t('adm.dash.reg.hoy'), valor: String(stats?.registrosHoy ?? 0) },
    { etiqueta: t('adm.dash.usadas'), valor: String(stats?.entradasUsadas ?? 0) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-texto">{t('adm.tabs.dash')}</h1>

      {error && <MensajeError texto={error} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tarjetas.map((tarjeta) => (
          <div key={tarjeta.etiqueta} className="rounded-xl border border-borde bg-superficie p-4">
            <p className="text-xs text-texto-suave">{tarjeta.etiqueta}</p>
            <p className="mt-1 text-2xl font-bold text-texto">{tarjeta.valor}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-borde bg-superficie p-4">
        <p className="text-xs text-texto-suave">{t('adm.dash.ingresos')}</p>
        <p className="mt-1 text-2xl font-bold text-texto">
          ${(stats?.ingresosMes ?? 0).toLocaleString('es-AR')}
        </p>
        <p className="mt-1 text-xs text-texto-suave">
          {t('adm.dash.simulados')}
        </p>
      </div>
    </div>
  )
}
