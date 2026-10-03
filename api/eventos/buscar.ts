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
      // 1. Doc cuyo id ES el código (alta por POST /api/eventos).
      const porId = await db.collection('eventos').doc(q.toUpperCase()).get()
      const candidatos: QueryDocumentSnapshot[] = porId.exists ? [porId as QueryDocumentSnapshot] : []

      // 2. Fallback: eventos legacy o backfilleados, donde el código vive
      // en el campo `codigoCorto` y el id es un auto-id. Sin esto, todo
      // evento creado antes del código-como-id es invisible al buscador.
      if (candidatos.length === 0) {
        const porCampo = await db
          .collection('eventos')
          .where('codigoCorto', '==', q.toUpperCase())
          .limit(1)
          .get()
        candidatos.push(...porCampo.docs)
      }

      // El código y el link abren el evento sea público o privado: lo
      // privado es no salir en la búsqueda POR NOMBRE, no esconderlo a
      // quien tiene el código. Solo se exige que esté activo.
      for (const docSnap of candidatos) {
        const data = docSnap.data()
        if (data && data.estado === 'activo') {
          eventos = [
            {
              codigoCorto: data.codigoCorto ?? docSnap.id,
              nombre: data.nombre,
              fecha: data.fecha?.toDate?.()?.toISOString?.() ?? data.fecha,
              lugar: data.lugar ?? '',
            },
          ]
          break
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
          // Si el evento todavía no pasó por el backfill, el código que
          // se muestra es el id: feo pero funcional hasta migrar.
          codigoCorto: data.codigoCorto ?? doc.id,
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