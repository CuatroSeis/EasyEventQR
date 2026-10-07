import { useState, type FormEvent } from 'react'

import { useOrganizadorEditable } from '../ContextoOrganizador'
import { guardarBranding, type ColorElegido } from '../../services/branding'
import { useIdioma } from '../components/IdiomaContext'
import type { ClaveTexto } from '../../shared/i18n'
import { colorDeTextoSobre, esColorValido } from '../../shared/theming'

/** Editor de marca: colores, copy de landing y estado del logo (se sube en Cuenta). Los límites los aplica la regla, no esta pantalla. */
/** Formulario de marca y landing. Vive como sección de Cuenta (misma pantalla, guardados separados por sección). */
export function SeccionMarca() {
  const { organizador, actualizar } = useOrganizadorEditable()
  const { t } = useIdioma()
  const [primario, setPrimario] = useState<ColorElegido>(organizador.brandingPanel.colorPrimario)
  const [secundario, setSecundario] = useState<ColorElegido>(
    organizador.brandingPanel.colorSecundario,
  )
  const [textoBienvenida, setTextoBienvenida] = useState(organizador.textoBienvenida ?? '')
  const [textoConfirmacion, setTextoConfirmacion] = useState(organizador.textoConfirmacion ?? '')
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const limites = organizador.limitesPersonalizacion
  const colorPermitido = limites.colorPersonalizadoPermitido
  const logoPermitido = limites.logoPermitido

  /** Sin `preventDefault()` el submit nativo recarga y cancela el `updateDoc` a medio camino. */
  async function enviar(e: FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    setGuardado(false)
    try {
      // El nombre vive en Perfil (misma pantalla): acá solo colores y copy.
      const actualizado = await guardarBranding(organizador, {
        colorPrimario: colorPermitido ? primario : undefined,
        colorSecundario: colorPermitido ? secundario : undefined,
      })
      try {
        const { actualizarPerfil } = await import('../../services/perfil')
        await actualizarPerfil(organizador.uid, { textoBienvenida, textoConfirmacion })
      } catch (falloPerfil) {
        setError(falloPerfil instanceof Error ? falloPerfil.message : t('marca.err.landing'))
        return
      }
      setPrimario(actualizado.brandingPanel.colorPrimario)
      setSecundario(actualizado.brandingPanel.colorSecundario)
      // Esto es lo que hace que el boton de abajo cambie de color al
      // instante. Sin esto el guardado se veria bien pero el panel
      // seguiria con el color viejo hasta el proximo refresh, y el
      // mensaje "ya se ve" seria mentira.
      actualizar(actualizado)
      setGuardado(true)
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : t('marca.err.guardar'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-5"
      noValidate
      aria-busy={guardando}
    >
      <h2 id="marca-heading" className="text-xl font-bold text-texto">{t('marca.titulo')}</h2>

      {guardado ? (
        <p role="status" className="rounded-xl border border-borde p-3 text-sm text-texto">
          {t('marca.guardado')}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-borde p-3 text-sm text-texto">
          {error}
        </p>
      ) : null}

      <SelectorColor
        etiqueta={t('marca.color1')}
        ayuda={t('marca.color1.d')}
        valor={primario}
        deshabilitado={!colorPermitido}
        motivo={!colorPermitido ? t('marca.nocolor') : undefined}
        onChange={setPrimario}
        t={t}
      />

      <SelectorColor
        etiqueta={t('marca.color2')}
        ayuda={t('marca.color2.d')}
        valor={secundario}
        deshabilitado={!colorPermitido}
        motivo={!colorPermitido ? t('marca.nocolor') : undefined}
        onChange={setSecundario}
        t={t}
      />

      <fieldset
        disabled
        className="flex flex-col gap-2 rounded-xl border border-dashed border-borde p-4"
      >
        <legend className="px-1 text-sm font-medium text-texto-suave">{t('marca.logo')}</legend>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-borde text-xs text-texto-suave">
            {logoPermitido ? organizador.brandingPanel.logoUrl ? '✓' : '—' : t('marca.logo.bloq')}
          </div>
          <p className="text-xs text-texto-suave">
            {logoPermitido
              ? t('marca.logo.subir')
              : t('marca.logo.pro')}
          </p>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-borde p-4">
        <legend className="px-1 text-sm font-medium text-texto">{t('marca.landing')}</legend>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-texto">{t('marca.bienv')}</span>
          <textarea
            className="campo min-h-20"
            value={textoBienvenida}
            onChange={(e) => setTextoBienvenida(e.target.value)}
            placeholder={t('marca.bienv.ph')}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-texto">{t('marca.conf')}</span>
          <textarea
            className="campo min-h-16"
            value={textoConfirmacion}
            onChange={(e) => setTextoConfirmacion(e.target.value)}
            placeholder={t('marca.conf.ph')}
          />
        </label>
        <p className="text-xs text-texto-suave">
          {t('marca.landing.d')}
        </p>
      </fieldset>

      <button
        type="submit"
        disabled={guardando}
        className="min-h-[var(--touch-min)] rounded-xl bg-primario px-4 text-sm font-semibold text-sobre-primario disabled:opacity-60"
      >
        {guardando ? t('marca.guardando') : t('marca.guardar')}
      </button>
    </form>
  )
}

/** Picker + texto: el picker no deja escribir el hex exacto, el texto sí. Valida con `esColorValido` mientras se escribe. */
function SelectorColor({
  etiqueta,
  ayuda,
  valor,
  onChange,
  deshabilitado,
  motivo,
  t,
}: {
  etiqueta: string
  ayuda: string
  valor: ColorElegido
  onChange: (valor: ColorElegido) => void
  deshabilitado: boolean
  motivo?: string
  t: (clave: ClaveTexto) => string
}) {
  // type=color no acepta null: mientras tanto se muestra el default.
  const efectivo = valor ?? '#2563eb'
  const valido = valor === null || esColorValido(valor)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-texto">{etiqueta}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${etiqueta}: selector`}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-borde bg-superficie p-1"
          value={efectivo}
          disabled={deshabilitado}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="campo font-mono"
          value={valor ?? ''}
          placeholder={t('marca.sincolor')}
          disabled={deshabilitado}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!valido}
        />
        {valor === null || deshabilitado ? null : (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-[var(--touch-min)] shrink-0 rounded-lg border border-borde px-3 text-xs text-texto"
          >
            {t('marca.quitar')}
          </button>
        )}
      </div>
      {motivo ? (
        <span className="text-xs text-texto-suave">{motivo}</span>
      ) : valido ? (
        <span className="text-xs text-texto-suave">{ayuda}</span>
      ) : (
        <span role="alert" className="text-xs text-texto-suave">
          {t('marca.malcolor')}
        </span>
      )}
      <MuestraContraste color={valor} t={t} />
    </div>
  )
}

/** Preview del contraste: muestra el problema antes de guardar. */
function MuestraContraste({ color, t }: { color: ColorElegido; t: (clave: ClaveTexto) => string }) {
  if (color === null || !esColorValido(color)) return null
  return (
    <div
      className="mt-1 flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold"
      style={{ backgroundColor: color, color: colorDeTextoSobre(color) }}
    >
      {t('marca.preview')}
    </div>
  )
}
