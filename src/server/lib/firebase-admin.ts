import { cert, getApp, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import type { Auth } from 'firebase-admin/auth'

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
    // Sin `credential`: el emulador no valida, y el projectId es sólo namespace.
    return initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-easyeventqr',
    })
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) {
    throw new Error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT en Vercel')
  }

  // Vercel guarda env como texto: el JSON se parsea a mano.
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

/**
 * `getAdminAuth()` para el backend, con el app ya inicializado.
 *
 * `getAuth()` sin argumentos usa el app `[DEFAULT]`, y si nadie inicializó un
 * app todavía tira `app/no-app`: "The default Firebase app does not exist".
 * Es un callejón sin salida porque en una lambda *nadie* lo inicializa solo
 * — la inicialización es perezosa, la hace `construirApp()`, y `construirApp()`
 * sólo corre cuando algo pide `getDb()`.
 *
 * Por eso el orden de las llamadas importa, y es una trampa: `api/me.ts`
 * llamaba a `getAuth().verifyIdToken()` en la línea 43 y sólo pedía `getDb()`
 * en la 87, ya con la respuesta armada. El `verifyIdToken` tiraba `app/no-app`,
 * el `catch {}` se lo comía, y el endpoint respondía `porQue: 'sin-sesion'`:
 * "no tenés sesión" cuando la sesión estabaPerfectamente bien. Lo mismo
 * pasaba en `api/admin-organizadores.ts` y `api/operador.ts`, que por eso
 * devolvían 401 en vez de autorizar. Tres endpoints, una sola causa.
 *
 * Este helper deja de depender del orden: inicializa primero y recién
 * después devuelve el Auth.
 *
 * El `import()` es dinámico a propósito. `firebase-admin/auth` como import
 * estático no lo empaqueta el builder de Vercel y la función moría al
 * importar con `FUNCTION_INVOCATION_FAILED`. El `import type` de arriba es
 * distinto y no tiene ese problema: se borra al compilar.
 */
export async function getAdminAuth(): Promise<Auth> {
  construirApp()
  const { getAuth } = await import('firebase-admin/auth')
  return getAuth()
}
