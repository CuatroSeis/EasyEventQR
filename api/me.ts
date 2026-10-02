import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getDb } from '@server/firebase-admin.js'
import { getAuth } from 'firebase-admin/auth'

const SUPER_ADMIN_UID = process.env.SUPER_ADMIN_UID

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Obtener UID del usuario autenticado
  // En Vercel con Firebase Auth, el token viene en el header Authorization
  const authHeader = req.headers.authorization
  let uid: string | undefined

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    try {
      const decoded = await getAuth().verifyIdToken(token)
      uid = decoded.uid
    } catch {
      // Token inválido o expirado
    }
  }

  // Fallback para desarrollo con vercel dev (emulador)
  if (!uid) {
    uid = req.headers['x-user-uid'] as string | undefined
  }

  if (!uid) {
    return res.status(200).json({ ok: true, uid: null, isAdmin: false })
  }

  // Verificar si es super-admin
  const isAdmin = SUPER_ADMIN_UID !== undefined && uid === SUPER_ADMIN_UID

  // Si es admin, también devolvemos info del organizador
  let organizador = null
  if (isAdmin) {
    try {
      const db = getDb()
      const snap = await db.collection('organizadores').doc(uid).get()
      if (snap.exists) {
        organizador = { uid: snap.id, ...snap.data() }
      }
    } catch {
      // Ignorar errores de BD
    }
  }

  return res.status(200).json({ ok: true, uid, isAdmin, organizador })
}