import type { CategoriaEvento } from './types.js'

/**
 * Plantillas por defecto según categoría.
 *
 * A diferencia de los presets eliminados, esto NO es un modo que se
 * resuelve en runtime: son valores iniciales que se escriben en el
 * documento al crear. Después el organizador edita colores y textos
 * libremente y nada los pisa. Sólo llaves conocidas valen.
 */

export interface SugerenciaCategoria {
  colorPrimario: string
  colorSecundario: string
  textoBienvenida: string
}

export const CATEGORIAS: Record<CategoriaEvento, SugerenciaCategoria> = {
  'space-around': {
    colorPrimario: '#8b5cf6',
    colorSecundario: '#1e3a8a',
    textoBienvenida: 'Una noche fuera de órbita. Traé tu entrada en el celular.',
  },
  'energy-earth': {
    colorPrimario: '#f59e0b',
    colorSecundario: '#3f6212',
    textoBienvenida: 'Energía de la buena, bien de la tierra. Te esperamos.',
  },
  'trigger-ocean': {
    colorPrimario: '#06b6d4',
    colorSecundario: '#0c4a6e',
    textoBienvenida: 'Zambullite: tu entrada te espera en la puerta.',
  },
}

export function esCategoria(valor: unknown): valor is CategoriaEvento {
  return valor === 'space-around' || valor === 'energy-earth' || valor === 'trigger-ocean'
}
