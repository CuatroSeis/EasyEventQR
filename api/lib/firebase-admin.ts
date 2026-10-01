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

/**
 * ¿Estamos apuntando al emulador?
 *
 * OJO CON EL NOMBRE DE LA VARIABLE: no es `FIREBASE_EMULATOR_HOST`.
 * Ese es el que usa el SDK web del navegador (src/services/firebase.ts
 * no lo lee, llama a connectFirestoreEmulator). Para el Admin SDK la
 * variable es `FIRESTORE_EMULATOR_HOST`, y la lee la librería de
 * Firestore que va por debajo, que le gana a cualquier `settings.host`
 * que se le pase.
 *
 * Y no existe un `useEmulator()` para Firestore en el Admin SDK: en la
 * versión 14.5.0 ese método sólo existe para Auth. Por eso la
 * redirección se resuelve por variable de entorno y no por código.
 */
function emuladorConfigurado(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST)
}

/**
 * Si el health check dice que no hay credenciales y estamos en el
 * emulador, `/api/salud` reportaría un fallo falso. El emulador no
 * necesita service account: no hay nadie a quien autenticarse.
 */
export function credencialesConfiguradas(): boolean {
  return emuladorConfigurado() || Boolean(process.env.FIREBASE_SERVICE_ACCOUNT)
}

/** El projectId con el que quedó inicializado el Admin SDK. */
export function getProjectId(): string {
  return getApp().options.projectId ?? process.env.FIREBASE_PROJECT_ID ?? 'desconocido'
}

export function getDb(): Firestore {
  if (dbCache) return dbCache

  dbCache = getFirestore(construirApp())
  return dbCache
}

function construirApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!
  }

  if (emuladorConfigurado()) {
    // Sin `credential` a propósito. El emulador no valida credenciales
    // y `cert()` exige una private_key real que acá no tenemos ni vamos
    // a tener: la clave se borró de la máquina y vive cifrada en Vercel
    // (ver PLAN.md, pendientes). El projectId acá es sólo un nombre de
    // namespace para el emulador, no una dirección de conexión.
    return initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-easyeventqr',
    })
  }

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

  return initializeApp({ credential: cert(credenciales), projectId })
}
