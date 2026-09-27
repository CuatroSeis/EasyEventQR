import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

import { config, firebaseConfigurado } from './config'

/**
 * Único lugar donde se inicializa Firebase en el frontend.
 *
 * Si otro módulo hiciera su propio initializeApp() tendríamos dos apps
 * en la misma pestaña y la segunda no vería los cambios de auth de la
 * primera. Por eso el patrón "si ya existe, la reúso".
 *
 * IMPORTANTE: los imports del SDK son estáticos a propósito. Cada función
 * modular (getAuth, getFirestore...) se puede importar sola y el bundler
 * descarta el resto del SDK, pero sólo si NADOS más lo referencia. Por eso
 * este módulo no debe importarse desde una landing pública: la Fase 3 la
 * resuelve con un POST a /api/registro y no necesita el SDK en el cliente.
 *
 * ESTE ARCHIVO NUNCA SE USA EN /api/.
 * El backend usa el Admin SDK (api/lib/firebase-admin.ts). Son SDK
 * distintos, con credenciales distintas y permisos opuestos:
 * acá hay reglas de seguridad, allá se las saltea.
 */
export { firebaseConfigurado }

export const app: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(config)

export const auth = getAuth(app)

export const db = getFirestore(app)
