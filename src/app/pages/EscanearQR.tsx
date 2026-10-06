import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'

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
  const [resultado, setResultado] = useState<{ asistente?: string; evento?: string; mensaje?: string }>({})
  const [ultimo, setUltimo] = useState<string | null>(null)
  const escanerRef = useRef<Html5Qrcode | null>(null)
  const escaneando = useRef(false)

  const onScan = useCallback(async (texto: string) => {
    if (escaneando.current || texto === ultimo) return
    escaneando.current = true
    setUltimo(texto)
    try {
      let tokenQR: string | null = null
      let eventoQR: string | null = null
      try {
        const url = new URL(texto)
        tokenQR = url.pathname.split('/q/')[1] || null
        eventoQR = url.searchParams.get('eventoId')
      } catch {
        tokenQR = texto.trim() || null
      }
      if (!tokenQR) throw new Error('QR inválido')
      const resp = await fetch('/api/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenQR, eventoId: eventoQR ?? eventoId }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setEstado(data.error?.includes('usado') ? 'ya_usado' : 'invalido')
        setResultado({ mensaje: data.error })
        return
      }
      setEstado('valido')
      setResultado({ asistente: data.asistente, evento: data.evento, mensaje: 'Entrada válida' })
    } catch (e) {
      setEstado('invalido')
      setResultado({ mensaje: e instanceof Error ? e.message : 'Error' })
    } finally {
      escaneando.current = false
      setTimeout(() => setUltimo(null), 2000)
    }
  }, [eventoId, ultimo])

  useEffect(() => {
    const escaner = new Html5Qrcode('escaner-panel')
    escanerRef.current = escaner
    escaner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }, onScan, () => {})
      .catch(() => setEstado('error_permiso'))
    return () => { escaner.stop().catch(() => {}) }
  }, [onScan])

  const reiniciar = () => { setEstado('listo'); setResultado({}); setUltimo(null) }

  if (estado === 'error_permiso') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold text-texto">No se pudo acceder a la cámara</h1>
        <p className="text-sm text-texto-suave">Concedé permiso de cámara e intentá de nuevo.</p>
        <button onClick={() => navegar(-1)} className="rounded-lg bg-primario px-6 py-3 text-sm font-semibold text-sobre-primario">Volver</button>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col p-6">
      <h1 className="mb-4 text-lg font-bold text-texto">Escanear QR</h1>
      <div id="escaner-panel" className="mb-4 aspect-square w-full overflow-hidden rounded-xl bg-slate-100" />
      {estado === 'valido' ? (
        <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4 text-center">
          <p className="font-bold text-green-800">{resultado.mensaje}</p>
          <p className="text-sm text-green-700"><strong>{resultado.asistente}</strong> · {resultado.evento}</p>
          <button onClick={reiniciar} className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm text-white">Siguiente</button>
        </div>
      ) : estado === 'ya_usado' ? (
        <div className="rounded-xl border-2 border-yellow-500 bg-yellow-50 p-4 text-center">
          <p className="font-bold text-yellow-800">Ya fue usado</p>
          <p className="text-sm text-yellow-700">{resultado.mensaje}</p>
          <button onClick={reiniciar} className="mt-3 rounded-lg bg-yellow-600 px-4 py-2 text-sm text-white">Siguiente</button>
        </div>
      ) : estado === 'invalido' ? (
        <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4 text-center">
          <p className="font-bold text-red-800">Código no válido</p>
          <p className="text-sm text-red-700">{resultado.mensaje}</p>
          <button onClick={reiniciar} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm text-white">Reintentar</button>
        </div>
      ) : (
        <p className="text-center text-sm text-texto-suave">Apuntá la cámara al QR de la entrada.</p>
      )}
      <button onClick={() => navegar(-1)} className="mt-4 text-sm text-texto-suave underline">Volver</button>
    </main>
  )
}
