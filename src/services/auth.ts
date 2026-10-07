import {
  GoogleAuthProvider,
  getIdTokenResult,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { auth, db } from './firebase.ts'
import { nuevoDocumentoOrganizador } from './organizadores.ts'
import { esMobile } from './sesion.ts'
import type { Organizador } from '../shared/types.ts'

/**
 * Login de Google y arranque de la cuenta del organizador.
 *
 * Todas las escrituras de este módulo van a `organizadores/{su propio
 * uid}`, y las reglas ya permiten exactamente eso. No hace falta un
 * backend para el alta: las reglas exigen que el documento nazca en
 * plan "gratis" con los límites de la tabla, así que un cliente
 * modificado en la consola del navegador no puede abrirse una cuenta
 * pro+ ni saltarse la validación de email.
 */

export function observarSesion(alCambiar: (usuario: User | null) => void) {
  return onAuthStateChanged(auth, alCambiar)
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
/**
 * `prompt=select_account` para que Google no reutilice en silencio la
 * sesión de otro usuario. Sin ese parámetro, en una máquina compartida
 * el siguiente login entra con la cuenta anterior y ni te enterás.
 *
 * En mobile va por redirect y no por popup: Brave y otros navegadores
 * bloquean el popup o las cookies de terceros y la pantalla queda en
 * blanco. El redirect sale y vuelve; al volver, `observarSesion` ya ve
 * la sesión y `consumirRedirect()` rescata el error si lo hubo.
 * Devuelve `null` cuando delegó al redirect (no hay usuario todavía).
 *
 * `esperarSesion` vive en `./sesion.ts` (sin imports runtime de Firebase,
 * testeable bajo `node --test`).
 */
export async function entrarConGoogle(): Promise<User | null> {
  const proveedor = new GoogleAuthProvider()
  proveedor.setCustomParameters({ prompt: 'select_account' })
  if (esMobile()) {
    await signInWithRedirect(auth, proveedor)
    return null
  }
  const credencial = await signInWithPopup(auth, proveedor)
  return credencial.user
}

/** Error del redirect al volver (cuenta duplicada, dominio no autorizado, red). */
export async function consumirRedirect(): Promise<void> {
  await getRedirectResult(auth)
}

export function salir(): Promise<void> {
  return signOut(auth)
}

/**
 * Se asegura de que el usuario tenga documento de organizador.
 *
 * Idempotente: si ya existe, lo devuelve; si no, lo crea con los
 * valores de "gratis".
 *
 * El catch del setDoc no es decorativo. Dos pestañas abiertas pueden
 * terminar el login en el mismo instante, las dos ven que el documento
 * no existe y las dos escriben. La segunda escritura las reglas la
 * pueden rechazar: si un super-admin migró la cuenta a "pro" en medio
 * de la carrera, tocar el plan está prohibido. Si eso pasa, la respuesta
 * correcta no es un error en pantalla sino volver a leer, porque lo que
 * hay en la base es la versión buena.
 */
export async function asegurarDocumentoOrganizador(usuario: User): Promise<Organizador> {
  const referencia = doc(db, 'organizadores', usuario.uid)

  const existente = await getDoc(referencia)
  if (existente.exists()) return existente.data() as Organizador

  const nombre = usuario.displayName?.trim() || (usuario.email?.split('@')[0] ?? 'Organizador')
  const nuevo = nuevoDocumentoOrganizador(usuario.uid, usuario.email ?? '', nombre)

  try {
    await setDoc(referencia, nuevo)
    return nuevo
  } catch {
    const releido = await getDoc(referencia)
    if (releido.exists()) return releido.data() as Organizador
    throw new Error('No se pudo crear el documento del organizador.')
  }
}

/**
 * Claims del token actual.
 *
 * OJO con esto, es la trampa clásica de los custom claims: se hornean
 * en el ID token cuando Firebase lo emite, así que asignar un claim no
 * se refleja en el front hasta que el token se refresca. Por eso el
 * script auth:admin dice "volvé a iniciar sesión".
 *
 * Sin `forzar`, getIdTokenResult devuelve el token cacheado (gratis, y
 * suficiente para leer). Con `forzar: true` pide uno nuevo al servidor,
 * que es lo que hace falta justo después de que te ascendan.
 */
export async function leerClaims(usuario: User, forzar = false): Promise<{ admin?: boolean }> {
  const resultado = await getIdTokenResult(usuario, forzar)
  return resultado.claims as { admin?: boolean }
}
