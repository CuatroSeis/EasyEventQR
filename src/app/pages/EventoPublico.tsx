import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'

import { aplicarTema, resolverColores } from '../../shared/theming'
import { crearPreferenciaPago, abrirCheckoutMP } from '../../services/pagos'

/**
 * La landing pública de un evento, en /e/:eventoId.
 *
 * Esta pantalla es la primera vez que alguien que no tiene cuenta ve el
 * producto, y por lo tanto es la que decide si el producto sirve. Tres
 * cosas la definen:
 *
 *   1. No usa el SDK de Firebase. Ni Auth, ni Firestore, ni config. Todo
 *      lo que necesita sale de /api/evento-publico, que es una función
 *      serverless con el Admin SDK. Si esta pantalla importara
 *      src/services/firebase, el bundle público arrastraría el SDK entero
 *      y además las reglas no dejarían leer el evento sin sesión.
 *   2. El formulario manda a /api/registro, no a Firestore. Por lo mismo:
 *      las reglas no permiten escribir registros sin sesión, y aunque
 *      permitieran, la reserva tiene que ser atómica con el contador de
 *      cupo, y eso sólo se puede hacer con el Admin SDK.
 *   3. Valida con las reglas del navegador antes de mandar. No por
 *      seguridad (la validación real es la de /api/validarRegistro) sino
 *      por el round trip: en una conexión de datos de campo, un 400 que
 *      tarda tres segundos en volver se lee como la app colgada.
 *
 * El `useEffect` del tema tiene un `cleanup` que llama a `aplicarTema`
 * con null. Sin eso, si el visitante pasa por dos eventos seguidos con
 * el mismo cliente SPA, el color rojo del evento anterior queda pegado en
 * el `documentElement` del segundo. `aplicarTema(null, ...)` es lo que
 * borra las variables, y su semántica exacta está probada en
 * tests/unit/theming.test.ts.
 */

/** Lo que se sabe de la carga, siempre ligado al id que se pidió. */
type Carga =
  | { id: string; estado: 'listo'; evento: EventoPublico }
  | { id: string; estado: 'error' }
  | null

interface EventoPublico {
  eventoId: string
  nombre: string
  fecha: string
  lugar: string
  descripcion: string
  lugaresRestantes: number
  agotado: boolean
  requierePago: boolean
  precioEntrada: number | null
  personalizacion: {
    bannerUrl: string | null
    logoUrl: string | null
    colorPrimario: string | null
    colorSecundario: string | null
    textoBienvenida: string | null
    textoConfirmacion: string | null
    tema: string | null
  }
  organizador?: {
    nombre: string
    descripcion: string
    logoUrl: string | null
    instagram: string | null
    web: string | null
  }
}

interface ProblemasDelFormulario {
  [campo: string]: string
}

