import {
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore'
import {
  reauthenticateWithPopup,
  GoogleAuthProvider,
  updatePassword,
} from 'firebase/auth'

import { db, auth } from './firebase'
import type { Organizador } from '../shared/types'

const GOOGLE_PROVIDER = new GoogleAuthProvider()
GOOGLE_PROVIDER.setCustomParameters({ prompt: 'select_account' })

/** Actualiza campos del perfil del organizador. */
export async function actualizarPerfil(
  uid: string,
  datos: Partial<Pick<Organizador, 'nombre' | 'telefono' | 'descripcion' | 'redesSociales' | 'textoBienvenida' | 'textoConfirmacion'>>
): Promise<import('../shared/types').Organizador> {
  const ref = doc(db, 'organizadores', uid)
  const limpio: Record<string, unknown> = {}

  if (typeof (datos as any).nombre === 'string') limpio.nombre = (datos as any).nombre.trim()
  if (typeof (datos as any).telefono === 'string') limpio.telefono = (datos as any).telefono.trim()
  if (typeof (datos as any).descripcion === 'string') limpio.descripcion = (datos as any).descripcion.trim()
  if (typeof (datos as any).textoBienvenida === 'string') limpio.textoBienvenida = (datos as any).textoBienvenida.trim() || null
  if (typeof (datos as any).textoConfirmacion === 'string') limpio.textoConfirmacion = (datos as any).textoConfirmacion.trim() || null
  if ((datos as any).redesSociales && typeof (datos as any).redesSociales === 'object') {
    limpio.redesSociales = {
      instagram: (datos as any).redesSociales.instagram?.trim() || null,
      twitter: (datos as any).redesSociales.twitter?.trim() || null,
      linkedin: (datos as any).redesSociales.linkedin?.trim() || null,
      web: (datos as any).redesSociales.web?.trim() || null,
    }
  }

  const claves = Object.keys(limpio)
  if (claves.length === 0) {
    const snap = await getDoc(ref)
    return snap.data() as any
  }

  await updateDoc(ref, limpio)
  const actualizado = await getDoc(ref)
  return actualizado.data() as any
}

/** Sube y comprime el logo a base64 WebP ≤512KB. */
export async function subirLogo(file: File): Promise<string> {
  const { comprimirImagenABase64 } = await import('../shared/utils.client')
  return comprimirImagenABase64(file, 512, 512)
}

/** Actualiza el logo del organizador (base64). */
export async function actualizarLogo(uid: string, base64: string): Promise<any> {
  const ref = doc(db, 'organizadores', uid)
  await updateDoc(ref, { 'brandingPanel.logoUrl': base64 })
  const snap = await getDoc(ref)
  return snap.data() as any
}

/** Cambia la contraseña del usuario actual (requiere re-autenticación). */
export async function cambiarPassword(usuario: any, _actual: string, nueva: string): Promise<void> {
  if (nueva.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')
  await reautenticarParaEliminar()
  await updatePassword(usuario, nueva)
}

/** Re-autentica con Google (popup) para operaciones sensibles. */
export async function reautenticarParaEliminar(): Promise<void> {
  const usuario = auth.currentUser
  if (!usuario) throw new Error('No hay usuario autenticado')

  const credencial = await reauthenticateWithPopup(usuario, GOOGLE_PROVIDER)
  if (!credencial.user) throw new Error('Re-autenticación fallida')
}

/** Elimina la cuenta del organizador con todo adentro (eventos, registros, Auth).
 *
 * La cascada la hace DELETE /api/me en el backend: borrar N documentos
 * desde el navegador deja basura huérfana al primer fallo de red, y la
 * cuenta de Auth sólo la puede borrar el Admin SDK. Acá sólo se cierra
 * la sesión local después de que el servidor confirma.
 */
export async function eliminarCuenta(): Promise<void> {
  const usuario = auth.currentUser
  if (!usuario) throw new Error('No hay usuario autenticado')

  const resp = await fetch('/api/me', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${await usuario.getIdToken()}` },
  })
  const data = await resp.json().catch(() => null)
  if (!resp.ok || !data?.ok) {
    throw new Error(
      typeof data?.error === 'string' && data.error ? data.error : 'No se pudo eliminar la cuenta.',
    )
  }

  const { salir } = await import('./auth')
  await salir()
}