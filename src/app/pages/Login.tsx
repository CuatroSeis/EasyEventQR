import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { entrarConGoogle } from '../../services/auth'
import { firebaseConfigurado } from '../../services/config'

/**
 * Pantalla de login.
 *
 * Un solo botón y el logo: es lo único que Google permite sin pedirle
 * nada al usuario, y pedirle el nombre y el apellido además del email
 * no aporta nada en un producto donde el organizador se identifica con
 * la cuenta de Google.
 */
export default function Login() {
  const [estado, setEstado] = useState<'inicial' | 'entrando' | 'error'>('inicial')
  const [mensaje, setMensaje] = useState('')
  const navegar = useNavigate()
  const ubicacion = useLocation()

  // Destino post-login (default /panel).
  const destino =
    (ubicacion.state as { desde?: string } | null)?.desde ?? '/panel'

  async function manejarLogin() {
    setEstado('entrando')
    setMensaje('')
    try {
      await entrarConGoogle()
      navegar(destino, { replace: true })
    } catch (error) {
      setEstado('error')
      // Popup cerrado = cambió de idea, no es error: mensaje neutro.
      const codigo = (error as { code?: string }).code ?? ''
      setMensaje(
        codigo === 'auth/popup-closed-by-user'
          ? 'Cerraste la ventana de Google. Podés intentarlo de nuevo.'
          : 'No se pudo iniciar sesión. Revisá tu conexión o probá de nuevo.',
      )
      setEstado('inicial')
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">EasyEventQR</h1>
        <p className="mt-2 text-sm text-slate-600">
          Entrá para gestionar tus eventos y las reservas de tus invitados.
        </p>
      </div>

      <button
        type="button"
        onClick={manejarLogin}
        disabled={estado === 'entrando' || !firebaseConfigurado}
        className="w-full rounded-lg bg-primario px-4 py-3 text-sm font-semibold text-sobre-primario transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        {estado === 'entrando' ? 'Entrando…' : 'Continuar con Google'}
      </button>

      {estado === 'error' && mensaje && (
        <p role="alert" className="text-center text-sm text-red-600">
          {mensaje}
        </p>
      )}

      {!firebaseConfigurado && (
        // Errores con paleta fija (no del tema): si no, se confunden con la marca.
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-xs text-slate-700">
          Falta configurar Firebase. Completá el <code>.env</code> y reiniciá{' '}
          <code>npm run dev</code>. Está todo en el README.
        </p>
      )}

      {/* `min-h-11` son 44px: el texto sigue siendo de 12px, pero el
          área que hay que tocar pasa de 16px de alto a 44px, que es lo
          que un dedo necesita para acertar. `inline-flex` es necesario
          porque un `<a>` inline ignora height por defecto. */}
      <Link
        to="/"
        className="inline-flex min-h-11 items-center px-2 text-xs text-slate-500 underline"
      >
        Volver al inicio
      </Link>
    </main>
  )
}