export default function EventoPublico() {
  const { eventoId } = useParams<{ eventoId: string }>()
  const identificador = eventoId?.toUpperCase()

  // Un solo estado para la carga, con el id adentro. El "cargando" se
  // DERIVA de que el id de la carga sea el id que se está mirando, en
  // vez de poner un setEstado('cargando') adentro del efecto: con dos
  // eventos visits uno atrás del otro en la misma sesión, ese setState
  // dispara un render de más en cada cambio de ruta y, peor, deja el
  // evento anterior en pantalla hasta que termina el setState.
  const [carga, setCarga] = useState<Carga>(null)
  const currentId = identificador ?? ''
  const [problemas, setProblemas] = useState<ProblemasDelFormulario>({})
  const [enviando, setEnviando] = useState(false)
  const [reservado, setReservado] = useState(false)
  const [mostrandoForm, setMostrandoForm] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  // El evento de ESTE id, o null. Va antes de los efectos porque los
  // efectos lo leen, y los hooks no se pueden poner después de un return
  // temprano.
  const evento =
    carga !== null && carga.id === currentId && carga.estado === 'listo' ? carga.evento : null
  const fallo = carga !== null && carga.id === currentId && carga.estado === 'error'

  useEffect(() => {
    if (!identificador) return

    let vigente = true

    fetch(`/api/evento-publico?id=${encodeURIComponent(identificador)}`)
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => null)
        // El flag `vigente`: si mientras se escuchaba la respuesta el
        // visitante navegó a otro evento, el resultado de esta request ya
        // no le corresponde a nadie y se tira. Sin esto, volver atrás en
        // el historial muestra el evento del que se fue.
        if (!vigente) return
        if (!respuesta.ok || !cuerpo?.ok) {
          setCarga({ id: currentId, estado: 'error' })
          return
        }
        setCarga({ id: currentId, estado: 'listo', evento: cuerpo.evento as EventoPublico })
      })
      .catch(() => {
        if (vigente) setCarga({ id: currentId, estado: 'error' })
      })

    return () => {
      vigente = false
    }
  }, [currentId])

  // El tema del evento, y su limpieza. Ver la nota de arriba.
  // `resolverColores` mete el preset elegido (el custom manda si hay).
  useEffect(() => {
    if (!evento) return
    aplicarTema(resolverColores(evento.personalizacion), document.documentElement)
    return () => aplicarTema(null, document.documentElement)
  }, [evento])

  // El <title> del evento. Sin esto la pestaña dice "EasyEventQR" para
  // todos, y el evento se comparte por WhatsApp con un link.
  useEffect(() => {
    if (!evento) return
    const anterior = document.title
    document.title = `${evento.nombre} · EasyEventQR`
    return () => {
      document.title = anterior
    }
  }, [evento])

  // Los dos casos sin datos van PRIMERO, para que después de ellos
  // TypeScript sepa que `evento` no es null y no haya que castear en cada
  // uso. El "reservado" va después a propósito: si el evento se recarga
  // justo después de reservar, la confirmación tiene que seguir en
  // pantalla.
  if (fallo) return <Marco><NoDisponible /></Marco>
  if (!evento) return <Marco><Cargando /></Marco>

  if (reservado) {
    return (
      <Marco evento={evento}>
        <div className="space-y-4 text-center">
          <Confirmacion evento={evento} />
        </div>
      </Marco>
    )
  }

  return (
    <Marco evento={evento}>
      <div className="space-y-8">
        <Encabezado evento={evento} />

        {evento.organizador ? (
          <section className="rounded-xl border border-borde bg-superficie p-4 space-y-2" aria-label="Organizador">
            <div className="flex items-center gap-3">
              {evento.organizador.logoUrl ? (
                <img
                  src={evento.organizador.logoUrl}
                  alt=""
                  className="h-10 w-10 rounded-md object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : null}
              <div>
                <p className="text-sm font-semibold text-texto">Organizado por {evento.organizador.nombre}</p>
                {evento.organizador.descripcion ? (
                  <p className="text-xs text-texto-suave">{evento.organizador.descripcion}</p>
                ) : null}
              </div>
            </div>
            <div className="flex gap-3 text-xs text-texto-suave">
              {evento.organizador.instagram ? <span>@{evento.organizador.instagram.replace(/^@/, '')}</span> : null}
              {evento.organizador.web ? <span>{evento.organizador.web}</span> : null}
            </div>
          </section>
        ) : null}

        {evento.requierePago && evento.precioEntrada !== null ? (
          <p className="rounded-lg border border-borde bg-superficie p-3 text-sm font-semibold text-texto">
            Entrada: ${evento.precioEntrada.toLocaleString('es-AR')}
          </p>
        ) : null}

        {!mostrandoForm && !evento.agotado ? (
          <button
            type="button"
            onClick={() => setMostrandoForm(true)}
            className="min-h-[56px] w-full rounded-xl bg-primario px-6 py-3 text-lg font-semibold text-sobre-primario"
          >
            Asistir / Comprar entrada
          </button>
        ) : null}

        {mostrandoForm ? (
        <Formulario
          evento={evento}
          problemas={problemas}
          enviando={enviando}
          errorEnvio={errorEnvio}
          onEnviar={async (datos) => {
            setEnviando(true)
            setErrorEnvio(null)
            setProblemas({})
            try {
              const respuesta = await fetch('/api/registro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos),
              })
              const cuerpo = await respuesta.json()
              if (!respuesta.ok || !cuerpo?.ok) {
                if (cuerpo?.problemas) {
                  const porCampo: ProblemasDelFormulario = {}
                  for (const p of cuerpo.problemas as Array<{ campo: string; mensaje: string }>) {
                    porCampo[p.campo] = p.mensaje
                  }
                  setProblemas(porCampo)
                } else {
                  setErrorEnvio(cuerpo?.error ?? 'No pudimos completar la reserva.')
                }
                setEnviando(false)
                return
              }

              // Reserva exitosa
              const requierePago = evento.requierePago && evento.precioEntrada
              const registroId = cuerpo.registroId // El backend debería devolver esto

              if (requierePago && registroId) {
                // Evento con pago: crear preferencia y redirigir a checkout
                const pref = await crearPreferenciaPago(registroId)
                if (pref.ok && pref.init_point) {
                  abrirCheckoutMP(pref.init_point)
                  return
                }
                setErrorEnvio('No se pudo iniciar el pago. Intentá de nuevo.')
                setEnviando(false)
                return
              }

              // Evento gratis o sin pago: mostrar confirmación normal
              setReservado(true)
            } catch {
              setErrorEnvio('No pudimos conectarnos. Revisá la conexión e intentá de nuevo.')
              setEnviando(false)
            }
          }}
        />
        ) : null}
      </div>
    </Marco>
  )
}

