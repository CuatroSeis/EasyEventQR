import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getAdminAuth, getDb } from '../src/server/lib/firebase-admin.js'
import { SignJWT, jwtVerify } from 'jose'
import { capturarError } from '../src/server/lib/sentry.js'

/**
 * Secreto de firma de los links de operador. Sin fallback: antes un valor
 * público en el repo firmaba JWTs en cualquier entorno sin la variable.
 * Falla cerrado (500 al importar) antes que firmar con secreto público.
 */
function secretoOperador(): Uint8Array {
  const crudo = process.env.OPERADOR_SECRET
  if (!crudo || crudo.length < 32) {
    throw new Error(
      'Falta OPERADOR_SECRET o mide menos de 32 caracteres. Es el secreto con el que se firman los links de operador: sin él no se pueden firmar.',
    )
  }
  return new TextEncoder().encode(crudo)
}

export const OPERADOR_SECRET = secretoOperador()

const EXPIRACION_HORAS = 4

interface OperadorPayload {
  eventoId: string
  organizadorId: string
  iat: number
  exp: number
}

/** POST /api/operador/link — JWT de 4h para la puerta, sólo el dueño del evento. */
async function handleLink(req: VercelRequest, res: VercelResponse) {
  // UID del token verificado, nunca de un header del cliente.
  const authHeader = req.headers.authorization
  let uid: string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = await (await getAdminAuth()).verifyIdToken(authHeader.slice(7))
      uid = decoded.uid
    } catch {}
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

      const snapEvento = await db.collection('eventos').doc(eventoId).get()
    if (!snapEvento.exists) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' })
    }
    const evento = snapEvento.data()!
    if (evento.organizadorId !== uid) {
      return res.status(403).json({ ok: false, error: 'No autorizado' })
    }

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
    await capturarError(error, { ruta: '[operador/link]' })
    return res.status(500).json({ ok: false, error: 'Error generando link' })
  }
}

/** GET /api/operador/verificar — el token ES la credencial, no pide más nada. */
async function handleVerificar(req: VercelRequest, res: VercelResponse) {
  const { token } = req.query as { token?: string }

  if (!token) {
    return res.status(400).json({ ok: false, error: 'Falta token' })
  }

  try {
    const { payload } = await import('jose').then(({ jwtVerify }) =>
      jwtVerify(token, OPERADOR_SECRET)
    )

    return res.status(200).json({ ok: true, payload })
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' })
  }
}


export async function verificarTokenOperador(token: string): Promise<OperadorPayload> {
  try {
    const { payload } = await jwtVerify(token, OPERADOR_SECRET)
    return payload as unknown as OperadorPayload
  } catch {
    throw new Error('Token inválido o expirado')
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  // Router por path: /api/operador/link vs /api/operador/verificar
  const path = req.url?.split('?')[0] || ''

  if (path.endsWith('/verificar')) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ ok: false, error: 'Solo se acepta GET' })
    }
    return handleVerificar(req, res)
  }

  // Default: /api/operador/link
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
  }
  return handleLink(req, res)
}