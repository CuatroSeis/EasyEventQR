import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { extraerTokenQr, useEscanerQr } from '../components/useEscanerQr'
import { useIdioma } from '../components/IdiomaContext'

type Estado = 'listo' | 'valido' | 'ya_usado' | 'invalido' | 'error_permiso'

/**
 * Escáner de QR para el organizador, dentro del panel, por evento.
 *
 * `/operador/:token` es la vía del invitado (scan en puerta sin cuenta);
 * esta es la del organizador logueado: mismo POST /api/validar, mismo
 * marcado atómico de `usado`, pero sin JWT de operador — la sesión del
 * panel ya autorizó, y el eventoId sale de la ruta, no de un token.
 */
export default function EscanearQR() {
  const { eventoId } = useParams<{ eventoId: string }>()
  const navegar = useNavigate()
  const [estado, setEstado] = useState<Estado>('listo')
  const { t } = useIdioma()
  const [resultado, setResultado] = useState<{ asistente?: string; evento?: string; mensaje?: string }>({})

  async function onScan(texto: string) {
    try {
      const { token: tokenQR, eventoId: eventoIdQR } = extraerTokenQr(texto)
      const resp = await fetch('/api/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenQR, eventoId: eventoIdQR ?? eventoId }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setEstado(/usado|used/i.test(data.error ?? '') ? 'ya_usado' : 'invalido')
        setResultado({ mensaje: data.error })
        return
      }
      setEstado('valido')
      setResultado({ asistente: data.asistente, evento: data.evento, mensaje: 'Entrada válida' })
    } catch (e) {
      setEstado('invalido')
      setResultado({ mensaje: e instanceof Error ? e.message : t('scan.no') })
    }
  }

  useEscanerQr({
    elementoId: 'escaner-panel',
    activo: estado !== 'error_permiso',
    onScan,
    onErrorCamara: () => setEstado('error_permiso'),
  })

  const reiniciar = () => { setEstado('listo'); setResultado({}) }

  if (estado === 'error_permiso') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold text-texto">{t('scan.camara.t')}</h1>
        <p className="text-sm text-texto-suave">{t('scan.camara.d')}</p>
        <button onClick={() => navegar(-1)} className="rounded-lg bg-primario px-6 py-3 text-sm font-semibold text-sobre-primario">{t('comun.volver')}</button>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col p-6">
      <h1 className="mb-4 text-lg font-bold text-texto">{t('scan.titulo')}</h1>
      <div id="escaner-panel" className="mb-4 aspect-square w-full overflow-hidden rounded-xl bg-slate-100" />
      {estado === 'valido' ? (
        <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4 text-center">
          <p className="font-bold text-green-800">{t('scan.ok')}</p>
          <p className="text-sm text-green-700"><strong>{resultado.asistente}</strong> · {resultado.evento}</p>
          <button onClick={reiniciar} className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm text-white">{t('comun.siguiente')}</button>
        </div>
      ) : estado === 'ya_usado' ? (
        <div className="rounded-xl border-2 border-yellow-500 bg-yellow-50 p-4 text-center">
          <p className="font-bold text-yellow-800">{t('scan.usado')}</p>
          <p className="text-sm text-yellow-700">{resultado.mensaje}</p>
          <button onClick={reiniciar} className="mt-3 rounded-lg bg-yellow-600 px-4 py-2 text-sm text-white">{t('comun.siguiente')}</button>
        </div>
      ) : estado === 'invalido' ? (
        <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4 text-center">
          <p className="font-bold text-red-800">{t('scan.no')}</p>
          <p className="text-sm text-red-700">{resultado.mensaje}</p>
          <button onClick={reiniciar} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm text-white">{t('scan.reintentar')}</button>
        </div>
      ) : (
          <p className="text-center text-sm text-texto-suave">{t('scan.ayuda')}</p>
      )}
      <button onClick={() => navegar(-1)} className="mt-4 text-sm text-texto-suave underline">{t('comun.volver')}</button>
    </main>
  )
}
