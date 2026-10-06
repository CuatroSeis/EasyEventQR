import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'

interface OperadorPayload {
  eventoId: string
  organizadorId: string
  iat: number
  exp: number
}

type EstadoEscaneo = 'verificando' | 'valido' | 'invalido' | 'ya_usado' | 'error_token' | 'error_permiso'

export default function Operador() {
  const { token } = useParams<{ token: string }>()
  const navegar = useNavigate()
  const [estado, setEstado] = useState<EstadoEscaneo>('verificando')
  const [resultado, setResultado] = useState<{
    evento?: string
    asistente?: string
    mensaje?: string
  }>({})
  const [ultimoEscaneo, setUltimoEscaneo] = useState<string | null>(null)
  const [payload, setPayload] = useState<OperadorPayload | null>(null)
  const escanerRef = useRef<Html5Qrcode | null>(null)
  const escaneando = useRef(false)

  // Verificar token al montar
  useEffect(() => {
    if (!token) {
      setEstado('error_token')
      return
    }

    const verificar = async () => {
      try {
        const resp = await fetch(`/api/operador/verificar?token=${encodeURIComponent(token)}`)
        const data = await resp.json()
        if (!resp.ok || !data.ok) {
          setEstado('error_token')
          return
        }
        setPayload(data.payload)
      } catch {
        setEstado('error_token')
      }
    }
    verificar()
  }, [token])

  // Escanear QR
  const onScanSuccess = useCallback(async (decodedText: string) => {
    if (escaneando.current || !payload) return
    escaneando.current = true

    // Evitar escanear el mismo QR dos veces seguidas
    if (decodedText === ultimoEscaneo) {
      escaneando.current = false
      return
    }
    setUltimoEscaneo(decodedText)

    try {
      // El QR trae la URL completa (https://dominio/q/TOKEN?eventoId=XXX),
      // pero si algún día llega el token pelado, se acepta igual.
      let tokenQR: string | null = null
      let eventoIdQR = payload.eventoId
      try {
        const url = new URL(decodedText)
        tokenQR = url.pathname.split('/q/')[1] || null
        eventoIdQR = url.searchParams.get('eventoId') || payload.eventoId
      } catch {
        tokenQR = decodedText.trim() || null
      }

      if (!tokenQR) {
        throw new Error('Formato QR inválido')
      }

      // Validar que el token del QR coincide con el evento del operador
      if (eventoIdQR !== payload.eventoId) {
        throw new Error('Este QR no pertenece a este evento')
      }

      // Llamar API para marcar como usado
      const resp = await fetch('/api/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenQR, eventoId: eventoIdQR }),
      })
      const data = await resp.json()

      if (!resp.ok) {
        switch (data.error) {
          case 'Código no válido':
            setEstado('invalido')
            break
          case 'Este código ya fue usado':
            setEstado('ya_usado')
            break
          case 'Este código no corresponde al evento':
            setEstado('invalido')
            break
          case 'La reserva no está confirmada':
            setEstado('invalido')
            break
          default:
            setEstado('invalido')
        }
        setResultado({ mensaje: data.error })
        return
      }

      // Éxito
      setEstado('valido')
      setResultado({
        evento: data.evento,
        asistente: data.asistente,
        mensaje: 'Entrada válida',
      })
    } catch (error) {
      setEstado('invalido')
      setResultado({ mensaje: error instanceof Error ? error.message : 'Error escaneando' })
    } finally {
      escaneando.current = false
      // Limpiar último escaneo después de 2s para permitir re-escanear
      setTimeout(() => setUltimoEscaneo(null), 2000)
    }
  }, [payload, ultimoEscaneo])

  // Configurar escáner
  useEffect(() => {
    if (!payload || estado === 'valido' || estado === 'ya_usado') return

    const escaner = new Html5Qrcode('escaner')
    escanerRef.current = escaner

    escaner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      },
      onScanSuccess,
      () => {} // onScanError - ignorar errores de lectura
    ).catch((err) => {
      console.error('Error iniciando cámara:', err)
      setEstado('error_permiso')
    })

    return () => {
      escaner.stop().catch(() => {})
    }
  }, [payload, estado, onScanSuccess])

  // Verificar expiración del token
  useEffect(() => {
    if (!payload) return
    const ahora = Math.floor(Date.now() / 1000)
    if (payload.exp < ahora) {
      setEstado('error_token')
    }
  }, [payload])

  const reiniciarEscaneo = () => {
    setEstado(payload ? 'verificando' : 'error_token')
    setResultado({})
    setUltimoEscaneo(null)
  }

  const volver = () => navegar('/panel')

  if (estado === 'verificando' && !payload) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-3xl text-blue-600 animate-pulse">🔍</div>
        <h1 className="text-xl font-bold text-texto">Verificando credenciales…</h1>
      </main>
    )
  }

  if (estado === 'error_token') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-4xl text-red-600">✕</div>
        <h1 className="text-xl font-bold text-texto">Link inválido o expirado</h1>
        <p className="text-sm text-texto-suave">El link de operador ha expirado o no es válido.</p>
        <button onClick={volver} className="rounded-lg bg-primario px-6 py-3 text-sm font-semibold text-sobre-primario">
          Volver al panel
        </button>
      </main>
    )
  }

  if (estado === 'error_permiso') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-4xl text-red-600">📷</div>
        <h1 className="text-xl font-bold text-texto">No se pudo acceder a la c\u00E1mara</h1>
        <p className="text-sm text-texto-suave">Concede permisos de c\u00E1mara en el navegador e int\u00E9ntalo de nuevo.</p>
        <button onClick={reiniciarEscaneo} className="rounded-lg bg-primario px-6 py-3 text-sm font-semibold text-sobre-primario">
          Reintentar
        </button>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col p-6">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-lg font-bold text-texto">Control de Acceso</h1>
        <p className="text-sm text-texto-suave">Evento: {payload?.eventoId}</p>
        <p className="text-xs text-texto-suave mt-1">
          Link válido hasta: {payload ? new Date(payload.exp * 1000).toLocaleString('es-AR') : '—'}
        </p>
      </header>

      {/* Cámara */}
      <div className="relative mb-6">
        <div id="escaner" className="w-full aspect-square rounded-xl overflow-hidden bg-slate-100" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width="280" height="280" viewBox="0 0 280 280" className="text-primario/50">
            <rect x="40" y="40" width="200" height="200" fill="none" stroke="currentColor" strokeWidth="3" rx="20" />
            <path d="M40 100h30M210 100h30M40 180h30M210 180h30M100 40v30M100 210v30M180 40v30M180 210v30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Resultado */}
      <div className="flex flex-col gap-4">
        {estado === 'valido' && (
          <div className="rounded-xl border-2 border-green-500 bg-green-50 p-6 text-center animate-bounce-in">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500 mx-auto mb-4 text-3xl text-white">✓</div>
            <h2 className="text-xl font-bold text-green-800">{resultado.mensaje}</h2>
            <p className="text-green-700 mt-1"><strong>{resultado.asistente}</strong></p>
            <p className="text-green-600 text-sm">{resultado.evento}</p>
            <button onClick={reiniciarEscaneo} className="mt-4 rounded-lg bg-green-600 px-6 py-2 text-sm font-semibold text-white">
              Escanear siguiente
            </button>
          </div>
        )}

        {estado === 'ya_usado' && (
          <div className="rounded-xl border-2 border-yellow-500 bg-yellow-50 p-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500 mx-auto mb-4 text-3xl text-white">⚠</div>
            <h2 className="text-xl font-bold text-yellow-800">Ya fue usado</h2>
            <p className="text-yellow-700 mt-1">{resultado.mensaje}</p>
            <button onClick={reiniciarEscaneo} className="mt-4 rounded-lg bg-yellow-600 px-6 py-2 text-sm font-semibold text-white">
              Escanear siguiente
            </button>
          </div>
        )}

        {estado === 'invalido' && (
          <div className="rounded-xl border-2 border-red-500 bg-red-50 p-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 mx-auto mb-4 text-3xl text-white">✕</div>
            <h2 className="text-xl font-bold text-red-800">Código no válido</h2>
            <p className="text-red-700 mt-1">{resultado.mensaje}</p>
            <button onClick={reiniciarEscaneo} className="mt-4 rounded-lg bg-red-600 px-6 py-2 text-sm font-semibold text-white">
              Intentar de nuevo
            </button>
          </div>
        )}

        {estado === 'verificando' && (
          <div className="rounded-xl border border-borde bg-superficie p-6 text-center">
            <p className="text-texto-suave">Apunta la cámara al código QR de la entrada</p>
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button onClick={reiniciarEscaneo} className="flex-1 rounded-lg border border-borde px-4 py-2 text-sm font-medium text-texto">
            Reiniciar escaneo
          </button>
          <button onClick={volver} className="flex-1 rounded-lg bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario">
            Volver al panel
          </button>
        </div>
      </div>
    </main>
  )
}