/**
 * Sentry del backend (Vercel Functions).
 *
 * Módulo hoja, igual que mail.ts y qr.ts: `capturarError()` es lo único
 * que las funciones de /api/ deben tocar. Sin `SENTRY_DSN` el módulo no
 * hace NADA (ni importa el SDK), así que un entorno sin DSN anda igual
 * que antes y el costo es un `if`.
 *
 * La inicialización es perezosa e idempotente: la primera llamada la
 * dispara, el resto cae en la misma instancia. En una lambda fría sólo
 * paga el costo la primera petición.
 */
let iniciado: Promise<void> | null = null

async function asegurarInicio(): Promise<void> {
  if (!process.env.SENTRY_DSN) return
  if (!iniciado) {
    iniciado = import('@sentry/node').then((Sentry) => {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.VERCEL_ENV ?? 'development',
        // El servicio corre en plan gratis: trazar el 100% de las
        // peticiones quema la cuota en el primer evento popular.
        tracesSampleRate: 0.1,
      })
    })
  }
  await iniciado
}

/** Registra el error en Sentry si hay DSN, y siempre en consola. */
export async function capturarError(error: unknown, contexto?: Record<string, string>): Promise<void> {
  console.error(error)
  if (!process.env.SENTRY_DSN) return
  try {
    await asegurarInicio()
    const Sentry = await import('@sentry/node')
    if (contexto) {
      Sentry.withScope((scope) => {
        for (const [k, v] of Object.entries(contexto)) scope.setTag(k, v)
        Sentry.captureException(error)
      })
    } else {
      Sentry.captureException(error)
    }
  } catch {
    // Nunca tirar desde el reportero de errores: si Sentry falla, el log
    // de consola ya quedó y la request sigue.
  }
}
