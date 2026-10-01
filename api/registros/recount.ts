import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Transaction } from 'firebase-admin/firestore'

import { getDb } from '../lib/firebase-admin.js'
import type { Evento } from '../../src/shared/types.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  const db = getDb()
  const { eventoId } = req.query

  if (!eventoId || typeof eventoId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Falta eventoId' })
  }

  // Auth
  const authHeader = req.headers.authorization
  let uid: string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { getAuth } = await import('firebase-admin/auth')
      const decoded = await getAuth().verifyIdToken(authHeader.slice(7))
      uid = decoded.uid
    } catch {}
  }
  if (!uid) {
    uid = req.headers['x-user-uid'] as string | undefined
  }
  if (!uid) {
    return res.status(401).json({ ok: false, error: 'No autenticado' })
  }

  // Verificar propiedad
  const snapEvento = await db.collection('eventos').doc(eventoId).get()
  if (!snapEvento.exists) {
    return res.status(404).json({ ok: false, error: 'Evento no encontrado' })
  }
  const evento = snapEvento.data() as Evento
  if (evento.organizadorId !== uid) {
    return res.status(403).json({ ok: false, error: 'No autorizado' })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
  }

  try {
    // Reconteo atómico en transacción
    const resultado = await db.runTransaction(async (tx: Transaction) => {
      // Contar reservas válidas (aprobadas + pendientes de pago)
      const snap = await tx.get(
        db.collection('registros')
          .where('eventoId', '==', eventoId)
          .where('estado', 'in', ['aprobado', 'pendiente'])
      )

      const total = snap.docs.length

      // Actualizar contador en evento
      const refEvento = db.collection('eventos').doc(eventoId)
      await tx.set(refEvento, { reservas: total }, { merge: true })

      return { total }
    })

    return res.status(200).json({ ok: true, reservas: resultado.total })
  } catch (error) {
    console.error('[registros/recount] error:', error)
    return res.status(500).json({ ok: false, error: 'Error en reconteo' })
  }
}