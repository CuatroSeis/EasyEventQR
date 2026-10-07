import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { auth } from '../../services/firebase'
import { DashboardTab } from './admin/DashboardTab'
import { OrganizadoresTab } from './admin/OrganizadoresTab'
import { EventosTab } from './admin/EventosTab'
import { RegistrosTab } from './admin/RegistrosTab'
import { ExcepcionesTab } from './admin/ExcepcionesTab'
import { AuditoriaTab } from './admin/AuditoriaTab'
import { Cargando } from './admin/Cargando'
import { useIdioma } from '../components/IdiomaContext'
import AccesoDenegado from './admin/AccesoDenegado'

type TabId = 'dashboard' | 'organizadores' | 'eventos' | 'registros' | 'excepciones' | 'auditoria'

const TABS: { id: TabId; clave: 'adm.tabs.dash' | 'adm.tabs.org' | 'adm.tabs.ev' | 'adm.tabs.reg' | 'adm.tabs.exc' | 'adm.tabs.aud' }[] = [
  { id: 'dashboard', clave: 'adm.tabs.dash' },
  { id: 'organizadores', clave: 'adm.tabs.org' },
  { id: 'eventos', clave: 'adm.tabs.ev' },
  { id: 'registros', clave: 'adm.tabs.reg' },
  { id: 'excepciones', clave: 'adm.tabs.exc' },
  { id: 'auditoria', clave: 'adm.tabs.aud' },
]

/** Panel super-admin. El permiso lo decide `/api/me` en el servidor (nunca una bandera del navegador); el token va explícito en `Authorization`. */
export default function AdminPanel() {
  const navegar = useNavigate()
  // El nombre sale del usuario de Firebase y NO de `useOrganizador()`.
  // Esta ruta vive fuera de `<Protegido>` (ver App.tsx) justamente para
  // que un super-admin suspendido pueda entrar a reactivar su cuenta; si
  // leyera el contexto, `organizador` sería null y el header reventaría
  // en `.nombre` al bloquearse la pantalla de suspensión.
  const [usuario, setUsuario] = useState(auth.currentUser)
  const { t } = useIdioma()
  const [tabActiva, setTabActiva] = useState<TabId>('dashboard')
  const [esSuperAdmin, setEsSuperAdmin] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(true)

  useEffect(() => {
    let vigente = true

    async function verificar() {
      const actual = auth.currentUser
      if (!actual) {
        if (vigente) {
          setVerificando(false)
          navegar('/panel', { replace: true })
        }
        return
      }
      if (vigente) setUsuario(actual)

      try {
        const respuesta = await fetch('/api/me', {
          headers: { Authorization: `Bearer ${await actual.getIdToken()}` },
        })
        const datos = await respuesta.json()
        if (vigente) {
          const admin = datos.ok === true && datos.isAdmin === true
          setEsSuperAdmin(admin)
          setMotivo(admin ? null : (datos.porQue ?? 'desconocido'))
        }
      } catch {
        if (vigente) {
          setEsSuperAdmin(false)
          setMotivo('error-red')
        }
      } finally {
        if (vigente) setVerificando(false)
      }
    }

    void verificar()
    return () => {
      vigente = false
    }
  }, [navegar])

  if (verificando) return <Cargando etiqueta={t('adm.cargando.permisos')} />
  if (!esSuperAdmin) return <AccesoDenegado motivo={motivo} onSalir={() => navegar('/entrar', { replace: true })} />

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-borde bg-superficie px-4 py-3">
        <div>
          <h1 className="text-lg font-bold text-texto">{t('adm.panel')}</h1>
          <p className="text-xs text-texto-suave">
            {usuario?.displayName ?? t('adm.panel')} · {usuario?.email ?? ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navegar('/panel')}
          className="rounded-lg border border-borde px-3 py-1.5 text-sm text-texto hover:bg-superficie"
        >
          {t('adm.volver')}
        </button>
      </header>

      <nav
        className="flex gap-1 overflow-x-auto border-b border-borde bg-superficie px-4 py-2"
        role="tablist"
        aria-label="Secciones del super-admin"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tabActiva === tab.id}
            onClick={() => setTabActiva(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tabActiva === tab.id
                ? 'bg-primario text-sobre-primario'
                : 'text-texto-suave hover:bg-superficie'
            }`}
          >
            {t(tab.clave)}
          </button>
        ))}
      </nav>

      <main className="flex-1 p-4">
        {tabActiva === 'dashboard' && <DashboardTab />}
        {tabActiva === 'organizadores' && <OrganizadoresTab />}
        {tabActiva === 'eventos' && <EventosTab />}
        {tabActiva === 'registros' && <RegistrosTab />}
        {tabActiva === 'excepciones' && <ExcepcionesTab />}
        {tabActiva === 'auditoria' && <AuditoriaTab />}
      </main>
    </div>
  )
}