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
  datos: Partial<Pick<Organizador, 'nombre' | 'telefono' | 'descripcion' | 'redesSociales'>>
): Promise<import('../shared/types').Organizador> {
  const ref = doc(db, 'organizadores', uid)
  const limpio: Record<string, unknown> = {}

  if (typeof (datos as any).nombre === 'string') limpio.nombre = (datos as any).nombre.trim()
  if (typeof (datos as any).telefono === 'string') limpio.telefono = (datos as any).telefono.trim()
  if (typeof (datos as any).descripcion === 'string') limpio.descripcion = (datos as any).descripcion.trim()
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

/** Elimina la cuenta del organizador (Auth + Firestore). Requiere re-autenticación previa. */
export async function eliminarCuenta(): Promise<void> {
  const usuario = auth.currentUser
  if (!usuario) throw new Error('No hay usuario autenticado')

  const uid = usuario.uid
  const { deleteDoc, doc } = await import('firebase/firestore')
  const { deleteUser } = await import('firebase/auth')

  // 1. Borrar documento de organizador
  await deleteDoc(doc(db, 'organizadores', uid))

  // 2. Borrar usuario de Auth
  await deleteUser(auth.currentUser!)
}