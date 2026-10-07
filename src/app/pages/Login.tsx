import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { consumirRedirect, entrarConGoogle } from '../../services/auth'
import { useIdioma } from '../components/IdiomaContext'
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
  const { t } = useIdioma()
  const [estado, setEstado] = useState<'inicial' | 'entrando' | 'error'>('inicial')
  const [mensaje, setMensaje] = useState('')
  const navegar = useNavigate()
  const ubicacion = useLocation()

  // Destino post-login (default /panel).
  const destino =
    (ubicacion.state as { desde?: string } | null)?.desde ?? '/panel'

  // Al volver del redirect (mobile) puede haber un error pendiente:
  // sin esto, una falla queda como pantalla en blanco.
  useEffect(() => {
    let vivo = true
    consumirRedirect().catch((error: unknown) => {
      if (!vivo) return
      const codigo = (error as { code?: string }).code ?? ''
      setEstado('error')
      setMensaje(
        codigo === 'auth/account-exists-with-different-credential'
          ? t('login.duplicada')
          : codigo === 'auth/unauthorized-domain'
            ? t('login.noDominio')
            : t('login.error'),
      )
      setEstado('inicial')
    })
    return () => {
      vivo = false
    }
  }, [])

  async function manejarLogin() {
    setEstado('entrando')
    setMensaje('')
    try {
      const usuario = await entrarConGoogle()
      // `null` = se delegó al redirect: el navegador sale y vuelve solo.
      if (usuario === null) return
      navegar(destino, { replace: true })
    } catch (error) {
      setEstado('error')
      // Popup cerrado = cambió de idea, no es error: mensaje neutro.
      const codigo = (error as { code?: string }).code ?? ''
      setMensaje(
        codigo === 'auth/popup-closed-by-user'
          ? t('login.cerrado')
          : codigo === 'auth/popup-blocked'
            ? t('login.bloqueado')
            : t('login.error'),
      )
      setEstado('inicial')
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">{t('login.titulo')}</h1>
          <p className="mt-2 text-sm text-slate-600">{t('login.bajada')}</p>
      </div>

      <button
        type="button"
        onClick={manejarLogin}
        disabled={estado === 'entrando' || !firebaseConfigurado}
        className="w-full rounded-lg bg-primario px-4 py-3 text-sm font-semibold text-sobre-primario transition disabled:cursor-not-allowed disabled:opacity-60"
      >
          {estado === 'entrando' ? t('login.entrando') : t('login.boton')}
      </button>

      {estado === 'error' && mensaje && (
        <p role="alert" className="text-center text-sm text-red-600">
          {mensaje}
        </p>
      )}

      {!firebaseConfigurado && (
        // Errores con paleta fija (no del tema): si no, se confunden con la marca.
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-xs text-slate-700">
            {t('login.sinFirebase.titulo')}
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
        {t('login.volver')}
      </Link>
    </main>
  )
}
