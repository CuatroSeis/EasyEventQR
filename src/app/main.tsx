import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import '../styles/index.css'

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
  </StrictMode>,
)
