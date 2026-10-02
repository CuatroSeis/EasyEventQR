import { useEffect, useState } from 'react'

import { pedirDashboard, type DashboardStats } from '../../../services/admin'
import { Cargando } from './Cargando'
import { MensajeError } from './MensajeError'

/**
 * Métricas globales de la plataforma.
 *
 * Todas vienen de consultas de agregación de Firestone que corren en el
 * servidor (ver `rutaDashboard`), así que este componente no trae nada:
 * sólo las pinta. Si el panel crece en métricas, el trabajo heavy va al
 * backend, no a un `for` sobre documentos acá.
 */
export function DashboardTab() {
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
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudieron cargar las métricas.')
      } finally {
        if (vigente) setCargando(false)
      }
    }

    void cargar()
    return () => {
      vigente = false
    }
  }, [])

  if (cargando) return <Cargando etiqueta="Cargando métricas…" />

  const tarjetas: { etiqueta: string; valor: string }[] = [
    { etiqueta: 'Organizadores', valor: String(stats?.totalOrganizadores ?? 0) },
    { etiqueta: 'Organizadores activos', valor: String(stats?.organizadoresActivos ?? 0) },
    { etiqueta: 'Organizadores suspendidos', valor: String(stats?.organizadoresSuspendidos ?? 0) },
    { etiqueta: 'Eventos totales', valor: String(stats?.totalEventos ?? 0) },
    { etiqueta: 'Eventos activos', valor: String(stats?.eventosActivos ?? 0) },
    { etiqueta: 'Registros totales', valor: String(stats?.totalRegistros ?? 0) },
    { etiqueta: 'Registros hoy', valor: String(stats?.registrosHoy ?? 0) },
    { etiqueta: 'Entradas usadas', valor: String(stats?.entradasUsadas ?? 0) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-texto">Dashboard</h1>

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
        <p className="text-xs text-texto-suave">Ingresos confirmados (pagos en estado pagado)</p>
        <p className="mt-1 text-2xl font-bold text-texto">
          ${(stats?.ingresosMes ?? 0).toLocaleString('es-AR')}
        </p>
        <p className="mt-1 text-xs text-texto-suave">
          Los pagos son simulados en esta etapa: el número refleja lo que los eventos declaran, no plata cobrada.
        </p>
      </div>
    </div>
  )
}
