import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

import {
  guardarIdioma,
  leerIdioma,
  traducir,
  type ClaveTexto,
  type Idioma,
} from '../../shared/i18n'

interface ValorIdioma {
  idioma: Idioma
  cambiar: (idioma: Idioma) => void
  t: (clave: ClaveTexto, vars?: Record<string, string | number>) => string
}

const Contexto = createContext<ValorIdioma | null>(null)

/** Proveedor de idioma: default del navegador, toggle persiste en localStorage. */
export function ProveedorIdioma({ children }: { children: ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>(() => leerIdioma())

  const cambiar = useCallback((nuevo: Idioma) => {
    setIdioma(nuevo)
    guardarIdioma(nuevo)
  }, [])

  const t = useCallback(
    (clave: ClaveTexto, vars?: Record<string, string | number>) => traducir(idioma, clave, vars),
    [idioma],
  )

  return <Contexto.Provider value={{ idioma, cambiar, t }}>{children}</Contexto.Provider>
}

export function useIdioma(): ValorIdioma {
  const valor = useContext(Contexto)
  if (!valor) throw new Error('useIdioma fuera de ProveedorIdioma')
  return valor
}

/** Segmented Es/En de 44px. */
export function IdiomaToggle() {
  const { idioma, cambiar } = useIdioma()
  return (
    <div
      role="group"
      aria-label="Idioma / Language"
      className="flex min-h-[var(--touch-min)] items-center overflow-hidden rounded-lg border border-borde text-xs font-semibold"
    >
      {(['es', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => cambiar(l)}
          aria-pressed={idioma === l}
          className={`min-h-[var(--touch-min)] px-3 uppercase transition-colors ${
            idioma === l ? 'bg-primario text-sobre-primario' : 'text-texto-suave hover:text-texto'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
