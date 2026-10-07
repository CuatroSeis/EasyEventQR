import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { verificarEstadoPago } from '../../services/pagos'
import { useIdioma } from '../components/IdiomaContext'

/**
 * Página de éxito de pago: /pago/exito?registroId=xxx
 * Verifica el estado y muestra confirmación.
 */
export default function PagoExito() {
  const { t } = useIdioma()
  const [busca] = useSearchParams()
  const registroId = busca.get('registroId')
  const [estado, setEstado] = useState<'verificando' | 'aprobado' | 'pendiente' | 'error'>('verificando')

  useEffect(() => {
    if (!registroId) {
      setEstado('error')
      return
    }

    const verificar = async () => {
      try {
        const resp = await verificarEstadoPago(registroId)
        if (resp.ok && resp.estado === 'pagado') {
          setEstado('aprobado')
        } else if (resp.ok && resp.estado === 'pendiente') {
          setEstado('pendiente')
        } else {
          setEstado('error')
        }
      } catch {
        setEstado('error')
      }
    }

    verificar()

    // Polling cada 3 segundos por si el webhook tarda
    const interval = setInterval(verificar, 3000)
    return () => clearInterval(interval)
  }, [registroId])

  useEffect(() => {
    document.title = 'Pago exitoso · EasyEventQR'
  }, [])

  if (estado === 'verificando') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-3xl text-blue-600 animate-pulse">
          ⏳
        </div>
        <h1 className="text-xl font-bold text-texto">{t('pago.ok.verificando')}</h1>
        <p className="text-sm text-texto-suave">{t('pago.ok.verificando.d')}</p>
      </main>
    )
  }

  if (estado === 'aprobado') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl text-green-600">
          ✓
        </div>
        <h1 className="text-xl font-bold text-texto">{t('pago.ok.t')}</h1>
        <p className="text-sm text-texto-suave">{t('pago.ok.d')}</p>
        <p className="text-sm text-texto-suave">{t('pago.ok.mail')}</p>
        <p className="text-xs text-texto-suave">
          El código viaja en el mail porque el token en claro no se guarda en
          ningún lado: ningún link de esta pantalla puede rearmarlo.
        </p>
      </main>
    )
  }

  if (estado === 'pendiente') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 text-3xl text-yellow-600 animate-pulse">
          ⏳
        </div>
        <h1 className="text-xl font-bold text-texto">{t('pago.pend.t')}</h1>
        <p className="text-sm text-texto-suave">{t('pago.pend.d')}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-4xl text-red-600">
        ✕
      </div>
      <h1 className="text-xl font-bold text-texto">{t('pago.err.t')}</h1>
      <p className="text-sm text-texto-suave">{t('pago.err.d')}</p>
    </main>
  )
}