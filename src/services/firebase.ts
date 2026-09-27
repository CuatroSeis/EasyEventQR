import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

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

/**
 * Conectar con los emuladores es opt-in y por variable de entorno.
 *
 * El motivo de que sea opt-in y no automático: si el código apuntara al
 * emulador siempre, un `npm run dev` sin emuladores levantados fallaría
 * con un error de red incomprensible, y peor, en un despliegue mal
 * configurado el front apuntaría a localhost y no fallaría de forma
 * visible. Con el flag, el comportamiento depende de una decisión
 * explícita de quien levanta el servidor.
 *
 * Además connectAuthEmulator()/connectFirestoreEmulator() hay que
 * llamarlos una sola vez: una segunda llamada con el mismo emulador
 * lanza "Auth emulator already initialized" y rompe el arranque. Como
 * esto es código de nivel de módulo, el cache de módulos de Vite ya
 * lo ejecuta una sola vez, pero el flag lo hace idempotente y evita el
 * error confuso si el módulo llega a evaluarse dos veces.
 *
 * `npm run emuladores` levanta lo que hay que tener levantado.
 */
const emuladorConfigurado = firebaseConfigurado && import.meta.env.VITE_USAR_EMULADORES === 'si'

if (emuladorConfigurado) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