/** El marco: banner, logo, y el ancho de lectura en el centro. */
function Marco({ evento, children }: { evento?: EventoPublico; children: React.ReactNode }) {
  const p = evento?.personalizacion
  return (
    <main className="min-h-dvh bg-superficie">
      {p?.bannerUrl ? (
        <img
          src={p.bannerUrl}
          alt=""
          className="h-40 w-full object-cover sm:h-52"
          // Una imagen rota no puede romper la landing: el <img> queda
          // con la altura del banner y nada más.
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : null}

      <div className="mx-auto max-w-lg px-4 py-8 sm:py-12">
        {p?.logoUrl ? (
          <img
            src={p.logoUrl}
            alt=""
            className="mb-6 h-12 w-auto"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : null}
        {children}
      </div>
    </main>
  )
}

function Cargando() {
  return <p className="py-16 text-center text-sm text-texto-suave">Cargando el evento…</p>
}

function NoDisponible() {
  return (
    <div className="space-y-3 py-16 text-center">
      <h1 className="text-lg font-semibold text-texto">No encontramos este evento</h1>
      <p className="text-sm text-texto-suave">
        Puede que el link tenga un error, o que el organizador ya lo haya cerrado.
      </p>
    </div>
  )
}

function Encabezado({ evento }: { evento: EventoPublico }) {
  const fecha = new Date(evento.fecha)
  const cuando = Number.isNaN(fecha.getTime())
    ? evento.fecha
    : fecha.toLocaleString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })

  return (
    <header className="space-y-3">
      <h1 className="text-2xl font-bold leading-tight text-texto sm:text-3xl">{evento.nombre}</h1>
      <p className="text-sm text-texto-suave">{cuando}</p>
      {evento.lugar ? <p className="text-sm text-texto-suave">{evento.lugar}</p> : null}

      {evento.personalizacion.textoBienvenida ? (
        <p className="pt-2 text-sm leading-relaxed text-texto">
          {evento.personalizacion.textoBienvenida}
        </p>
      ) : null}

      {evento.agotado ? (
        <div className="rounded-lg border border-borde bg-superficie p-4 text-sm text-texto">
          <p className="font-semibold">Se agotaron los lugares</p>
          <p className="mt-1 text-texto-suave">
            Si queda algún lugar, se suele liberar en el momento. Probá de nuevo más tarde.
          </p>
        </div>
      ) : evento.lugaresRestantes <= 20 ? (
        <p className="rounded-lg border border-borde bg-superficie p-3 text-sm font-semibold text-texto">
          Últimos {evento.lugaresRestantes} lugares
        </p>
      ) : null}
    </header>
  )
}

