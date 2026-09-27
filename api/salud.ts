import type { VercelRequest, VercelResponse } from '@vercel/node'

import { credencialesConfiguradas, getDb, getProjectId } from './lib/firebase-admin'

/**
 * GET /api/salud — comprobador de la cadena completa del backend.
 *
 * Si esto responde ok:true, funcionan las tres cosas que hay entre
 * Vercel y la base de datos:
 *
 *   1. La Vercel Function se ejecutó.
 *   2. La credencial del service account se leyó y es válida.
 *   3. Firestore respondió.
 *
 * Es el endpoint que vas a abrir después de cada deploy para saber
 * si lo que falló fue el frontend o el backend.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Solo se acepta GET' })
  }

  if (!credencialesConfiguradas()) {
    // 200 y no 500: el backend está vivo, lo que falta es configurarlo.
    return res.status(200).json({
      ok: false,
      etapa: 'service-account',
      mensaje: 'Falta FIREBASE_SERVICE_ACCOUNT en las variables de entorno de Vercel',
    })
  }

  try {
    const db = getDb()

    // Consulta real a Firestore, no un health check de mentira: si la
    // credencial estuviera vencida o mal formada, es acá donde se cae.
    // count() es una agregación: prueba permiso de lectura sin traer datos.
    const conteo = await db.collection('organizadores').count().get()

    return res.status(200).json({
      ok: true,
      proyecto: getProjectId(),
      organizadores: conteo.data().count,
      entorno: process.env.VERCEL_ENV ?? 'local',
    })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      etapa: 'firestore',
      mensaje: error instanceof Error ? error.message : 'Error desconocido',
    })
  }
}
