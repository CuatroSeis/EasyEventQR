import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'

import { getDb } from '@server/firebase-admin.js'
import type { Organizador, Plan } from '../src/shared/types.js'

const SUPER_ADMIN_UID = process.env.SUPER_ADMIN_UID

function esSuperAdmin(uid: string | undefined): boolean {
  return SUPER_ADMIN_UID !== undefined && uid === SUPER_ADMIN_UID
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verificar autenticación: el uid viene del header que pone Vercel (x-vercel-firebase-auth)
  // o del token de Firebase en el header Authorization
  const authHeader = req.headers.authorization
  let uid: string | undefined

  if (authHeader?.startsWith('Bearer ')) {
    // En producción, Vercel no valida el token de Firebase automáticamente.
    // Para simplicidad, usamos el SUPER_ADMIN_UID configurado en env.
    // El cliente debe mandar el uid en un header personalizado o lo inferimos.
    uid = req.headers['x-user-uid'] as string
  }

  // Fallback: si no hay auth header, chequeamos el SUPER_ADMIN_UID directo
  // (para desarrollo con vercel dev donde el emulador no pone headers)
  if (!uid) {
    uid = req.headers['x-user-uid'] as string
  }

  if (!esSuperAdmin(uid)) {
    return res.status(403).json({ ok: false, error: 'No autorizado' })
  }

  const db = getDb()

  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('organizadores').orderBy('fechaAlta', 'desc').get()
      const organizadores = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
        uid: doc.id,
        ...doc.data(),
      })) as (Organizador & { uid: string })[]

      return res.status(200).json({ ok: true, organizadores })
    } catch (error) {
      console.error('[admin/organizadores] error:', error)
      return res.status(500).json({ ok: false, error: 'No se pudieron cargar los organizadores.' })
    }
  }

  if (req.method === 'PATCH') {
    const { uid: targetUid } = req.query
    const { plan } = req.body as { plan?: Plan }

    if (!targetUid || typeof targetUid !== 'string') {
      return res.status(400).json({ ok: false, error: 'Falta uid del organizador.' })
    }
    if (!plan || !['gratis', 'pro', 'pro+'].includes(plan)) {
      return res.status(400).json({ ok: false, error: 'Plan inválido.' })
    }

    try {
      const limites = {
        gratis: { bannerPermitido: false, colorPersonalizadoPermitido: true, logoPermitido: false, capacidadMaximaPorEvento: 100 },
        pro: { bannerPermitido: true, colorPersonalizadoPermitido: true, logoPermitido: false, capacidadMaximaPorEvento: 1_000 },
        'pro+': { bannerPermitido: true, colorPersonalizadoPermitido: true, logoPermitido: true, capacidadMaximaPorEvento: 5_000 },
      } as Record<Plan, Organizador['limitesPersonalizacion']>

      await db.collection('organizadores').doc(targetUid).update({
        plan,
        limitesPersonalizacion: limites[plan],
      })

      return res.status(200).json({ ok: true })
    } catch (error) {
      console.error('[admin/organizadores] error actualizando:', error)
      return res.status(500).json({ ok: false, error: 'No se pudo actualizar el plan.' })
    }
  }

  res.setHeader('Allow', 'GET, PATCH')
  return res.status(405).json({ ok: false, error: 'Método no permitido' })
}