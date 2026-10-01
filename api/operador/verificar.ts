import type { VercelRequest, VercelResponse } from '@vercel/node'

import { OPERADOR_SECRET } from '../operador/link.js'

/**
 * GET /api/operador/verificar?token=xxx
 *
 * Verifica un token de operador y devuelve el payload si es válido.
 * No requiere autenticación adicional (el token mismo es la credencial).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Solo se acepta GET' })
  }

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