/** Devuelve la fecha máxima permitida para nacer (hoy - 18 años) en formato YYYY-MM-DD. */
function fechaMaximaNacimiento(): string {
  const hoy = new Date()
  const hace18 = new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate())
  const yyyy = hace18.getFullYear()
  const mm = String(hace18.getMonth() + 1).padStart(2, '0')
  const dd = String(hace18.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function Formulario({
  evento,
  problemas,
  enviando,
  errorEnvio,
  onEnviar,
}: {
  evento: EventoPublico
  problemas: ProblemasDelFormulario
  enviando: boolean
  errorEnvio: string | null
  onEnviar: (datos: Record<string, string>) => void
}) {
  if (evento.agotado) return null

  function mandar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (enviando) return
    const datos = new FormData(e.currentTarget)
    onEnviar({
      eventoId: evento.eventoId,
      nombre: String(datos.get('nombre') ?? ''),
      email: String(datos.get('email') ?? ''),
      telefono: String(datos.get('telefono') ?? ''),
      dni: String(datos.get('dni') ?? ''),
      fechaNacimiento: String(datos.get('fechaNacimiento') ?? ''),
      sitioWeb: String(datos.get('sitioWeb') ?? ''),
    })
  }

  return (
    <form onSubmit={mandar} className="space-y-4">
      {errorEnvio ? (
        <p role="alert" className="rounded-lg border border-borde bg-superficie p-3 text-sm text-texto">
          {errorEnvio}
        </p>
      ) : null}

      <Campo nombre="nombre" etiqueta="Tu nombre" problemas={problemas}>
        <input
          id="nombre"
          name="nombre"
          type="text"
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          enterKeyHint="next"
          className={claseInput(problemas.nombre)}
        />
      </Campo>

      <Campo nombre="email" etiqueta="Tu correo" problemas={problemas}>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          inputMode="email"
          enterKeyHint="next"
          className={claseInput(problemas.email)}
        />
      </Campo>

      <Campo nombre="telefono" etiqueta="Tu teléfono (opcional)" problemas={problemas}>
        <input
          id="telefono"
          name="telefono"
          type="tel"
          maxLength={32}
          autoComplete="tel"
          inputMode="tel"
          className={claseInput(problemas.telefono)}
        />
      </Campo>

      <Campo nombre="dni" etiqueta="Tu DNI (sin puntos ni guiones)" problemas={problemas}>
        <input
          id="dni"
          name="dni"
          type="text"
          required
          pattern="[0-9]{7,8}"
          maxLength={8}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          className={claseInput(problemas.dni)}
          placeholder="12345678"
        />
      </Campo>

      <Campo nombre="fechaNacimiento" etiqueta="Fecha de nacimiento" problemas={problemas}>
        <input
          id="fechaNacimiento"
          name="fechaNacimiento"
          type="date"
          required
          max={fechaMaximaNacimiento()}
          className={claseInput(problemas.fechaNacimiento)}
        />
      </Campo>

      {/* La trampa. Hidden a la vista, presente en el DOM: los bots que
          completan forms recorren los inputs y lo llenan. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="sitioWeb">No completar</label>
        <input id="sitioWeb" name="sitioWeb" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {evento.requierePago && evento.precioEntrada ? (
        <p className="rounded-lg border border-borde bg-superficie p-3 text-sm text-texto">
          La entrada cuesta ${evento.precioEntrada.toFixed(0)}. Te vamos a mandar el link de pago
          por correo.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-lg bg-primario px-4 py-3 text-sm font-semibold text-sobre-primario disabled:opacity-60"
      >
        {enviando ? 'Reservando…' : 'Reservar mi lugar'}
      </button>

      <p className="text-center text-xs text-texto-suave">
        Te mandamos el código por correo. Guardalo: es tu entrada.
      </p>
    </form>
  )
}

/** La pantalla de "listo". No muestra el token, no muestra el email. */
function Confirmacion({ evento }: { evento: EventoPublico }) {
  return (
    <>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primario text-2xl text-sobre-primario">
        ✓
      </div>
      <h1 className="text-xl font-bold text-texto">¡Listo, tu lugar está reservado!</h1>
      <p className="text-sm leading-relaxed text-texto-suave">
        Te mandamos el código de entrada a tu correo. Abrilo, y si no te llega, revisá la carpeta de
        spam antes de volver a reservar: registrarte dos veces gasta dos lugares.
      </p>
      {evento.personalizacion.textoConfirmacion ? (
        <p className="rounded-lg border border-borde bg-superficie p-3 text-sm text-texto">
          {evento.personalizacion.textoConfirmacion}
        </p>
      ) : null}
    </>
  )
}

/** Un campo con su error, si hay. */
function Campo({
  nombre,
  etiqueta,
  problemas,
  children,
}: {
  nombre: string
  etiqueta: string
  problemas: ProblemasDelFormulario
  children: React.ReactNode
}) {
  const error = problemas[nombre]
  return (
    <div>
      <label htmlFor={nombre} className="mb-1 block text-sm font-medium text-texto">
        {etiqueta}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-texto-suave">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function claseInput(error?: string): string {
  return (
    'w-full rounded-lg border bg-superficie px-3 py-2.5 text-base text-texto ' +
    'focus:outline-none focus-visible:outline-2 ' +
    (error ? 'border-texto-suave' : 'border-borde')
  )
}
