import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'

import { aplicarTema } from '../../shared/theming'
import { useOrganizador } from '../ContextoOrganizador'
import { salir } from '../../services/auth'
import TemaToggle from './TemaToggle'
import { IdiomaToggle, useIdioma } from './IdiomaContext'

/** Cáscara del panel: chrome común + tema en documentElement (efecto, no render: escribe DOM y sobrevive a la navegación). */

export default function PanelLayout() {
  const { t } = useIdioma()
  const organizador = useOrganizador()
  const navegar = useNavigate()
  const [saliendo, setSaliendo] = useState(false)

  /** Logout: única forma de renovar el ID token (los claims se cachean una hora). `replace` para no volver atrás a la sesión. */
  async function handleSalir() {
    if (saliendo) return
    setSaliendo(true)
    try {
      await salir()
      navegar('/entrar', { replace: true })
    } finally {
      setSaliendo(false)
    }
  }

  useEffect(() => {
    aplicarTema(organizador.brandingPanel, document.documentElement)
  }, [organizador.brandingPanel])

  return (
    <div className="flex min-h-dvh flex-col bg-superficie text-texto">
      <header className="sticky top-0 z-10 border-b border-borde bg-superficie/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            to="/panel"
            className="-ml-2 flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-lg text-sm text-texto-suave hover:bg-superficie hover:text-texto"
          >
            <span aria-hidden="true">←</span>
            <span className="sr-only">{t('layout.volver')}</span>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-texto">{organizador.nombre}</p>
            <p className="truncate text-xs text-texto-suave">
              Plan {organizador.plan} · {organizador.estadoSuscripcion}
            </p>
          </div>
          <Link
            to="/panel/cuenta"
            className="flex min-h-[var(--touch-min)] items-center rounded-lg border border-borde px-3 text-xs font-medium text-texto hover:bg-superficie"
          >
            {t('layout.cuenta')}
          </Link>
          <IdiomaToggle />
          <TemaToggle />
          <button
            type="button"
            onClick={handleSalir}
            disabled={saliendo}
            className="flex min-h-[var(--touch-min)] items-center rounded-lg border border-borde px-3 text-xs font-medium text-texto-suave hover:bg-superficie hover:text-texto disabled:opacity-60"
          >
            {saliendo ? t('layout.saliendo') : t('layout.salir')}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-28">
        <Outlet />
      </main>

      {/* La acción principal está fija abajo, al alcance del pulgar. Es la
          diferencia entre crear un evento en la puerta con una mano y con
          dos, que es como se usa el panel. `pb-28` en el main le deja el
          lugar para no quedar tapada por el teclado del formulario. */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-borde bg-superficie pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-2xl px-4 py-3">
          <Link
            to="/panel/eventos/nuevo"
            className="flex min-h-[var(--touch-min)] w-full items-center justify-center gap-2 rounded-xl bg-primario px-4 text-sm font-semibold text-sobre-primario"
          >
            {t('layout.crear')}
          </Link>
        </div>
      </nav>
    </div>
  )
}
