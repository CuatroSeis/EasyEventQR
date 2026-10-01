import { useEffect, useState } from 'react'

import { useNavigate } from 'react-router-dom'

import { useOrganizador } from '../ContextoOrganizador'

const PLAN_LABELS: Record<string, string> = {
  gratis: 'Gratis',
  pro: 'Pro',
  'pro+': 'Pro+',
}

const PLAN_COLORS: Record<string, string> = {
  gratis: 'bg-slate-100 text-slate-700',
  pro: 'bg-blue-100 text-blue-700',
  'pro+': 'bg-violet-100 text-violet-700',
}

interface OrganizadorAdmin {
  uid: string
  nombre: string
  email: string
  plan: string
  estadoSuscripcion: string
  fechaAlta: Date | string
  limitesPersonalizacion: {
    capacidadMaximaPorEvento: number
  }
}

export default function AdminPanel() {
  const navegar = useNavigate()
  const organizador = useOrganizador()
  const [organizadores, setOrganizadores] = useState<OrganizadorAdmin[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<Record<string, boolean>>({})
  const [esSuperAdmin, setEsSuperAdmin] = useState(false)
  const [verificandoAdmin, setVerificandoAdmin] = useState(true)

  useEffect(() => {
    async function verificarAdmin() {
      try {
        const resp = await fetch('/api/me')
        const data = await resp.json()
        if (data.ok && data.isAdmin) {
          setEsSuperAdmin(true)
        } else {
          navegar('/panel', { replace: true })
        }
      } catch {
        navegar('/panel', { replace: true })
      } finally {
        setVerificandoAdmin(false)
      }
    }
    verificarAdmin()
  }, [navegar])

  useEffect(() => {
    if (esSuperAdmin && !verificandoAdmin) {
      cargarOrganizadores()
    }
  }, [esSuperAdmin, verificandoAdmin])

  async function cargarOrganizadores() {
    setCargando(true)
    try {
      const resp = await fetch('/api/admin-organizadores', {
        headers: { 'x-user-uid': organizador.uid },
      })
      const data = await resp.json()
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Error cargando')
      setOrganizadores(data.organizadores)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar')
    } finally {
      setCargando(false)
    }
  }

  async function cambiarPlan(uid: string, nuevoPlan: string) {
    setGuardando((prev) => ({ ...prev, [uid]: true }))
    try {
      const resp = await fetch(`/api/admin-organizadores?uid=${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-uid': organizador.uid,
        },
        body: JSON.stringify({ plan: nuevoPlan }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.ok) throw new Error(data.error || 'Error actualizando')
      setOrganizadores((prev) =>
        prev?.map((o) => (o.uid === uid ? { ...o, plan: nuevoPlan } : o)) ?? [],
      )
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo cambiar el plan')
    } finally {
      setGuardando((prev) => ({ ...prev, [uid]: false }))
    }
  }

  function formatearFecha(fecha: Date | string): string {
    const d = new Date(fecha)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  if (verificandoAdmin) return <Cargando />
  if (!esSuperAdmin) return null
  if (cargando) return <Cargando />

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-bold text-texto">Super-admin · Organizadores</h1>

      {error && (
        <p role="alert" className="rounded-xl border border-borde bg-superficie p-3 text-sm text-texto">
          {error}
        </p>
      )}

      {organizadores?.length === 0 ? (
        <div className="rounded-xl border border-dashed border-borde p-6 text-center">
          <p className="text-sm text-texto-suave">No hay organizadores registrados.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {organizadores?.map((org) => (
            <li key={org.uid} className="rounded-xl border border-borde bg-superficie p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-texto truncate">{org.nombre}</p>
                  <p className="text-xs text-texto-suave truncate">{org.email}</p>
                  <p className="text-xs text-texto-suave mt-1">UID: <code className="font-mono">{org.uid}</code></p>
                  <p className="text-xs text-texto-suave">Alta: {formatearFecha(org.fechaAlta)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[org.plan] || 'bg-slate-100 text-slate-700'}`}>
                    {PLAN_LABELS[org.plan] || org.plan}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${org.estadoSuscripcion === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {org.estadoSuscripcion}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(['gratis', 'pro', 'pro+'] as const).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    disabled={guardando[org.uid] || org.plan === plan}
                    onClick={() => cambiarPlan(org.uid, plan)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      org.plan === plan
                        ? 'bg-primario text-sobre-primario cursor-default'
                        : 'border border-borde text-texto hover:bg-superficie disabled:opacity-50'
                    }`}
                  >
                    {PLAN_LABELS[plan]}
                  </button>
                ))}
              </div>

              <p className="mt-2 text-xs text-texto-suave">
                Cupo máx/evento: <strong>{org.limitesPersonalizacion.capacidadMaximaPorEvento}</strong> entradas
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Cargando() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl border border-borde" />
      ))}
      <span className="sr-only">Cargando organizadores…</span>
    </div>
  )
}