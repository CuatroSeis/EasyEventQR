import { createContext, useContext, type ReactNode } from 'react'

import type { Organizador } from '../shared/types'

/**
 * El documento del organizador, compartido por todo el panel.
 *
 * Existe para dos cosas concretas.
 *
 * 1. Que no se pida en cada pantalla. Firestore no es caro, pero
 *    pedir el mismo documento en cada render es lo que hace que una app
 *    se sienta lenta sin que se sepa por qué. `Protegido` lo lee UNA vez
 *    y lo pasa por acá.
 *
 * 2. Que guardarlo actualice la pantalla sin recargar. El editor de
 *    branding cambia `brandingPanel`, y el tema del panel se deriva de
 *    ahí. Si el guardado no actualizara este valor, el tema se vería
 *    viejo hasta el próximo refresh, y el mensaje "guardado, ya se ve"
 *    sería mentira. Con `actualizar` el tema se reaplica en el mismo
 *    render en que llega el dato nuevo.
 *
 * OJO: esto es estado de UI, no una copia de la base. Firestore sigue
 * siendo la verdad; acá está lo último que se leyó, que es lo que la
 * pantalla muestra.
 */
export interface ValorContextoOrganizador {
  organizador: Organizador
  /**
   * Reemplaza el documento en memoria después de una escritura exitosa.
   * Se llama con lo que devolvió el service, no con lo que la pantalla
   * cree que envió: si la UI predijera el resultado y se equivocara, el
   * tema y los datos quedarían distintos hasta el refresh.
   */
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
 * Lee el organizador del contexto.
 *
 * Tira si se usa fuera del provider. Es deliberado: un `undefined`
 * silencioso se convierte en un `organizador.nombre` que reventa tres
 * niveles más adentro, en un componente que no tiene nada que ver con
 * el contexto y con un error que no señala la causa. Acá el error dice
 * exactamente qué falta.
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
