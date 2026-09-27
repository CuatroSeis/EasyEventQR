/**
 * Configuración leída del entorno, SIN importar el SDK de Firebase.
 *
 * Existe como módulo aparte por una razón concreta: un import de
 * firebase/firestore pesa ~400 kB. Si la pantalla inicial (o una landing
 * pública) importa esto para mostrar "falta configurar el .env", se
 * estaría descargando el SDK entero para leer dos variables.
 *
 * firebase.ts (que sí trae el SDK) reexporta `firebaseConfigurado` para
 * que quien lo use no tenga que saber de dónde salió.
 */

const PLACEHOLDER = 'sin-configurar'

const valor = (clave: string): string => import.meta.env[clave] || PLACEHOLDER

export const config = {
  apiKey: valor('VITE_FIREBASE_API_KEY'),
  authDomain: valor('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: valor('VITE_FIREBASE_PROJECT_ID'),
  appId: valor('VITE_FIREBASE_APP_ID'),
}

export const firebaseConfigurado =
  config.apiKey !== PLACEHOLDER && config.projectId !== PLACEHOLDER
