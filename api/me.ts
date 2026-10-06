import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { DocumentReference, Firestore } from 'firebase-admin/firestore'

import { getAdminAuth, getDb } from '../src/server/lib/firebase-admin.js'
import { capturarError } from '../src/server/lib/sentry.js'

const SUPER_ADMIN_UID = process.env.SUPER_ADMIN_UID

/** Tope de lotes de Firestore: 500 escrituras por batch, 400 por seguridad. */
const TOPE_LOTE = 400

/** `/api/me` — quién es y qué puede hacer. El criterio de super-admin es el mismo que en `admin-organizadores.ts` (las dos mitades de la misma puerta). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // UID sólo del token verificado: un header del cliente no es credencial.
  const authHeader = req.headers.authorization
  let uid: string | undefined
  let esAdminPorClaim = false

  if (authHeader?.startsWith('Bearer ')) {
    try {
      // `getAdminAuth()`: con `getAuth()` a secas, `app/no-app` se comía en
      // el catch y salía como `sin-sesion` con la sesión vigente.
      const decoded = await (await getAdminAuth()).verifyIdToken(authHeader.slice(7))
      uid = decoded.uid
      esAdminPorClaim = decoded.admin === true
    } catch (error) {
      // Se registra (sin el token): un `catch` mudo volvió invisible el `app/no-app`.
      const codigo = (error as { code?: string }).code ?? 'sin-codigo'
      console.error(`[me] verifyIdToken falló: ${codigo} — ${(error as Error).message}`)
    }
  }

  if (!uid) {
    return res.status(200).json({
      ok: true,
      uid: null,
      isAdmin: false,
      porQue: 'sin-sesion',
      organizador: null,
    })
  }


  const esAdminPorUid = SUPER_ADMIN_UID !== undefined && uid === SUPER_ADMIN_UID
  const isAdmin = esAdminPorClaim || esAdminPorUid

  // `porQue` es sólo para que la UI explique el rechazo (no autoriza).
  let porQue: string | null = null
  if (!isAdmin) {
    if (!SUPER_ADMIN_UID) {
      porQue = 'falta-var'
    } else if (uid !== SUPER_ADMIN_UID) {
      porQue = 'sin-claim'
    } else {
      porQue = 'desconocido'
    }
  }

  let organizador = null
  if (isAdmin) {
    try {
      const db = getDb()
      const snap = await db.collection('organizadores').doc(uid).get()
      if (snap.exists) {
        organizador = { uid: snap.id, ...snap.data() }
      }
    } catch {
      // Sin organizador igual se responde: el panel se autoriza por claim/env.
    }
  }

  if (req.method === 'DELETE') {
    return await eliminarMiCuenta(res, uid)
  }

  return res.status(200).json({ ok: true, uid, isAdmin, porQue, organizador })
}

/** DELETE /api/me — baja con todo por el backend (N documentos + Auth). Orden: registros, eventos, organizador y ÚLTIMO el usuario de Auth. */
async function eliminarMiCuenta(res: VercelResponse, uid: string) {
  // El break-glass (SUPER_ADMIN_UID) no se auto-elimina: se gestiona desde /admin.
  if (SUPER_ADMIN_UID !== undefined && uid === SUPER_ADMIN_UID) {
    return res.status(400).json({
      ok: false,
      error: 'Esa cuenta se elimina desde el panel de super-admin.',
    })
  }

  try {
    const db = getDb()
    let eliminados = 0

    const eventos = await db.collection('eventos').where('organizadorId', '==', uid).get()
    for (const docEvento of eventos.docs) {
      const registros = await db.collection('registros').where('eventoId', '==', docEvento.id).get()
      await eliminarEnLotes(
        db,
        registros.docs.map((d) => d.ref),
      )
      eliminados += registros.size
      await docEvento.ref.delete()
      eliminados += 1
    }

    await db.collection('organizadores').doc(uid).delete()
    eliminados += 1

    try {
      await (await getAdminAuth()).deleteUser(uid)
    } catch (error) {
      await capturarError(error, { ruta: '[me] no se pudo borrar la cuenta de Auth:' })
    }

    return res.status(200).json({ ok: true, eliminados })
  } catch (error) {
    await capturarError(error, { ruta: '[me] error eliminando cuenta:' })
    return res.status(500).json({ ok: false, error: 'No se pudo eliminar la cuenta.' })
  }
}

/** Borra en bloques: un batch de Firestore admite 500 escrituras, no más. */
async function eliminarEnLotes(db: Firestore, referencias: DocumentReference[]): Promise<void> {
  for (let i = 0; i < referencias.length; i += TOPE_LOTE) {
    const lote = referencias.slice(i, i + TOPE_LOTE)
    const batch = db.batch()
    for (const ref of lote) batch.delete(ref)
    await batch.commit()
  }
}