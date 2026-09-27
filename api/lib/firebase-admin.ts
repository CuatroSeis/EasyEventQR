import { cert, getApp, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

/**
 * El Admin SDK del backend.
 *
 * CONTRASTE CON src/services/firebase.ts:
 *
 *   Frontend  →  SDK web + reglas de seguridad + el usuario decide.
 *   Backend   →  Admin SDK + credencial de service account + el servidor decide.
 *
 * El Admin SDK se SALTEA las reglas: lee y escribe lo que le digan.
 * Por eso nunca se importa desde el navegador. Este archivo sólo puede
 * ser importado por cosas de /api/.
 */

/**
 * Cacheamos la instancia entre invocaciones.
 *
 * Vercel puede reutilizar el mismo proceso (lambda caliente) para varias
 * peticiones. Sin este cache, cada request reconectaría.
 */
let dbCache: Firestore | null = null

export function credencialesConfiguradas(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT)
}

/** El projectId con el que quedó inicializado el Admin SDK. */
export function getProjectId(): string {
  return getApp().options.projectId ?? process.env.FIREBASE_PROJECT_ID ?? 'desconocido'
}

export function getDb(): Firestore {
  if (dbCache) return dbCache

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) {
    throw new Error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT en Vercel')
  }

  // Vercel guarda las variables de entorno como texto plano, así que el
  // JSON hay que parsearlo a mano. El private_key viene con \n escapados;
  // JSON.parse los devuelve como saltos de línea reales, que es lo que
  // espera la librería de criptografía.
  //
  // OJO con el projectId: el tipo de firebase-admin lo llama `projectId`,
  // pero el JSON que descarga la consola de Google lo llama `project_id`.
  // Por eso leemos los dos.
  const credenciales = JSON.parse(raw) as ServiceAccount & { project_id?: string }
  const projectId = credenciales.projectId ?? credenciales.project_id

  const app: App =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp({ credential: cert(credenciales), projectId })

  dbCache = getFirestore(app)
  return dbCache
}
