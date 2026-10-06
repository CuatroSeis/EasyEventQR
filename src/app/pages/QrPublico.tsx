import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'

/**
 * La pantalla del QR, en /q/:token.
 *
 * Es lo que ve la persona que escaneó el código del mail. Tres decisiones
 * que la definen:
 *
 *   1. `noindex`. Es la página más repetida de todo el producto (una por
 *      asistente) y su contenido es el token de una persona. Que un
 *      buscador la indexe es un problema de privacidad y además una
 *      forma de que el token se encuentre en un `robots.txt` de terceros.
 *      El `robots` lo pone la meta, no un archivo: la app es SPA y no
 *      tiene un `robots.txt` propio.
 *
 *   2. Nunca pide sesión ni habla con Firebase. Igual que la landing: va
 *      a /api/validar, que es de sólo lectura.
 *
 *   3. El QR se dibuja en un <canvas> desde el token de la URL, con la
 *      misma librería del servidor. El token nunca se muestra como texto:
 *      un screenshot del QR igual sirve como entrada, pero eso ya pasa
 *      con el mail; acá al menos no se puede copiar-pegar el código.
 */

type Veredicto =
  | { estado: 'cargando' }
  | { estado: 'valido'; eventoId: string | null; motivo: string }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'error'; motivo: string }

/** El veredicto, con el token al que pertenece. */
type Resultado = { token: string; veredicto: Veredicto }

export default function QrPublico() {
  const { token } = useParams<{ token: string }>()
  const [busca] = useSearchParams()
  // El token viaja ADENTRO del estado, para que el "cargando" se derive
  // en vez de poner un setState sincrónico adentro del efecto. Con dos
  // QRs escaneados seguidos en la misma sesión (el caso real: probás el
  // tuyo y después el de tu compañero), ese setState dibuja el veredicto
  // del anterior mientras espera el nuevo.
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const cargando = resultado === null || resultado.token !== token
  const veredicto = cargando ? ({ estado: 'cargando' } as const) : resultado.veredicto
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // El QR se dibuja en cliente desde el token de la URL: el servidor no
  // puede devolver la imagen (no guarda el token en claro, sólo su hash).
  useEffect(() => {
    if (veredicto.estado !== 'valido' || !token || !canvasRef.current) return
    // Mismo formato que `urlQrDe()`: /q/<token>?eventoId=<id>.
    const eventoId = busca.get('eventoId')
    const url =
      `${window.location.origin}/q/${token}` + (eventoId ? `?eventoId=${encodeURIComponent(eventoId)}` : '')
    QRCode.toCanvas(canvasRef.current, url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
    }).catch(() => {})
  }, [veredicto.estado, token, busca])

  useEffect(() => {
    document.title = 'Mi entrada · EasyEventQR'
  }, [])

  useEffect(() => {
    if (!token) return

    let vigente = true

    // El `eventoId` viaja como query opcional, y lo manda el link del
    // mail. Sirve para que la validación exija que la reserva sea de
    // este evento, así que un QR de un evento no valida en la pantalla de
    // otro. Si no viene, el token se valida solo.
    const params = new URLSearchParams({ t: token })
    const eventoId = busca.get('eventoId')
    if (eventoId) params.set('eventoId', eventoId)

    fetch(`/api/validar?${params.toString()}`)
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => null)
        if (!vigente) return
        if (!cuerpo?.ok) {
          setResultado({
            token,
            veredicto: {
              estado: 'error',
              motivo: cuerpo?.error ?? 'No pudimos validar el código.',
            },
          })
          return
        }
        setResultado({
          token,
          veredicto: cuerpo.valido
            ? { estado: 'valido', eventoId: cuerpo.eventoId ?? null, motivo: cuerpo.motivo }
            : { estado: 'invalido', motivo: cuerpo.motivo },
        })
      })
      .catch(() => {
        if (vigente) {
          setResultado({ token, veredicto: { estado: 'error', motivo: 'No pudimos conectarnos.' } })
        }
      })

    return () => {
      vigente = false
    }
  }, [token, busca])

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-5 p-6 text-center">
      <meta name="robots" content="noindex, nofollow" />

      {veredicto.estado === 'cargando' ? (
        <p className="text-sm text-texto-suave">Validando tu código…</p>
      ) : veredicto.estado === 'valido' ? (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primario text-4xl text-sobre-primario">
            ✓
          </div>
          <h1 className="text-xl font-bold text-texto">Entrada válida</h1>
          <canvas
            ref={canvasRef}
            className="mx-auto rounded-xl border border-borde bg-white p-2"
            role="img"
            aria-label="Código QR de tu entrada"
          />
          <p className="text-sm text-texto-suave">{veredicto.motivo}</p>
          <p className="text-sm text-texto-suave">Mostrala en la puerta, con el brillo alto.</p>
        </>
      ) : (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-borde text-3xl text-texto-suave">
            ✕
          </div>
          <h1 className="text-xl font-bold text-texto">
            {veredicto.estado === 'error' ? 'No pudimos validar' : 'Código no válido'}
          </h1>
          <p className="text-sm text-texto-suave">{veredicto.motivo}</p>
          {veredicto.estado === 'invalido' ? (
            <p className="text-xs text-texto-suave">
              Si recién te registraste, el correo puede tardar un minuto en llegar. Revisá también
              la carpeta de spam.
            </p>
          ) : null}
        </>
      )}
    </main>
  )
}
