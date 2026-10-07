/**
 * Tema claro/oscuro de la app (no del evento: eso es `theming.ts`).
 *
 * Sin tipos del DOM a propósito: este módulo lo importan los tests, que
 * se typecheckean sin la lib DOM (ver `theming.ts`). Todo acceso a
 * `window`/`document` va por `globalThis` con guards, nunca directo.
 */

export type TemaApp = 'claro' | 'oscuro'

const CLAVE = 'easyeventqr-tema'

function ventana(): any | null {
  const w = (globalThis as any)?.window
  return w ?? null
}

/** Guardada > sistema > claro. Entrada inválida = claro. */
export function temaInicial(guardada: string | null, sistemaOscuro: boolean): TemaApp {
  if (guardada === 'claro' || guardada === 'oscuro') return guardada
  return sistemaOscuro ? 'oscuro' : 'claro'
}

/** Lee la preferencia efectiva al arrancar. */
export function leerTema(): TemaApp {
  const w = ventana()
  let guardada: string | null = null
  let sistemaOscuro = false
  try {
    guardada = w?.localStorage?.getItem(CLAVE) ?? null
    sistemaOscuro = w?.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true
  } catch {
    // Sin storage o sin matchMedia: default claro.
  }
  return temaInicial(guardada, sistemaOscuro)
}

/** Aplica y persiste. Los customs inline de eventos siguen por encima. */
export function aplicarTemaApp(tema: TemaApp): void {
  try {
    const d = (globalThis as any)?.document
    d?.documentElement?.dataset && (d.documentElement.dataset.theme = tema)
    ventana()?.localStorage?.setItem(CLAVE, tema)
  } catch {
    // Modo privado o tests: el tema igual se resolvió arriba.
  }
}
