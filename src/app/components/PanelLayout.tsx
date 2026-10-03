import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'

import { aplicarTema } from '../../shared/theming'
import { useOrganizador } from '../ContextoOrganizador'
import { salir } from '../../services/auth'

/**
 * Cáscara común de todas las pantallas del panel.
 *
 * Hace tres cosas, y las tres importan:
 *
 * 1. Da la chrome comun a las pantallas del panel. El documento del
 *    organizador lo trae el contexto de Protegido, asi que las pantallas
 *    hijas no lo vuelven a pedir.
 *
 * 2. Aplica el tema del organizador con un useEffect. Va en un efecto y
 *    no en el render a propósito: aplicarTema escribe en el DOM, y
 *    escribir en el DOM durante el render es un efecto secundario. Con
 *    el efecto, además, el tema sobrevive a la navegación entre pantallas
 *    porque la variable CSS vive en documentElement, no en el componente
 *    que la puso.
 *
 * 3. Da la barra de arriba. En un celular, el botón de volver tiene que
 *    estar a la altura del pulgar: por eso los botones miden
 *    var(--touch-min) y el padding respeta el safe-area.
 */

export default function PanelLayout() {
  const organizador = useOrganizador()
  const navegar = useNavigate()
  const [saliendo, setSaliendo] = useState(false)

  /**
   * Logout.
   *
   * No es un detalle de la UI: es la única forma de que un cambio de
   * custom claims se vea. Los claims van horneados en el ID token cuando
   * Firebase lo emite, y ese token se cachea una hora. Si a un
   * super-admin le ponen `admin: true` y recarga con F5, sigue entrando
   * con el token viejo y el panel lo expulsa igual. Lo único que renueva el
   * token de verdad es volver a autenticarse, así que sin este botón el
   * síntoma es "puse el claim y no cambió nada" y no hay salida.
   *
   * `replace` en el navigate para que el login no quede en el historial:
   * apretar "atrás" después de salir no debe devolver a una sesión que ya
   * no existe.
   */
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
    // `document.documentElement` y no un div contenedor: las variables
    // tienen que estar en el ancestro más alto para que las use todo lo
    // que cuelgue del body, incluidas las pantallas que se montan después
    // por navegación.
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
            <span className="sr-only">Volver al panel</span>
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
            Cuenta
          </Link>
          <Link
            to="/panel/branding"
            className="flex min-h-[var(--touch-min)] items-center rounded-lg border border-borde px-3 text-xs font-medium text-texto hover:bg-superficie"
          >
            Marca
          </Link>
          <button
            type="button"
            onClick={handleSalir}
            disabled={saliendo}
            className="flex min-h-[var(--touch-min)] items-center rounded-lg border border-borde px-3 text-xs font-medium text-texto-suave hover:bg-superficie hover:text-texto disabled:opacity-60"
          >
            {saliendo ? 'Saliendo…' : 'Salir'}
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
            Crear evento
          </Link>
        </div>
      </nav>
    </div>
  )
}
