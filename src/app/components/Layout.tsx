import { Fragment, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useOrganizadorEditable } from '../ContextoOrganizador'
import { salir } from '../../services/auth'

/**
 * Layout del panel del organizador.
 * Navbar consistente en desktop, drawer en mobile.
 * Requiere que el organizador esté autenticado (envuelto por <Protegido>).
 */
export default function Layout() {
  const { organizador, actualizar } = useOrganizadorEditable()
  const navegar = useNavigate()
  const ubicacion = useLocation()
  const [drawerAbierto, setDrawerAbierto] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const rutas = [
    { href: '/panel', label: 'Mis eventos', icon: '📅' },
    { href: '/panel/cuenta', label: 'Cuenta', icon: '👤' },
  ] as const

  function estaActiva(href: string) {
    return ubicacion.pathname === href || ubicacion.pathname.startsWith(href + '/')
  }

  async function handleLogout() {
    try {
      await salir()
      actualizar({ ...organizador, nombre: '' } as any)
      navegar('/entrar', { replace: true })
    } catch {
      import('../../shared/toast').then(m => m.t.error('No se pudo cerrar la sesión'))
    }
  }

  async function handleEliminarCuenta() {
    if (!window.confirm('¿Eliminar tu cuenta definitivamente? Se borrarán TODOS tus eventos y reservas. No se puede deshacer.')) return
    if (!window.confirm('Última confirmación: ¿borrar definitivamente tu cuenta y todos tus datos?')) return

    setEliminando(true)
    try {
      const { reautenticarParaEliminar, eliminarCuenta } = await import('../../services/perfil')
      await reautenticarParaEliminar()
      await eliminarCuenta()
      const { salir } = await import('../../services/auth')
      await salir()
      import('../../shared/toast').then(m => m.t.success('Cuenta eliminada'))
      navegar('/', { replace: true })
    } catch (e) {
      if (e instanceof Error && e.message.includes('popup')) {
        import('../../shared/toast').then(m => m.t.info('Cerraste la ventana de confirmación'))
      } else {
        import('../../shared/toast').then(m => m.t.error(e instanceof Error ? e.message : 'No se pudo eliminar la cuenta'))
      }
    } finally {
      setEliminando(false)
    }
  }

  return (
    <Fragment>
      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-superficie border-r border-borde transform transition-transform duration-200 lg:hidden ${drawerAbierto ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Menú principal"
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-borde">
            <Link to="/panel" className="font-bold text-xl text-texto">EasyEventQR</Link>
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {rutas.map((r) => (
              <Link
                key={r.href}
                to={r.href}
                onClick={() => setDrawerAbierto(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  estaActiva(r.href)
                    ? 'bg-primario text-sobre-primario'
                    : 'text-texto hover:bg-superficie'
                }`}
              >
                <span aria-hidden>{r.icon}</span>
                {r.label}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t border-borde space-y-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 rounded-xl border border-borde px-3 py-2 text-sm text-texto hover:bg-superficie"
            >
              <span aria-hidden>🚪</span>
              Cerrar sesión
            </button>
            <button
              onClick={handleEliminarCuenta}
              disabled={eliminando}
              className="w-full flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              <span aria-hidden>🗑️</span>
              {eliminando ? 'Eliminando…' : 'Eliminar cuenta'}
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay para cerrar drawer */}
      {drawerAbierto && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setDrawerAbierto(false)}
          aria-hidden
        />
      )}

      {/* Header desktop */}
      <header className="hidden lg:flex items-center justify-between gap-4 border-b border-borde bg-superficie px-6 py-3 sticky top-0 z-20">
        <Link to="/panel" className="font-bold text-xl text-texto">EasyEventQR</Link>
        <nav className="flex items-center gap-1">
          {rutas.map((r) => (
            <Link
              key={r.href}
              to={r.href}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                estaActiva(r.href)
                  ? 'bg-primario text-sobre-primario'
                  : 'text-texto hover:bg-superficie'
              }`}
            >
              <span aria-hidden>{r.icon}</span>
              {r.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 ml-auto">
          <div className="relative group">
            <button
              id="avatar-btn"
              className="flex items-center gap-2 rounded-full bg-primario px-3 py-1.5 text-sm font-medium text-sobre-primario hover:opacity-90"
              aria-haspopup="true"
              aria-expanded="false"
            >
              <span className="size-8 rounded-full bg-sobre-primario/20 flex items-center justify-center text-sm font-medium text-primario">
                {organizador?.nombre?.charAt(0).toUpperCase() ?? '?'}
              </span>
              <span className="hidden sm:block truncate max-w-[120px] text-sobre-primario">{organizador?.nombre}</span>
            </button>
            <div
              className="absolute right-0 mt-2 w-48 rounded-xl border border-borde bg-superficie py-1 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition"
              role="menu"
            >
              <Link
                to="/panel/cuenta"
                className="block px-3 py-2 text-sm text-texto hover:bg-superficie"
                role="menuitem"
              >
                Cuenta
              </Link>
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 text-sm text-texto hover:bg-superficie"
                role="menuitem"
              >
                Cerrar sesión
              </button>
              <hr className="my-1 border-borde" />
              <button
                onClick={handleEliminarCuenta}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                role="menuitem"
              >
                Eliminar cuenta
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile header */}
      <header className="lg:hidden sticky top-0 z-20 border-b border-borde bg-superficie px-4 py-3">
        <div className="flex items-center justify-between">
          <Link to="/panel" className="font-bold text-xl text-texto">EasyEventQR</Link>
          <button
            onClick={() => setDrawerAbierto(true)}
            className="rounded-lg border border-borde p-2 text-texto"
            aria-label="Abrir menú"
          >
            ☰
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-6">
        <Outlet />
      </main>
    </Fragment>
  )
}