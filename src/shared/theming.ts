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

import type { PersonalizacionEvento } from './types'

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
 * Sólo escribe lo que viene informado. Si el evento no define color
 * primario, la variable conserva el valor de :root y se ve el default.
 * Eso es lo que hace que "override parcial" funcione.
 */
export function aplicarTema(tema: Tema | null | undefined, raiz: HTMLElement): void {
  if (!tema) return

  if (esColorValido(tema.colorPrimario)) {
    const color = tema.colorPrimario.trim()
    raiz.style.setProperty('--c-primario', color)
    raiz.style.setProperty('--c-sobre-primario', colorDeTextoSobre(color))
  }

  if (esColorValido(tema.colorSecundario)) {
    raiz.style.setProperty('--c-secundario', tema.colorSecundario.trim())
  }
}
