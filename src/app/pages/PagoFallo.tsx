import { useSearchParams } from 'react-router-dom'
import { useIdioma } from '../components/IdiomaContext'

/**
 * Página de pago fallido: /pago/fallo?registroId=xxx
 */
export default function PagoFallo() {
  const { t } = useIdioma()
  const [busca] = useSearchParams()
  const registroId = busca.get('registroId')

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-4xl text-red-600">
        ✕
      </div>
      <h1 className="text-xl font-bold text-texto">{t('pago.fallo.t')}</h1>
      <p className="text-sm text-texto-suave">{t('pago.fallo.d')}</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <a
          href={registroId ? `/e/${registroId}` : '/'}
          className="rounded-lg bg-primario px-6 py-3 text-sm font-semibold text-sobre-primario text-center"
        >
          {t('pago.fallo.evento')}
        </a>
        <a
          href="/"
          className="rounded-lg border border-borde px-6 py-3 text-sm font-medium text-texto text-center"
        >
          {t('pago.fallo.inicio')}
        </a>
      </div>
    </main>
  )
}