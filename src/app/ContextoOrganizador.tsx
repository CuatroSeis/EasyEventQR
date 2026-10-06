import { createContext, useContext, type ReactNode } from 'react'

import type { Organizador } from '../shared/types'

/** Organizador compartido por todo el panel (se lee una vez en Protegido). */
export interface ValorContextoOrganizador {
  organizador: Organizador
  /** Reemplaza el doc en memoria con lo que devolvió el service (nunca con lo que la UI cree que envió). */
  actualizar: (organizador: Organizador) => void
}

const Contexto = createContext<ValorContextoOrganizador | null>(null)

export function ProveedorOrganizador({
  valor,
  children,
}: {
  valor: ValorContextoOrganizador
  children: ReactNode
}) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/**
 * Lee el organizador del contexto. Tira fuera del provider a propósito:
 * un `undefined` silencioso revienta tres niveles más adentro sin pista.
 */
export function useOrganizador(): Organizador {
  const valor = useContext(Contexto)
  if (!valor) {
    throw new Error(
      'useOrganizador se usó fuera del panel. Las rutas /panel/* tienen que estar dentro de Protegido.',
    )
  }
  return valor.organizador
}

/** Como useOrganizador, pero además la función para actualizarla. */
export function useOrganizadorEditable(): ValorContextoOrganizador {
  const valor = useContext(Contexto)
  if (!valor) {
    throw new Error(
      'useOrganizadorEditable se usó fuera del panel. Las rutas /panel/* tienen que estar dentro de Protegido.',
    )
  }
  return valor
}
