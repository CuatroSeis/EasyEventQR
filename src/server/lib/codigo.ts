/**
 * Generación de códigos únicos en el backend (transacciones Firestore).
 * Usa crypto.randomBytes para entropía real.
 */

import { Transaction } from 'firebase-admin/firestore'
import { randomBytes } from 'crypto'

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LEN = 6
const MAX_REINTENTOS = 5

function generarCodigoAleatorio(): string {
  const buf = randomBytes(CODE_LEN)
  let resultado = ''
  for (let i = 0; i < CODE_LEN; i++) {
    resultado += CHARS[buf[i] % CHARS.length]
  }
  return resultado
}

/**
 * Genera un código corto único en la colección `eventos` (campo `codigoCorto`).
 * Usa transacción con reintentos para evitar colisiones.
 */
export async function generarCodigoCortoUnico(db: FirebaseFirestore.Firestore): Promise<string> {
  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    const codigo = generarCodigoAleatorio()
    const ref = db.collection('eventos').doc(codigo)
    const snap = await ref.get()
    if (!snap.exists) {
      return codigo
    }
  }
  throw new Error('No se pudo generar código corto único tras 5 intentos')
}

/**
 * Genera un slug único en la colección `eventos` (campo `slug`).
 */
export async function generarSlugUnico(db: FirebaseFirestore.Firestore, base: string): Promise<string> {
  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    const sufijo = Math.random().toString(36).slice(2, 6)
    const slug = `${base}-${sufijo}`
    const ref = db.collection('eventos').where('slug', '==', slug).limit(1)
    const snap = await ref.get()
    if (snap.empty) {
      return slug
    }
  }
  throw new Error('No se pudo generar slug único tras 5 intentos')
}

/**
 * Helper para transacciones: reserva el código/slug dentro de la misma transacción
 * que crea el evento, así no hay ventana de carrera.
 */
export async function reservarCodigoYSlugEnTransaccion(
  tx: Transaction,
  db: FirebaseFirestore.Firestore,
  baseSlug: string
): Promise<{ codigoCorto: string; slug: string }> {
  const codigoCorto = await generarCodigoCortoUnicoEnTx(tx, db)
  const slug = await generarSlugUnicoEnTx(tx, db, baseSlug)
  return { codigoCorto, slug }
}

async function generarCodigoCortoUnicoEnTx(tx: Transaction, db: FirebaseFirestore.Firestore): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const codigo = generarCodigoAleatorio()
    const ref = db.collection('eventos').doc(codigo)
    const snap = await tx.get(ref)
    if (!snap.exists) {
      return codigo
    }
  }
  throw new Error('Colisión de código corto en transacción')
}

async function generarSlugUnicoEnTx(tx: Transaction, db: FirebaseFirestore.Firestore, base: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const sufijo = Math.random().toString(36).slice(2, 6)
    const slug = `${base}-${sufijo}`
    const ref = db.collection('eventos').where('slug', '==', slug).limit(1)
    const snap = await tx.get(ref)
    if (snap.empty) {
      return slug
    }
  }
  throw new Error('Colisión de slug en transacción')
}