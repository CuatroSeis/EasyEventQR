import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getDb } from '../src/server/lib/firebase-admin.js'
import { SignJWT, jwtVerify } from 'jose'

/**
 * Secreto de firma de los links de operador.
 *
 * ANTES: `process.env.OPERADOR_SECRET || 'dev-secret-change-in-production-…'`.
 * Esos 40 caracteres están en el repo, así que en cualquier entorno donde
 * faltara la variable —un deploy nuevo, un entorno de prueba— los links se
 * firmaban con un secreto público y cualquiera podía fabricar el JWT de un
 * evento ajeno. Un fallback, por inocente que parezca, es una puerta abierta igual.
 *
 * Ahora falla cerrado: si la variable no está, el módulo explota al importar
 * y el endpoint responde 500 antes de firmar nada. Es preferible un panel de
 * operador caído a uno abierto.
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

/**
 * POST /api/operador/link
 *
 * Genera un link firmado para el operador de puerta.
 * Solo accesible por el organizador dueño del evento.
 *
 * Body: { eventoId: string }
 * Response: { ok: true, url: string, expiraEn: string }
 */
async function handleLink(req: VercelRequest, res: VercelResponse) {
  // El uid sale del ID token verificado. Sin este fallback, generar un link
  // de operador para un evento ajeno era cuestión de mandar el header
  // `x-user-uid` con el UID de otra persona: el chequeo de propiedad de más
  // abajo comparaba contra un dato que elegía el cliente.
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
 * GET /api/operador/verificar?token=xxx
 *
 * Verifica un token de operador y devuelve el payload si es válido.
 * No requiere autenticación adicional (el token mismo es la credencial).
 */
async function handleVerificar(req: VercelRequest, res: VercelResponse) {
  const { token } = req.query as { token?: string }

  if (!token) {
    return res.status(400).json({ ok: false, error: 'Falta token' })
  }

  try {
    // Verificar JWT
    const { payload } = await import('jose').then(({ jwtVerify }) =>
      jwtVerify(token, OPERADOR_SECRET)
    )

    return res.status(200).json({ ok: true, payload })
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' })
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