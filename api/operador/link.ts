import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getDb } from '../lib/firebase-admin.js'
import { SignJWT, jwtVerify } from 'jose'

export const OPERADOR_SECRET = new TextEncoder().encode(
  process.env.OPERADOR_SECRET || 'dev-secret-change-in-production-min-32-chars!!'
)

const EXPIRACION_HORAS = 4

interface OperadorPayload {
  eventoId: string
  organizadorId: string
  iat: number
  exp: number
}

/**
 * POST /api/operador/link
 *
 * Genera un link firmado para el operador de puerta.
 * Solo accesible por el organizador dueño del evento.
 *
 * Body: { eventoId: string }
 * Response: { ok: true, url: string, expiraEn: string }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
  }

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

  const { eventoId } = req.body as { eventoId?: string }
  if (!eventoId) {
    return res.status(400).json({ ok: false, error: 'Falta eventoId' })
  }

  try {
    const db = getDb()

    // Verificar propiedad del evento
    const snapEvento = await db.collection('eventos').doc(eventoId).get()
    if (!snapEvento.exists) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' })
    }
    const evento = snapEvento.data()!
    if (evento.organizadorId !== uid) {
      return res.status(403).json({ ok: false, error: 'No autorizado' })
    }

    // Crear JWT firmado
    const now = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({ eventoId, organizadorId: uid })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + EXPIRACION_HORAS * 3600)
      .sign(OPERADOR_SECRET)

    const baseUrl = process.env.APP_URL || 'https://easyeventqr.vercel.app'
    const url = `${baseUrl}/operador/${token}`

    return res.status(200).json({
      ok: true,
      url,
      expiraEn: `${EXPIRACION_HORAS} horas`,
    })
  } catch (error) {
    console.error('[operador/link] error:', error)
    return res.status(500).json({ ok: false, error: 'Error generando link' })
  }
}

/**
 * Verifica un token de operador y devuelve el payload si es válido.
 * Lanza error si expiración o firma inválida.
 */
export async function verificarTokenOperador(token: string): Promise<OperadorPayload> {
  try {
    const { payload } = await jwtVerify(token, OPERADOR_SECRET)
    return payload as unknown as OperadorPayload
  } catch {
    throw new Error('Token inválido o expirado')
  }
}