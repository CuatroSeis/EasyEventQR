import { useSearchParams } from 'react-router-dom'

/**
 * Página de pago pendiente: /pago/pendiente?registroId=xxx
 */
export default function PagoPendiente() {
  const [busca] = useSearchParams()
  const registroId = busca.get('registroId')

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-yellow-100 text-4xl text-yellow-600 animate-pulse">
        ⏳
      </div>
      <h1 className="text-xl font-bold text-texto">Pago pendiente</h1>
      <p className="text-sm text-texto-suave">
        Tu pago está siendo procesado. Recibirás la confirmación por correo en breve.
      </p>
      {registroId && (
        <p className="text-xs text-texto-suave font-mono">
          Reserva: {registroId}
        </p>
      )}
      <a
        href="/"
        className="rounded-lg border border-borde px-6 py-3 text-sm font-medium text-texto"
      >
        Volver al inicio
      </a>
    </main>
  )
}