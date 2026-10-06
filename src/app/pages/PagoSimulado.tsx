import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Checkout SIMULADO: /pago/simulado?preference_id=…&payment_id=…&external_reference=…
 *
 * Esta pantalla reemplaza a Mercado Pago mientras no haya integración real.
 * No cobra nada: los dos botones arman la URL del webhook y la pegan, que
 * es exactamente lo que haría MP del otro lado.
 *
 * POR QUÉ ESTA PANTALLA DICE "SIMULACIÓN" EN GRANDE
 *
 * Porque si pareciera un checkout real, alguien podría creer que el
 * botón de rechazar es una funcionalidad del producto. El riesgo real es
 * al revés: que en una demo alguien crea entradas de verdad creyendo que
 * se están pagando. El aviso va arriba de todo, no en un pie de página.
 *
 * La ruta entera depende de `MERCADOPAGO_SIMULADO=true`. Apagada, el
 * backend responde 501 y esta pantalla muestra el error, así que no
 * hace falta ni bloquearla del lado del cliente: el flag es la única
 * fuente de verdad.
 *
 * Las URLs van RELATIVAS (`/api/...`): el frontend llama a su propio
 * origen. Armarlas con `VITE_APP_URL` hacía que el entorno local pegara
 * contra la API de producción (ver src/services/pagos.ts).
 *
 * `external_reference` es el `qrHash` de la reserva, que también es el id
 * del documento en Firestore. Por eso el backend puede encontrar la
 * reserva sin que el cliente le mande nada más.
 */

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
  // precioEntrada viaja en unidades (pesos), no en centavos: el resto de
  // la app lo muestra con toLocaleString/toFixed directo.
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 0,
  }).format(monto)
}

export default function PagoSimulado() {
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
      setError('El link de pago no tiene la referencia de la reserva.')
      setCargando(false)
      return
    }

    // Cancelado si el componente se desmonta: sin esto, unStrictMode de
    // desarrollo hace dos requests y el segundo escribe estado sobre un
    // componente que ya no está.
    let vivo = true

    ;(async () => {
      try {
        const resp = await fetch(`/api/pagos/resumen?registroId=${encodeURIComponent(registroId)}`)
        const data = await resp.json()
        if (!vivo) return
        if (!resp.ok || !data.ok) {
          setError(data.error ?? 'No pudimos cargar el pago.')
          return
        }
        setResumen(data as Resumen)
      } catch {
        if (vivo) setError('No pudimos conectar con el servidor.')
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
        setFallo('El link de pago está incompleto. Volvé a la landing del evento.')
        return
      }

      setDecision(estado === 'approved' ? 'aprobando' : 'rechazando')
      setFallo(null)

      // El redirect es al webhook con el estado, que es lo que haría el
      // checkout real al terminar. La pantalla de destino la decide el
      // backend, no esta función.
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
          setFallo('El pago no se pudo registrar. Probá de nuevo.')
          setDecision('idle')
          return
        }
        window.location.assign(`${destino}?registroId=${encodeURIComponent(registroId)}`)
      } catch {
        setFallo('No pudimos conectar con el servidor.')
        setDecision('idle')
      }
    },
    [preferenceId, paymentId, registroId],
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <div className="rounded-xl border-2 border-yellow-400 bg-yellow-50 p-4 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-yellow-800">
          Modo simulación
        </p>
        <p className="mt-1 text-sm text-texto">
          Esto no es Mercado Pago. No se cobra nada y los botones son de mentira.
        </p>
      </div>

      {cargando && <p className="text-center text-sm text-texto-suave">Cargando el pago…</p>}

      {error && (
        <div className="rounded-xl border border-borde p-4 text-center">
          <p className="text-sm text-texto">{error}</p>
          <a href="/" className="mt-4 inline-block text-sm underline">
            Volver al inicio
          </a>
        </div>
      )}

      {resumen && !error && (
        <>
          <div className="rounded-xl border border-borde bg-superficie p-5">
            <h1 className="text-lg font-bold text-texto">{resumen.evento.nombre}</h1>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-texto-suave">Cuándo</dt>
                <dd className="text-right font-medium capitalize text-texto">
                  {formatoFecha(resumen.evento.fechaIso)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-texto-suave">Dónde</dt>
                <dd className="text-right font-medium text-texto">{resumen.evento.lugar}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-borde pt-2">
                <dt className="text-texto-suave">Total</dt>
                <dd className="text-right text-lg font-bold text-texto">
                  {formatoMoneda(resumen.monto, resumen.moneda)}
                </dd>
              </div>
            </dl>
          </div>

          {resumen.estado !== 'pendiente' && (
            <p className="rounded-xl border border-borde bg-superficie p-4 text-center text-sm text-texto-suave">
              Esta reserva ya está en estado <strong>{resumen.estado}</strong>. Podés cerrarla sin
              pagar de nuevo.
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
                {decision === 'aprobando' ? 'Aprobando…' : 'Simular pago aprobado'}
              </button>
              <button
                type="button"
                onClick={() => decidir('rejected')}
                disabled={decision !== 'idle'}
                className="rounded-lg border border-borde px-6 py-3 text-sm font-medium text-texto disabled:opacity-50"
              >
                {decision === 'rechazando' ? 'Rechazando…' : 'Simular pago rechazado'}
              </button>
            </div>
          )}

          <p className="text-center text-xs text-texto-suave">
            Para probar el circuito completo: aprobá el pago, revisá que el registro quede en
            &ldquo;aprobado&rdquo; y escaneá el QR del mail en la puerta.
          </p>
        </>
      )}
    </main>
  )
}