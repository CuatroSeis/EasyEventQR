import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

/**
 * Cámara y parseo del QR, compartido por el escáner del organizador
 * (`EscanearQR`, con sesión) y el del invitado (`Operador`, con JWT).
 * Lo único que cambia entre los dos es qué hacen con el token después;
 * eso lo decide el `onScan` de cada pantalla.
 */

/** Saca token + eventoId de lo que leyó la cámara (URL completa o token pelado). */
export function extraerTokenQr(texto: string): { token: string; eventoId: string | null } {
  const pelado = texto.trim()
  if (!pelado) throw new Error('QR inválido')
  try {
    const url = new URL(pelado)
    const token = url.pathname.split('/q/')[1] || null
    if (!token) throw new Error('QR inválido')
    return { token, eventoId: url.searchParams.get('eventoId') }
  } catch (error) {
    if (error instanceof Error && error.message === 'QR inválido') throw error
    return { token: pelado, eventoId: null }
  }
}

interface Opciones {
  elementoId: string
  activo: boolean
  onScan: (texto: string) => Promise<void> | void
  onErrorCamara: () => void
}

/** Prende la cámara cuando `activo`, la apaga al desmontar o al apagarse. */
export function useEscanerQr({ elementoId, activo, onScan, onErrorCamara }: Opciones): void {
  const escanerRef = useRef<Html5Qrcode | null>(null)
  const ocupado = useRef(false)
  const ultimo = useRef<string | null>(null)
  const cbRef = useRef({ onScan, onErrorCamara })
  cbRef.current = { onScan, onErrorCamara }

  useEffect(() => {
    if (!activo) return
    const escaner = new Html5Qrcode(elementoId)
    escanerRef.current = escaner
    escaner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (texto) => {
          // El lector dispara decenas de veces por segundo sobre el mismo
          // código: sin este freno cada escaneo pega a /api/validar.
          if (ocupado.current || texto === ultimo.current) return
          ocupado.current = true
          ultimo.current = texto
          void Promise.resolve()
            .then(() => cbRef.current.onScan(texto))
            .finally(() => {
              ocupado.current = false
              // Sin esto, el mismo QR en cámara genera un POST por frame.
              setTimeout(() => {
                ultimo.current = null
              }, 2000)
            })
        },
        () => {},
      )
      .catch(() => cbRef.current.onErrorCamara())
    return () => {
      escaner.stop().catch(() => {})
    }
  }, [elementoId, activo])
}
