import { useState, type FormEvent } from 'react'

import { useOrganizadorEditable } from '../ContextoOrganizador'
import { guardarBranding, type ColorElegido } from '../../services/branding'
import { colorDeTextoSobre, esColorValido } from '../../shared/theming'

/**
 * Editor de branding del panel.
 *
 * El alcance es color, no imágenes. El logo necesita subir una imagen y
 * en el plan gratis no hay Firebase Storage (exige Blaze), así que
 * subirla implica comprimirla en el navegador y guardarla en un documento
 * aparte. Eso es trabajo de la Fase 3, y metido acá sería la mitad de la
 * fase.
 *
 * El selector de logo NO se esconde: se muestra deshabilitado con el
 * motivo al lado. Escribir "tu plan no incluye logo" al lado de un
 * campo que no está explica el producto. Esconderlo deja al organizador
 * buscando una función que no existe.
 *
 * Y el límite no está en esta pantalla: la regla lo aplica. Si alguien
 * destapara el campo desde la consola, `respetaLimiteDeLogo()` lo
 * rechaza. Esta UI anticipa el error, no lo reemplaza.
 */
export default function Branding() {
  const { organizador, actualizar } = useOrganizadorEditable()
  const [nombre, setNombre] = useState(organizador.nombre)
  const [primario, setPrimario] = useState<ColorElegido>(organizador.brandingPanel.colorPrimario)
  const [secundario, setSecundario] = useState<ColorElegido>(
    organizador.brandingPanel.colorSecundario,
  )
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const limites = organizador.limitesPersonalizacion
  const colorPermitido = limites.colorPersonalizadoPermitido
  const logoPermitido = limites.logoPermitido

  /**
   * OJO con el `preventDefault()`: sin él el navegador hace el submit nativo
   * del <form> y recarga la página. Se veía "Guardando…" un instante y
   * después la pantalla se reiniciaba sin guardar nada, porque la navegación
   * cancelaba el `updateDoc` a medio camino. Mismo patrón que EventoForm.tsx.
   */
  async function enviar(e: FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    setGuardado(false)
    try {
      const actualizado = await guardarBranding(organizador, {
        nombre,
        colorPrimario: colorPermitido ? primario : undefined,
        colorSecundario: colorPermitido ? secundario : undefined,
      })
      setPrimario(actualizado.brandingPanel.colorPrimario)
      setSecundario(actualizado.brandingPanel.colorSecundario)
      setNombre(actualizado.nombre)
      // Esto es lo que hace que el boton de abajo cambie de color al
      // instante. Sin esto el guardado se veria bien pero el panel
      // seguiria con el color viejo hasta el proximo refresh, y el
      // mensaje "ya se ve" seria mentira.
      actualizar(actualizado)
      setGuardado(true)
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar.')
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
      <h1 className="text-lg font-bold text-texto">Tu marca</h1>

      {guardado ? (
        <p role="status" className="rounded-xl border border-borde p-3 text-sm text-texto">
          Guardado. El panel ya se ve con esos colores.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-borde p-3 text-sm text-texto">
          {error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-texto">Nombre visible</span>
        <input
          className="campo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoComplete="off"
        />
        <span className="text-xs text-texto-suave">Es el nombre que ven tus clientes en el panel.</span>
      </label>

      <SelectorColor
        etiqueta="Color principal"
        ayuda="El color de los botones y las acciones."
        valor={primario}
        deshabilitado={!colorPermitido}
        motivo={!colorPermitido ? 'Tu plan no incluye color personalizado.' : undefined}
        onChange={setPrimario}
      />

      <SelectorColor
        etiqueta="Color secundario"
        ayuda="Se usa para los acentos."
        valor={secundario}
        deshabilitado={!colorPermitido}
        motivo={!colorPermitido ? 'Tu plan no incluye color personalizado.' : undefined}
        onChange={setSecundario}
      />

      <fieldset
        disabled
        className="flex flex-col gap-2 rounded-xl border border-dashed border-borde p-4"
      >
        <legend className="px-1 text-sm font-medium text-texto-suave">Logo</legend>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-borde text-xs text-texto-suave">
            {logoPermitido ? '—' : 'Bloqueado'}
          </div>
          <p className="text-xs text-texto-suave">
            {logoPermitido
              ? 'Próximamente. Por ahora el logo se usa en la página pública del evento.'
              : 'El logo está disponible en el plan pro+.'}
          </p>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={guardando}
        className="min-h-[var(--touch-min)] rounded-xl bg-primario px-4 text-sm font-semibold text-sobre-primario disabled:opacity-60"
      >
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}

/**
 * Selector de color: un input[type=color] y un campo de texto al lado.
 *
 * El input de color es cómodo con el dedo y no admite nada que no sea un
 * hex, pero no deja escribir el valor exacto. El campo de texto sí. Los
 * dos juntos, porque elegir "#2563eb" a ojo es imposible y escribirlo a
 * mano en un selector de color no se puede.
 *
 * Con `esColorValido` se valida antes de escribir: si el usuario está a
 * mitad de escribir "#2", el borde se pone de advertencia en vez de
 * guardar un color roto.
 */
function SelectorColor({
  etiqueta,
  ayuda,
  valor,
  onChange,
  deshabilitado,
  motivo,
}: {
  etiqueta: string
  ayuda: string
  valor: ColorElegido
  onChange: (valor: ColorElegido) => void
  deshabilitado: boolean
  motivo?: string
}) {
  // El input type=color no acepta null, así que el "sin personalizar"
  // se muestra con el default del tema mientras no haya valor.
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
          placeholder="Sin personalizar"
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
            Quitar
          </button>
        )}
      </div>
      {motivo ? (
        <span className="text-xs text-texto-suave">{motivo}</span>
      ) : valido ? (
        <span className="text-xs text-texto-suave">{ayuda}</span>
      ) : (
        <span role="alert" className="text-xs text-texto-suave">
          Eso no es un color. Va algo como #2563eb.
        </span>
      )}
      <MuestraContraste color={valor} />
    </div>
  )
}

/**
 * Muestra el color con el texto que se pondría encima.
 *
 * No es adorno: es la respuesta a "¿y si elijo un amarillo y los botones
 * quedan con texto blanco?". Con la muestra se ve el problema antes de
 * guardar, sin tener que confiar en que colorDeTextoSobre() hizo bien su
 * trabajo.
 */
function MuestraContraste({ color }: { color: ColorElegido }) {
  if (color === null || !esColorValido(color)) return null
  return (
    <div
      className="mt-1 flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold"
      style={{ backgroundColor: color, color: colorDeTextoSobre(color) }}
    >
      Así se va a ver
    </div>
  )
}
