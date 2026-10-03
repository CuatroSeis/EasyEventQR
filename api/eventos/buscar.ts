import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from '../../src/server/lib/firebase-admin.js'
import { normalizarTexto } from '../../src/shared/utils.js'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'

/**
 * GET /api/eventos/buscar?q=... — búsqueda pública de eventos.
 *
 * Acepta código corto (FEST-8K2P) o nombre (prefijo en nombreNormalizado).
 * Solo devuelve eventos con visibilidad = 'publico'.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Solo se acepta GET' })
  }

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (!q) {
    return res.status(400).json({ ok: false, error: 'Falta el parámetro q' })
  }

  const normalizado = normalizarTexto(q)

  try {
    const db = getDb()

    // Si parece un código corto (FEST-8K2P), buscar por doc ID exacto
    const pareceCodigo = /^[A-Z0-9]{6,8}(-[A-Z0-9]{4,6})?$/.test(q.toUpperCase())

    let eventos: Array<{
      codigoCorto: string
      nombre: string
      fecha: string
      lugar: string
    }> = []

    if (pareceCodigo) {
      // Búsqueda exacta por codigoCorto (que es el doc ID en nuestra implementación)
      const snap = await db.collection('eventos').doc(q.toUpperCase()).get()
      if (snap.exists) {
        const data = snap.data()
        if (data && data.visibilidad === 'publico' && data.estado === 'activo') {
          eventos = [{
            codigoCorto: q.toUpperCase(),
            nombre: data.nombre,
            fecha: data.fecha?.toDate?.()?.toISOString?.() ?? data.fecha,
            lugar: data.lugar ?? '',
          }]
        }
      }
    } else {
      // Búsqueda por prefijo en nombreNormalizado + visibilidad publico
      const snap = await db.collection('eventos')
        .where('visibilidad', '==', 'publico')
        .where('estado', '==', 'activo')
        .where('nombreNormalizado', '>=', normalizado)
        .where('nombreNormalizado', '<=', normalizado + '\uf8ff')
        .limit(10)
        .get()

      eventos = snap.docs.map((doc: QueryDocumentSnapshot) => {
        const data = doc.data()
        return {
          codigoCorto: data.codigoCorto,
          nombre: data.nombre,
          fecha: data.fecha?.toDate?.()?.toISOString?.() ?? data.fecha,
          lugar: data.lugar ?? '',
        }
      })
    }

    return res.status(200).json({ ok: true, eventos })
  } catch (error) {
    console.error('[eventos/buscar] error:', error)
    return res.status(500).json({ ok: false, error: 'No pudimos buscar el evento.' })
  }
}