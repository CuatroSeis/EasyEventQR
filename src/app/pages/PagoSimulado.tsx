import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useIdioma } from '../components/IdiomaContext'

/** Checkout SIMULADO (`MERCADOPAGO_SIMULADO=true`): no cobra nada, los botones pegan al webhook como haría MP. El banner arriba es para que nadie lo confunda con un checkout real. */

type EstadoDecision = 'idle' | 'aprobando' | 'rechazando' | 'hecho'

interface Resumen {
  ok: boolean
  evento: { nombre: string; lugar: string; fechaIso: string }
  monto: number
  moneda: string
  estado: string
}

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatoMoneda(monto: number, moneda: string): string {
  // En unidades (pesos), no centavos.
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 0,
  }).format(monto)
}

export default function PagoSimulado() {
  const { t } = useIdioma()
  const [busca] = useSearchParams()
  const preferenceId = busca.get('preference_id')
  const paymentId = busca.get('payment_id')
  const registroId = busca.get('external_reference')

  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [decision, setDecision] = useState<EstadoDecision>('idle')
  const [fallo, setFallo] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Pago (simulado) · EasyEventQR'
  }, [])

  useEffect(() => {
    if (!registroId) {
      setError(t('pago.link.malo'))
      setCargando(false)
      return
    }

    // Sin esto, StrictMode hace doble request y escribe sobre un desmontado.
    let vivo = true

    ;(async () => {
      try {
        const resp = await fetch(`/api/pagos/resumen?registroId=${encodeURIComponent(registroId)}`)
        const data = await resp.json()
        if (!vivo) return
        if (!resp.ok || !data.ok) {
          setError(data.error ?? t('pago.cargando'))
          return
        }
        setResumen(data as Resumen)
      } catch {
        if (vivo) setError(t('pago.red'))
      } finally {
        if (vivo) setCargando(false)
      }
    })()

    return () => {
      vivo = false
    }
  }, [registroId])

  const decidir = useCallback(
    async (estado: 'approved' | 'rejected') => {
      if (!registroId || !preferenceId) {
        setFallo(t('pago.link.roto'))
        return
      }

      setDecision(estado === 'approved' ? 'aprobando' : 'rechazando')
      setFallo(null)

      // Al webhook, como haría el checkout real; el destino lo decide el backend.
      const destino = estado === 'approved' ? '/pago/exito' : '/pago/fallo'
      const params = new URLSearchParams({
        preference_id: preferenceId,
        payment_id: paymentId ?? '',
        external_reference: registroId,
        status: estado,
      })
      const webhook = `/api/pagos/webhook?${params.toString()}`

      try {
        const resp = await fetch(webhook, { method: 'POST' })
        if (!resp.ok) {
          setFallo(t('pago.no.registro'))
          setDecision('idle')
          return
        }
        window.location.assign(`${destino}?registroId=${encodeURIComponent(registroId)}`)
      } catch {
        setFallo(t('pago.red'))
        setDecision('idle')
      }
    },
    [preferenceId, paymentId, registroId],
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <div className="rounded-xl border-2 border-yellow-400 bg-yellow-50 p-4 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-yellow-800">
          {t('pago.sim.aviso')}
        </p>
        <p className="mt-1 text-sm text-texto">
          {t('pago.sim.aviso.d')}
        </p>
      </div>

      {cargando && <p className="text-center text-sm text-texto-suave">{t('pago.cargando')}</p>}

      {error && (
        <div className="rounded-xl border border-borde p-4 text-center">
          <p className="text-sm text-texto">{error}</p>
          <a href="/" className="mt-4 inline-block text-sm underline">
            {t('pago.volver.inicio')}
          </a>
        </div>
      )}

      {resumen && !error && (
        <>
          <div className="rounded-xl border border-borde bg-superficie p-5">
            <h1 className="text-lg font-bold text-texto">{resumen.evento.nombre}</h1>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-texto-suave">{t('pago.cuando')}</dt>
                <dd className="text-right font-medium capitalize text-texto">
                  {formatoFecha(resumen.evento.fechaIso)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-texto-suave">{t('pago.donde')}</dt>
                <dd className="text-right font-medium text-texto">{resumen.evento.lugar}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-borde pt-2">
                <dt className="text-texto-suave">{t('pago.total')}</dt>
                <dd className="text-right text-lg font-bold text-texto">
                  {formatoMoneda(resumen.monto, resumen.moneda)}
                </dd>
              </div>
            </dl>
          </div>

          {resumen.estado !== 'pendiente' && (
            <p className="rounded-xl border border-borde bg-superficie p-4 text-center text-sm text-texto-suave">
              {t('pago.yaestado')} <strong>{resumen.estado}</strong>. {t('pago.yaestado.d')}
            </p>
          )}

          {fallo && (
            <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {fallo}
            </p>
          )}

          {resumen.estado === 'pendiente' && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => decidir('approved')}
                disabled={decision !== 'idle'}
                className="rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {decision === 'aprobando' ? t('pago.aprobando') : t('pago.aprobar')}
              </button>
              <button
                type="button"
                onClick={() => decidir('rejected')}
                disabled={decision !== 'idle'}
                className="rounded-lg border border-borde px-6 py-3 text-sm font-medium text-texto disabled:opacity-50"
              >
                {decision === 'rechazando' ? t('pago.rechazando') : t('pago.rechazar')}
              </button>
            </div>
          )}

          <p className="text-center text-xs text-texto-suave">
            {t('pago.sim.pie')}
          </p>
        </>
      )}
    </main>
  )
}