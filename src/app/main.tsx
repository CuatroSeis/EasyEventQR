import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'

import App from './App'
import '../styles/index.css'

// Sentry del cliente: sólo si hay DSN. Sin la variable, ni se importa el
// SDK, así dev y tests corren idéntico que antes. El DSN es público por
// diseño (viaja en el bundle); la protección la dan las reglas de Sentry
// sobre orígenes permitidos.
if (import.meta.env.VITE_SENTRY_DSN) {
  void import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
    })
  })
}

/**
 * Entry point del BUILD 1 (la aplicación).
 *
 * createRoot sobre #root, que es el <div> declarado en index.html.
 * StrictMode en desarrollo monta cada componente dos veces a propósito:
 * es la red de seguridad que hace aparecer los efectos con mala limpieza
 * (suscripciones, timers) en desarrollo y no en producción.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster position="bottom-right" />
  </StrictMode>,
)
