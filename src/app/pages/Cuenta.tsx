import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrganizadorEditable } from '../ContextoOrganizador'
import { SeccionMarca } from './Branding'
import { t } from '../../shared/toast'
import { useIdioma } from '../components/IdiomaContext'
import ConfirmModal from '../components/ConfirmModal'

export default function Cuenta() {
  const { organizador } = useOrganizadorEditable()
  const { t: txt } = useIdioma()
  const navigate = useNavigate()

  const [nombre, setNombre] = useState(organizador.nombre ?? '')
  const [telefono, setTelefono] = useState(organizador.telefono ?? '')
  const [descripcion, setDescripcion] = useState(organizador.descripcion ?? '')
  const [instagram, setInstagram] = useState(organizador.redesSociales?.instagram ?? '')
  const [twitter, setTwitter] = useState(organizador.redesSociales?.twitter ?? '')
  const [linkedin, setLinkedin] = useState(organizador.redesSociales?.linkedin ?? '')
  const [web, setWeb] = useState(organizador.redesSociales?.web ?? '')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [confirmaEliminar, setConfirmaEliminar] = useState(false)

  async function handleGuardarPerfil(e: React.FormEvent) {
    e.preventDefault()
    try {
      const { actualizarPerfil } = await import('../../services/perfil')
      await actualizarPerfil(organizador.uid, {
        nombre,
        telefono,
        descripcion,
        redesSociales: { instagram, twitter, linkedin, web },
      })
      import('../../shared/toast').then(m => m.t.success(txt('cuenta.toast.guardado')))
    } catch (e) {
      import('../../shared/toast').then(m => m.t.error(e instanceof Error ? e.message : txt('cuenta.toast.noguardar')))
    }
  }

  async function handleCambiarPassword(e: React.FormEvent) {
    e.preventDefault()
    if (passwordNueva !== passwordConfirm) {
      t.error(txt('cuenta.toast.pass.distintas'))
      return
    }
    if (passwordNueva.length < 6) {
      t.error(txt('cuenta.toast.pass.corta'))
      return
    }
    try {
      const { auth } = await import('../../services/firebase')
      const { cambiarPassword } = await import('../../services/perfil')
      if (!auth.currentUser) throw new Error(txt('cuenta.toast.sesion.no'))
      await cambiarPassword(auth.currentUser, '', passwordNueva)
      t.success(txt('cuenta.toast.pass.ok'))
      setPasswordNueva('')
      setPasswordConfirm('')
    } catch (e) {
      t.error(e instanceof Error ? e.message : txt('cuenta.toast.pass.no'))
    }
  }

  async function handleEliminarCuenta() {
    setConfirmaEliminar(false)
    try {
      await import('../../services/perfil').then(m => m.eliminarCuenta())
      const { salir } = await import('../../services/auth')
      await salir()
      import('../../shared/toast').then(m => m.t.success(txt('cuenta.toast.eliminada')))
      navigate('/', { replace: true })
    } catch (e) {
      if (e instanceof Error && e.message.includes('popup')) {
        import('../../shared/toast').then(m => m.t.info(txt('cuenta.toast.popup')))
      } else {
        import('../../shared/toast').then(m => m.t.error(e instanceof Error ? e.message : txt('cuenta.toast.noeliminar')))
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-texto">{txt('cuenta.titulo')}</h1>
        <p className="mt-1 text-texto-suave">{txt('cuenta.bajada')}</p>
      </header>

      <section aria-labelledby="perfil-heading" className="space-y-5">
        <h2 id="perfil-heading" className="text-xl font-bold text-texto">{txt('cuenta.perfil')}</h2>

        <form onSubmit={handleGuardarPerfil} className="space-y-4" noValidate>
          <div className="flex flex-col sm:flex-row gap-4">
            <label className="flex flex-col gap-1.5 flex-1">
              <span className="text-sm font-medium text-texto">{txt('cuenta.nombre')}</span>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="campo"
                autoComplete="name"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 flex-1">
              <span className="text-sm font-medium text-texto">{txt('cuenta.tel')}</span>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="campo"
                autoComplete="tel"
                placeholder={txt('cuenta.tel.ph')}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-texto">{txt('cuenta.desc')}</span>
            <textarea
              value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              className="campo min-h-24"
              rows={3}
              placeholder={txt('cuenta.desc.ph')}
            />
          </label>

          <fieldset className="rounded-xl border border-borde p-4 space-y-3">
            <legend className="px-1 text-sm font-medium text-texto">{txt('cuenta.redes')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-texto">Instagram</span>
                <input
                  type="text"
                  value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                  className="campo"
                  placeholder="@usuario"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-texto">Twitter / X</span>
                <input
                  type="text"
                  value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                  className="campo"
                  placeholder="@usuario"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-texto">LinkedIn</span>
                <input
                  type="text"
                  value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                  className="campo"
                  placeholder="usuario o URL"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-texto">{txt('cuenta.web')}</span>
                <input
                  type="url"
                  value={web}
                    onChange={(e) => setWeb(e.target.value)}
                  className="campo"
                  placeholder={txt('cuenta.web.ph')}
                />
              </label>
            </div>
          </fieldset>

          <button
            type="submit"
            className="min-h-[56px] w-full sm:w-auto rounded-xl bg-primario px-6 py-3 text-lg font-semibold text-sobre-primario"
          >
                        {txt('cuenta.guardarPerfil')}
          </button>
        </form>
      </section>

      <section aria-labelledby="logo-heading" className="space-y-4 rounded-xl border border-borde p-5">
        <h2 id="logo-heading" className="text-xl font-bold text-texto">{txt('cuenta.logo.t')}</h2>
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
                <span className="text-texto-suave text-xs">{txt('cuenta.logo.sin')}</span>
              )}
            </div>
            <div className="space-y-1">
              <p className="font-medium text-texto">{txt('cuenta.logo.actual')}</p>
              {organizador.brandingPanel?.logoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    import('../../services/perfil').then(m => m.actualizarLogo(organizador.uid, ''))
                import('../../shared/toast').then(m => m.t.success(txt('cuenta.toast.logo.del')))
                  }}
                  className="text-sm text-texto-suave underline hover:text-texto"
                >
                  {txt('cuenta.logo.quitar')}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full sm:w-64">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-texto">
                {txt('cuenta.logo.subir')}
              </span>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file || !file.type.startsWith('image/')) return
                    try {
                      const { subirLogo, actualizarLogo } = await import('../../services/perfil')
                      const base64 = await subirLogo(file)
                      await actualizarLogo(organizador.uid, base64)
                      import('../../shared/toast').then(m => m.t.success(txt('cuenta.toast.logo.ok')))
                    } catch (err) {
                      import('../../shared/toast').then(m => m.t.error(err instanceof Error ? err.message : txt('cuenta.toast.logo.no')))
                    } finally {
                      e.target.value = ''
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
                  {txt('cuenta.logo.subir')}
                </button>
              </div>
              <p className="text-xs text-texto-suave">
                {txt('cuenta.logo.formatos')}
              </p>
            </label>

            <button
              type="button"
              onClick={() => {
                import('../../services/perfil').then(m => m.actualizarLogo(organizador.uid, ''))
                import('../../shared/toast').then(m => m.t.success(txt('cuenta.toast.logo.del')))
              }}
              className="w-full min-h-[56px] rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700 hover:bg-red-100"
            >
              {txt('cuenta.logo.eliminar')}
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="marca-heading" className="space-y-4 rounded-xl border border-borde p-5">
        <SeccionMarca />
      </section>

      <section aria-labelledby="password-heading" className="space-y-4 rounded-xl border border-borde p-5">
        <h2 id="password-heading" className="text-xl font-bold text-texto">{txt('cuenta.pass.t')}</h2>
        <p className="text-sm text-texto-suave">{txt('cuenta.pass.d')}</p>

        <form onSubmit={handleCambiarPassword} className="space-y-3" noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-texto">{txt('cuenta.pass.nueva')}</span>
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
            <span className="text-sm font-medium text-texto">{txt('cuenta.pass.conf')}</span>
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
            {txt('cuenta.pass.boton')}
          </button>
        </form>
      </section>

      <section aria-labelledby="danger-heading" className="space-y-4 rounded-xl border-2 border-red-300 bg-red-50 p-5">
        <h2 className="text-xl font-bold text-red-700 flex items-center gap-2">
          ⚠️ {txt('cuenta.danger.t')}
        </h2>
        <p className="text-sm text-red-800">
          {txt('cuenta.danger.d1')} <strong>{txt('cuenta.danger.todo')}</strong>: {txt('cuenta.danger.d2')} <strong>{txt('cuenta.danger.no')}</strong>
        </p>
        <button
          type="button"
          onClick={() => setConfirmaEliminar(true)}
          className="w-full sm:w-auto min-h-[56px] rounded-xl bg-red-600 px-6 py-3 text-lg font-semibold text-white"
        >
          {txt('cuenta.danger.boton')}
        </button>
      </section>
      {confirmaEliminar ? (
        <ConfirmModal
          titulo={txt('cuenta.borrar.t')}
          mensaje={txt('cuenta.borrar.d')}
          confirmar={txt('cuenta.borrar.si')}
          onConfirmar={() => void handleEliminarCuenta()}
          onCerrar={() => setConfirmaEliminar(false)}
        />
      ) : null}
    </div>
  )
}