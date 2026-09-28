import { doc, updateDoc } from 'firebase/firestore'

import { db } from './firebase'
import { esColorValido } from '../shared/theming'
import type { Organizador } from '../shared/types'

/**
 * El branding del panel del organizador.
 *
 * Es la única parte de la cuenta que el cliente puede escribir, junto con
 * `nombre`. Dos campos y poco más, pero cada uno tiene un límite detrás
 * y las reglas los hacen cumplir:
 *
 *   - el color, si `limitesPersonalizacion.colorPersonalizadoPermitido`
 *   - el logo, sólo con `logoPermitido` (o sea, pro+ o excepción)
 *
 * Que las reglas lo lean del documento del organizador (y no de una tabla
 * hardcodeada) es lo que hace que una excepción comercial se respete sin
 * redeployar. Acá la UI sólo se adelanta: muestra el logo bloqueado en
 * vez de esconderlo, para que el plan se entienda. Si la UI mintiera y
 * permitiera poner el logo, la regla lo rechazaría igual.
 */

/** El color a guardar: un hex válido, o null para volver al default. */
export type ColorElegido = string | null

export interface CambiosBranding {
  nombre?: string
  colorPrimario?: ColorElegido
  colorSecundario?: ColorElegido
}

/** Traduce un error de permiso de Firestore a algo que se pueda mostrar. */
function explicarError(error: unknown): Error {
  const codigo = (error as { code?: string } | null)?.code ?? ''
  if (codigo === 'permission-denied') {
    return new Error('Tu plan no permite ese cambio. Si debería, es un tema de permisos de la cuenta.')
  }
  if (codigo === 'unavailable') {
    return new Error('No pudimos guardar. Revisá la conexión y probá de nuevo.')
  }
  return new Error('No se pudo guardar el cambio.')
}

/**
 * Guarda nombre y/o colores.
 *
 * `updateDoc` parcial y con lista blanca, por dos razones.
 *
 * La lista blanca: mandar el objeto entero con `setDoc` intentaría
 * escribir `plan` y `limitesPersonalizacion`, que son intocables, y las
 * reglas rechazarían el update entero con noCambiaPrivilegios(). Un
 * formulario que manda de más es un formulario que no guarda nunca.
 *
 * Y parcial de verdad: se manda sólo lo que cambió. Además de gastar
 * menos, evita que un color que el usuario no está tocando se reescriba
 * con un valor viejo del estado local.
 */
export async function guardarBranding(
  organizador: Organizador,
  cambios: CambiosBranding,
): Promise<Organizador> {
  const limpio: Record<string, unknown> = {}
  const panel: Record<string, unknown> = {}

  if (typeof cambios.nombre === 'string' && cambios.nombre.trim()) {
    limpio.nombre = cambios.nombre.trim()
  }

  // Un color inválido NO se manda: se ignora. Si se mandara, la regla
  // compararía contra resource.data, lo rechazaría, y el usuario vería
  // un error de permisos por escribir "azul" en un campo de color. Peor:
  // si la regla lo aceptara, el CSS quedaría con --c-primario: azul, que
  // no es lo que el usuario quiso escribir.
  //
  // Un null sí se manda, y es distinto: es "sacá la personalización", y lo
  // trata escribirColor() quitando la variable CSS.
  if (cambios.colorPrimario !== undefined) {
    if (cambios.colorPrimario === null) panel.colorPrimario = null
    else if (esColorValido(cambios.colorPrimario)) panel.colorPrimario = cambios.colorPrimario.trim()
  }

  if (cambios.colorSecundario !== undefined) {
    if (cambios.colorSecundario === null) panel.colorSecundario = null
    else if (esColorValido(cambios.colorSecundario)) panel.colorSecundario = cambios.colorSecundario.trim()
  }

  // `updateDoc` hace merge profundo, así que mandar sólo los colores
  // tocados deja intactos `logoUrl` y el otro color. No hace falta mandar
  // el brandingPanel entero, y mandarlo sería mandar de más.
  if (Object.keys(panel).length > 0) limpio.brandingPanel = panel

  if (Object.keys(limpio).length === 0) {
    return organizador
  }

  try {
    await updateDoc(doc(db, 'organizadores', organizador.uid), limpio)
  } catch (error) {
    throw explicarError(error)
  }

  // Devuelvo el documento con los cambios ya aplicados, para que la UI
  // pueda tematizarse al instante sin esperar un segundo getDoc. Es la
  // MISMA operación que grabó en Firestore, no una predicción: si el
  // estado local se actualizara distinto de lo que se grabó, el tema y
  // los datos disagree y el error recién se ve al recargar.
  return {
    ...organizador,
    ...(typeof limpio.nombre === 'string' ? { nombre: limpio.nombre } : {}),
    brandingPanel: { ...organizador.brandingPanel, ...panel },
  }
}
