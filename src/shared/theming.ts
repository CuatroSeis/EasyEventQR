/**
 * Inyección de tema en runtime.
 *
 * Este módulo es el que hace que "un mismo componente cambie completamente
 * de aspecto según los datos del evento" (Fase 3) y que el widget pueda
 * reutilizar exactamente la misma lógica (Fase 4). No importa nada de
 * React ni de Firebase: sólo escribe variables CSS. Por eso el mismo
 * código sirve para la landing (elemento normal) y para el widget
 * (elemento host del Shadow DOM).
 */

import type { PersonalizacionEvento } from './types.js'

/**
 * Lo unico que este modulo necesita del elemento donde escribe.
 *
 * Se declara estructuralmente en vez de usar `HTMLElement` por dos
 * razones. Una: el global HTMLElement no existe si el proyecto se
 * type-checkea sin la lib DOM, que es exactamente lo que pasa con
 * tsconfig.tests.json, y ahi este archivo se importa para testear la
 * logica pura. Dos: documenta el contrato real, que son dos metodos de
 * style, y no media API de elementos.
 *
 * `document.documentElement` lo satisface sin problema.
 */
export interface RaizCss {
  style: {
    setProperty(propiedad: string, valor: string): void
    removeProperty(propiedad: string): void
  }
}

/** Un tema parcial: cada campo ausente significa "no lo toques". */
export type Tema = Partial<Omit<PersonalizacionEvento, 'bannerUrl' | 'logoUrl'>> &
  Pick<PersonalizacionEvento, 'colorPrimario' | 'colorSecundario'>

/**
 * Aceptamos sólo hexadecimal. El color viene de un formulario de un
 * organizador: sin esta validación alguien podría escribir cualquier
 * cadena y romper el layout de la landing. Fallar es mejor que romper.
 */
const HEX_VALIDO = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function esColorValido(valor: unknown): valor is string {
  return typeof valor === 'string' && HEX_VALIDO.test(valor.trim())
}

/** Luminancia relativa WCAG. 0 = negro absoluto, 1 = blanco absoluto. */
function luminancia(hex: string): number {
  const limpio = hex.trim()
  // #abc  ->  #aabbcc
  const completo =
    limpio.length === 4
      ? `#${limpio[1]}${limpio[1]}${limpio[2]}${limpio[2]}${limpio[3]}${limpio[3]}`
      : limpio

  const canales = [completo.slice(1, 3), completo.slice(3, 5), completo.slice(5, 7)].map(
    (par) => {
      const v = parseInt(par, 16) / 255
      // Curva de gamma: los valores perceptualmente iguales no son
      // aritméticamente iguales, y sin esto el umbral se decide mal.
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    },
  )

  const [r, g, b] = canales
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Elige blanco o texto oscuro para que se lea sobre el color del cliente.
 *
 * Sin esto, un organizador que pone un amarillo claro como color primario
 * recibe botones amarillos con texto blanco: ilegibles. Calcularlo es
 * más barato que pedirle que loija a mano.
 */
export function colorDeTextoSobre(hex: string): string {
  const l = luminancia(hex)
  const contraBlanco = 1.05 / (l + 0.05)
  const contraNegro = (l + 0.05) / 0.05
  return contraNegro >= contraBlanco ? '#0f172a' : '#ffffff'
}

/**
 * Escribe el tema como variables CSS en `raiz`.
 *
 * `raiz` es SIEMPRE un HTMLElement, nunca el ShadowRoot, y en el widget
 * se le pasa el elemento `<ticket-widget>` en vez de su shadow root.
 *
 * ¿Por qué? Porque las propiedades personalizadas de CSS heredan a
 * través de la frontera del Shadow DOM. Si escribimos --c-primario en el
 * host, todos los nodos del shadow tree la reciben. ShadowRoot no tiene
 * `.style` (sólo `adoptedStyleSheets`), y una de las dos cosas tenía que
 * ser: escribir en el host es una línea menos y no necesita stylesheets
 * construibles.
 *
 * El beneficio extra: como heredan, el widget se puede tematizar desde
 * afuera (this.style.setProperty en el host) y el sitio del organizador
 * no puede filtrar su CSS hacia adentro.
 *
 * LA DIFERENCIA ENTRE null Y undefined, QUE NO ES COSMÉTICA:
 *
 *   undefined → "no opines": no se toca la variable.
 *   null      → "el organizador no quiere personalización": se QUITA el
 *               override y la variable vuelve al valor de :root.
 *
 * Antes los dos caían en el mismo esColorValido() === false y los dos
 * hacían "nada", que para el caso de undefined era lo correcto y para
 * null era un bug: un organizador que tenía #dc2626 y después sacaba el
 * color se quedaba con el rojo pegado en el documentElement para
 * siempre, sin forma de limpiarlo salvo recargar con otro build. Por eso
 * null borra la propiedad en vez de ignorarla: removeProperty() es lo
 * único que devuelve la variable al default del :root.
 */
export function aplicarTema(tema: Tema | null | undefined, raiz: RaizCss): void {
  if (!tema) return

  escribirColor(raiz, tema.colorPrimario, '--c-primario', '--c-sobre-primario')
  escribirColor(raiz, tema.colorSecundario, '--c-secundario')
}

/**
 * Escribe un color, o lo saca si es null.
 *
 * El parámetro variableContraste sólo se usa en el primario: es el único
 * color sobre el que hay texto, y por eso el único que necesita el
 * cálculo de contraste. Cuando el secundario lleve texto, se le calcula
 * el suyo y se le pasa por acá.
 */
function escribirColor(
  raiz: RaizCss,
  valor: string | null | undefined,
  variable: string,
  variableContraste?: string,
): void {
  if (valor === undefined) return

  if (valor === null) {
    raiz.style.removeProperty(variable)
    if (variableContraste) raiz.style.removeProperty(variableContraste)
    return
  }

  // Un color inválido se ignora en vez de romper: un documento con
  // "azul" donde se esperaba un hex no puede romper el layout.
  if (!esColorValido(valor)) return

  const color = valor.trim()
  raiz.style.setProperty(variable, color)
  if (variableContraste) raiz.style.setProperty(variableContraste, colorDeTextoSobre(color))
}
