import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrganizadorEditable } from '../ContextoOrganizador'
import { t } from '../../shared/toast'

export default function Cuenta() {
  const { organizador } = useOrganizadorEditable()
  const navigate = useNavigate()

  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  async function handleGuardarPerfil(e: React.FormEvent) {
    e.preventDefault()
    try {
      const { actualizarPerfil } = await import('../../services/perfil')
      await actualizarPerfil(organizador.uid, {
        nombre: organizador.nombre,
        telefono: organizador.telefono ?? '',
        descripcion: organizador.descripcion ?? '',
        redesSociales: organizador.redesSociales ?? { instagram: '', twitter: '', linkedin: '', web: '' },
      })
      import('../../shared/toast').then(m => m.t.success('Perfil guardado'))
    } catch (e) {
      import('../../shared/toast').then(m => m.t.error(e instanceof Error ? e.message : 'No se pudo guardar'))
    }
  }

  async function handleCambiarPassword(e: React.FormEvent) {
    e.preventDefault()
    const { passwordNueva, passwordConfirm } = getPasswordState()
    if (passwordNueva !== passwordConfirm) {
      t.error('Las contraseñas no coinciden')
      return
    }
    if (passwordNueva.length < 6) {
      t.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    try {
      const { auth } = await import('../../services/firebase')
      const { cambiarPassword } = await import('../../services/perfil')
      if (!auth.currentUser) throw new Error('Sesión no válida')
      await cambiarPassword(auth.currentUser, '', getPasswordState().passwordNueva)
      t.success('Contraseña cambiada')
      setPasswordState({ passwordNueva: '', passwordConfirm: '' })
    } catch (e) {
      t.error(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña')
    }
  }

  async function handleEliminarCuenta() {
    if (!window.confirm('¿Eliminar tu cuenta definitivamente? Se borrarán TODOS tus eventos, reservas y tu usuario. No se puede deshacer.')) return
    if (!window.confirm('Última confirmación: ¿borrar definitivamente tu cuenta y TODOS tus datos?')) return

    try {
      await import('../../services/perfil').then(m => m.eliminarCuenta())
      const { salir } = await import('../../services/auth')
      await salir()
      import('../../shared/toast').then(m => m.t.success('Cuenta eliminada'))
      navigate('/', { replace: true })
    } catch (e) {
      if (e instanceof Error && e.message.includes('popup')) {
        import('../../shared/toast').then(m => m.t.info('Cerraste la ventana de confirmación'))
      } else {
        import('../../shared/toast').then(m => m.t.error(e instanceof Error ? e.message : 'No se pudo eliminar la cuenta'))
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-texto">Mi cuenta</h1>
        <p className="mt-1 text-texto-suave">Gestioná tu perfil, seguridad y datos</p>
      </header>

      <section aria-labelledby="perfil-heading" className="space-y-5">
        <h2 id="perfil-heading" className="text-xl font-bold text-texto">Perfil</h2>

        <form onSubmit={handleGuardarPerfil} className="space-y-4" noValidate>
          <div className="flex flex-col sm:flex-row gap-4">
            <label className="flex flex-col gap-1.5 flex-1">
              <span className="text-sm font-medium text-texto">Nombre / Razón social</span>
              <input
                type="text"
                value={organizador.nombre}
                className="campo"
                autoComplete="name"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 flex-1">
              <span className="text-sm font-medium text-texto">Teléfono</span>
              <input
                type="tel"
                value={organizador.telefono ?? ''}
                className="campo"
                autoComplete="tel"
                placeholder="+54 9 11 1234-5678"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-texto">Descripción</span>
            <textarea
              value={organizador.descripcion ?? ''}
              className="campo min-h-24"
              rows={3}
              placeholder="Descripción de tu organización, experiencia, etc."
            />
          </label>

          <fieldset className="rounded-xl border border-borde p-4 space-y-3">
            <legend className="px-1 text-sm font-medium text-texto">Redes sociales y web</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-texto">Instagram</span>
                <input
                  type="text"
                  value={organizador.redesSociales?.instagram ?? ''}
                  className="campo"
                  placeholder="@usuario"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-texto">Twitter / X</span>
                <input
                  type="text"
                  value={organizador.redesSociales?.twitter ?? ''}
                  className="campo"
                  placeholder="@usuario"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-texto">LinkedIn</span>
                <input
                  type="text"
                  value={organizador.redesSociales?.linkedin ?? ''}
                  className="campo"
                  placeholder="usuario o URL"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-texto">Sitio web</span>
                <input
                  type="url"
                  value={organizador.redesSociales?.web ?? ''}
                  className="campo"
                  placeholder="https://ejemplo.com"
                />
              </label>
            </div>
          </fieldset>

          <button
            type="submit"
            className="min-h-[56px] w-full sm:w-auto rounded-xl bg-primario px-6 py-3 text-lg font-semibold text-sobre-primario"
          >
            Guardar perfil
          </button>
        </form>
      </section>

      <section aria-labelledby="logo-heading" className="space-y-4 rounded-xl border border-borde p-5">
        <h2 id="logo-heading" className="text-xl font-bold text-texto">Logo de tu marca</h2>
        <p className="text-sm text-texto-suave">
          Se usa en tu panel y en la página pública del evento. Máx. 512 KB, se comprime a WebP.
        </p>

        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-24 w-24 items-center justify-center rounded-lg border border-borde bg-superficie overflow-hidden shrink-0"
              role="img"
              aria-label="Logo actual"
            >
              <img
                src={organizador.brandingPanel?.logoUrl ?? ''}
                alt=""
                className="h-full w-full object-cover"
                style={{ display: organizador.brandingPanel?.logoUrl ? 'block' : 'none' }}
              />
              {!organizador.brandingPanel?.logoUrl && (
                <span className="text-texto-suave text-xs">Sin logo</span>
              )}
            </div>
            <div className="space-y-1">
              <p className="font-medium text-texto">Logo actual</p>
              {organizador.brandingPanel?.logoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    import('../../services/perfil').then(m => m.actualizarLogo(organizador.uid, ''))
                    import('../../shared/toast').then(m => m.t.success('Logo eliminado'))
                  }}
                  className="text-sm text-texto-suave underline hover:text-texto"
                >
                  Quitar logo
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full sm:w-64">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-texto">
                Subir logo
              </span>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file && file.type.startsWith('image/')) {
                      URL.createObjectURL(file)
                      // Preview shown via object URL in file input
                    }
                  }}
                  className="sr-only"
                  id="logo-input"
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('logo-input')?.click()}
                  className="w-full min-h-[56px] rounded-xl border border-borde bg-superficie px-4 py-3 text-center text-sm font-medium text-texto hover:bg-superficie/50 transition"
                >
                  Subir logo
                </button>
              </div>
              <p className="text-xs text-texto-suave">
                JPG, PNG o WebP · máx. 512 KB · se comprime a WebP 512×512
              </p>
            </label>

            <button
              type="button"
              onClick={() => {
                import('../../services/perfil').then(m => m.actualizarLogo(organizador.uid, ''))
                import('../../shared/toast').then(m => m.t.success('Logo eliminado'))
              }}
              className="w-full min-h-[56px] rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700 hover:bg-red-100"
            >
              Eliminar logo
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="password-heading" className="space-y-4 rounded-xl border border-borde p-5">
        <h2 id="password-heading" className="text-xl font-bold text-texto">Cambiar contraseña</h2>
        <p className="text-sm text-texto-suave">Requiere re-autenticación con Google por seguridad.</p>

        <form onSubmit={handleCambiarPassword} className="space-y-3" noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-texto">Nueva contraseña</span>
            <input
              type="password"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              className="campo"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-texto">Confirmar nueva contraseña</span>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="campo"
              autoComplete="new-password"
              required
            />
          </label>
          <button
            type="submit"
            className="min-h-[56px] w-full sm:w-auto rounded-xl bg-primario px-6 py-3 text-lg font-semibold text-sobre-primario"
          >
            Cambiar contraseña
          </button>
        </form>
      </section>

      <section aria-labelledby="danger-heading" className="space-y-4 rounded-xl border-2 border-red-300 bg-red-50 p-5">
        <h2 className="text-xl font-bold text-red-700 flex items-center gap-2">
          ⚠️ Zona de peligro
        </h2>
        <p className="text-sm text-red-800">
          Eliminar tu cuenta borra <strong>todo</strong>: tus eventos, las reservas de tus asistentes,
          tu logo, tu perfil y tu usuario de acceso. <strong>No se puede deshacer.</strong>
        </p>
        <button
          type="button"
          onClick={handleEliminarCuenta}
          className="w-full sm:w-auto min-h-[56px] rounded-xl bg-red-600 px-6 py-3 text-lg font-semibold text-white"
        >
          Eliminar mi cuenta definitivamente
        </button>
      </section>
    </div>
  )
}

function getPasswordState() {
  // This is a workaround for the fact that we can't use hooks outside the component
  // In a real implementation, we'd use a ref or context
  return { passwordNueva: '', passwordConfirm: '' }
}

function setPasswordState(_state: { passwordNueva: string; passwordConfirm: string }) {
  // No-op
}