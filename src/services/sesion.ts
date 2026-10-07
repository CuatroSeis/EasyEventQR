import type { User } from 'firebase/auth'

/**
 * Espera a la sesión sin Firebase cargado.
 *
 * Vive acá y no en `auth.ts` a propósito: `auth.ts` importa el SDK y
 * `import.meta.env` (vía `config.ts`), que no existen bajo `node --test`,
 * así que ningún test podría importar de ahí. Este módulo sólo trae el
 * tipo `User` (borrado al compilar) y el observador se inyecta.
 */

/** Mobile = pointer grueso o user agent móvil (para elegir redirect vs popup). */
export function esMobile(): boolean {
  const w = (globalThis as any)?.window
  if (!w) return false
  return (
    w.matchMedia?.('(pointer: coarse)')?.matches === true ||
    /Android|iPhone|iPad|iPod/i.test(w.navigator?.userAgent ?? '')
  )
}

/**
 * Espera a que Firebase diga si hay sesión o no.
 *
 * `auth.currentUser` en el mount miente: vale `null` hasta que Auth
 * restaura la sesión persistida (rápido en desktop, lento o nunca en
 * Brave mobile con storage bloqueado). Quien lo leía una sola vez
 * expulsaba a `/panel` a alguien que un segundo después ya estaba
 * logueado. Esto espera el primer `onAuthStateChanged` de verdad, con
 * timeout que resuelve `null` (sin sesión) en vez de colgar.
 *
 * `observar` se inyecta para testear sin Firebase.
 */
export function esperarSesion(
  timeoutMs = 8000,
  observar: (alCambiar: (usuario: User | null) => void) => () => void = () => () => {},
): Promise<User | null> {
  return new Promise((resolver) => {
    let listo = false
    let temporizador: ReturnType<typeof setTimeout> | undefined
    const terminar = (usuario: User | null) => {
      if (listo) return
      listo = true
      if (temporizador !== undefined) clearTimeout(temporizador)
      try {
        desuscribir()
      } catch {
        // Observador falso o ya cerrado: igual resolvemos.
      }
      resolver(usuario)
    }
    const desuscribir = observar((usuario) => terminar(usuario))
    temporizador = setTimeout(() => terminar(null), timeoutMs)
  })
}
