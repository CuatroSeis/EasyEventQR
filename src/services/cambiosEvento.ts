import type { BorradorEvento } from './documentoEvento.ts'
import { normalizarTexto } from '../shared/utils.ts'
import { esCategoria } from '../shared/categorias.ts'

/** Los campos que el organizador puede cambiar de un evento. */
export type CambiosEvento = Partial<BorradorEvento>

/**
 * Convierte el formulario en un objeto de update seguro para Firestore.
 *
 * Sólo devuelve campos con valor real y soportados; no pisa lo que el
 * formulario no envía y descarta valores que no conoce el modelo. Actualizar
 * con esto es lo que hace posible agregar un campo en el formulario sin
 * depender de que la llamada mande "todo completo".
 */
export function cambiosEventoLimpios(cambios: CambiosEvento): Record<string, unknown> {
  const limpio: Record<string, unknown> = {}

  if (typeof cambios.nombre === 'string') {
    limpio.nombre = cambios.nombre.trim()
    // El nombre normalizado viaja con el nombre: si no, la búsqueda por
    // nombre queda apuntando al nombre viejo y el evento "desaparece".
    limpio.nombreNormalizado = normalizarTexto(cambios.nombre.trim())
  }
  if (cambios.fecha instanceof Date) limpio.fecha = cambios.fecha
  if (typeof cambios.lugar === 'string') limpio.lugar = cambios.lugar.trim()
  if (typeof cambios.descripcion === 'string') limpio.descripcion = cambios.descripcion.trim()
  if (typeof cambios.capacidadMaxima === 'number') limpio.capacidadMaxima = cambios.capacidadMaxima
  if (typeof cambios.requierePago === 'boolean') limpio.requierePago = cambios.requierePago

  // El precio sólo tiene sentido si el evento es pago. Si mandan
  // requierePago:false y dejan el precio viejo, el documento quedaría
  // con requierePago:false y precio: 500, que es un evento gratis con
  // precio. Se manda null siempre que se apague el pago.
  if (cambios.requierePago === false) {
    limpio.precioEntrada = null
  } else if (typeof cambios.precioEntrada === 'number') {
    limpio.precioEntrada = cambios.precioEntrada
  }

  // bannerUrl va dentro de personalizacion
  if (typeof cambios.bannerUrl === 'string') {
    limpio['personalizacion.bannerUrl'] = cambios.bannerUrl.trim() || null
  }

  // La visibilidad es un dato operativo (como `estado`), no un dato del
  // formulario de contenido: se edita desde el mismo EventoForm pero viaja
  // como campo propio para que la regla no tenga que adivinarlo.
  if (cambios.visibilidad === 'publico' || cambios.visibilidad === 'privado') {
    limpio.visibilidad = cambios.visibilidad
  }

  // Categoría soportada. `null` limpia la vieja; `undefined` no la toca.
  // Un valor desconocido no entra: nunca se escribe una llave inventada.
  if (cambios.categoria === null) {
    limpio.categoria = null
  } else if (esCategoria(cambios.categoria)) {
    limpio.categoria = cambios.categoria
  }

  return limpio
}
