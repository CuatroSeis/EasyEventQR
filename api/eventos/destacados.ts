import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from '../../src/server/lib/firebase-admin.js'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'

/**
 * GET /api/eventos/destacados?limit=N — devuelve eventos públicos y activos,
 * ordenados por fecha próxima, para mostrar como sugeridos en el home.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Solo se acepta GET' })
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 10)

  try {
    const db = getDb()
    const ahora = new Date()

    const snap = await db.collection('eventos')
      .where('visibilidad', '==', 'publico')
      .where('estado', '==', 'activo')
      .orderBy('fecha', 'asc')
      .startAt(ahora)
      .limit(limit)
      .get()

    const eventos: Array<{
      codigoCorto: string
      nombre: string
      fecha: string
      lugar: string
    }> = snap.docs.map((doc: QueryDocumentSnapshot) => {
      const data = doc.data()
      return {
        codigoCorto: data.codigoCorto ?? doc.id,
        nombre: data.nombre,
        fecha: data.fecha?.toDate?.()?.toISOString?.() ?? data.fecha,
        lugar: data.lugar ?? '',
      }
    })

    return res.status(200).json({ ok: true, eventos })
  } catch {
    return res.status(500).json({ ok: false, error: 'No se pudieron cargar los eventos destacados.' })
  }
}
