import { useSearchParams } from 'react-router-dom'

/**
 * Página de pago fallido: /pago/fallo?registroId=xxx
 */
export default function PagoFallo() {
  const [busca] = useSearchParams()
  const registroId = busca.get('registroId')

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-4xl text-red-600">
        ✕
      </div>
      <h1 className="text-xl font-bold text-texto">El pago no se pudo completar</h1>
      <p className="text-sm text-texto-suave">
        Ocurrió un error al procesar tu pago. No se te ha cobrado nada.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <a
          href={registroId ? `/e/${registroId}` : '/'}
          className="rounded-lg bg-primario px-6 py-3 text-sm font-semibold text-sobre-primario text-center"
        >
          Volver al evento
        </a>
        <a
          href="/"
          className="rounded-lg border border-borde px-6 py-3 text-sm font-medium text-texto text-center"
        >
          Ir al inicio
        </a>
      </div>
    </main>
  )
}