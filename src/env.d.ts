/**
 * Tipos de las variables de entorno.
 *
 * Vite declara `ImportMetaEnv` con un índice `[key: string]: any`, así que
 * sin este archivo `import.meta.env.VITE_CUALQUIER_COSA` compilaría sin
 * quejarse. Declararlas explícitamente convierte un typo en un error.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_APP_ID: string
}
