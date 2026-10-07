import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'

import { aplicarTema, resolverColores } from '../../shared/theming'
import { useIdioma } from '../components/IdiomaContext'
import type { ClaveTexto } from '../../shared/i18n'
import { crearPreferenciaPago, abrirCheckoutMP } from '../../services/pagos'

/** Landing pública /e/:eventoId. Sin SDK de Firebase (bundle chico y las reglas no dejan leer sin sesión): todo sale de /api. El cleanup del tema con `aplicarTema(null)` evita que el color de un evento se pegue al siguiente. */

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

  // El "cargando" se deriva del id (no setState en el efecto): si no, al
  // navegar entre eventos se ve el anterior hasta que llega el nuevo.
  const [carga, setCarga] = useState<Carga>(null)
  const currentId = identificador ?? ''
  const [problemas, setProblemas] = useState<ProblemasDelFormulario>({})
  const [enviando, setEnviando] = useState(false)
  const [reservado, setReservado] = useState(false)
  const [mostrandoForm, setMostrandoForm] = useState(false)
  const { t } = useIdioma()

  function irAlFormulario() {
    setMostrandoForm(true)
    // El form recién se monta: esperar un tick antes de scrollear.
    // Con `prefers-reduced-motion` el salto es instantáneo.
    window.setTimeout(() => {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      document.getElementById('form-registro')?.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
    }, 60)
  }
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  // Antes de los efectos (los hooks no van después de un return).
  const evento =
    carga !== null && carga.id === currentId && carga.estado === 'listo' ? carga.evento : null
  const fallo = carga !== null && carga.id === currentId && carga.estado === 'error'

  useEffect(() => {
    if (!identificador) return

    let vigente = true

    fetch(`/api/evento-publico?id=${encodeURIComponent(identificador)}`)
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => null)
        // Si navegó a otro evento mientras tanto, esta respuesta ya no es de nadie.
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

  // <title> por evento: se comparte por WhatsApp con link.
  useEffect(() => {
    if (!evento) return
    const anterior = document.title
    document.title = `${evento.nombre} · EasyEventQR`
    return () => {
      document.title = anterior
    }
  }, [evento])

  // Sin-datos primero (narrowing sin casts); "reservado" después para que
  // sobreviva a un reload.
  if (fallo) return <Marco><NoDisponible t={t} /></Marco>
  if (!evento) return <Marco><Cargando t={t} /></Marco>

  if (reservado) {
    return (
      <Marco evento={evento}>
        <div className="space-y-4 text-center">
          <Confirmacion evento={evento} t={t} />
        </div>
      </Marco>
    )
  }

  return (
    <Marco evento={evento}>
      <div className="space-y-8">
        <Encabezado evento={evento} t={t} />

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
                <p className="text-sm font-semibold text-texto">{t('pub.org.por')} {evento.organizador.nombre}</p>
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
          <div className="flex items-baseline gap-2 rounded-xl border border-borde bg-superficie p-4">
            <p className="text-3xl font-bold text-texto">
              ${evento.precioEntrada.toLocaleString('es-AR')}
            </p>
            <p className="text-sm text-texto-suave">{t('pub.precio.entrada')}</p>
          </div>
        ) : (
          <p className="inline-flex items-center rounded-full border border-borde bg-superficie px-3 py-1 text-xs font-bold uppercase tracking-wide text-texto">
            {t('pub.gratis')}
          </p>
        )}

        {!mostrandoForm && !evento.agotado ? (
          <button
            type="button"
            onClick={irAlFormulario}
            className="hidden min-h-[56px] w-full cursor-pointer rounded-xl bg-primario px-6 py-3 text-lg font-semibold text-sobre-primario transition-colors duration-200 hover:brightness-110 sm:block"
          >
            {t('pub.cta')}
          </button>
        ) : null}

        {mostrandoForm ? (
        <div id="form-registro" className="scroll-mt-4">
        <Formulario
          evento={evento}
          t={t}
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

              const requierePago = evento.requierePago && evento.precioEntrada
              const registroId = cuerpo.registroId // El backend debería devolver esto

              if (requierePago && registroId) {
                const pref = await crearPreferenciaPago(registroId)
                if (pref.ok && pref.init_point) {
                  abrirCheckoutMP(pref.init_point)
                  return
                }
                setErrorEnvio(t('pub.error.pago'))
                setEnviando(false)
                return
              }

              setReservado(true)
            } catch {
              setErrorEnvio(t('pub.error.red'))
              setEnviando(false)
            }
          }}
        />
        </div>
        ) : null}
        {/* Barra de CTA fija en mobile: el botón siempre al alcance del pulgar. */}
        {!mostrandoForm && !evento.agotado ? (
          <>
            <div aria-hidden="true" className="h-20 sm:hidden" />
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie/95 px-4 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur sm:hidden">
              <button
                type="button"
                onClick={irAlFormulario}
                className="min-h-[56px] w-full cursor-pointer rounded-xl bg-primario px-6 py-3 text-lg font-semibold text-sobre-primario transition-colors duration-200 hover:brightness-110"
              >
                {t('pub.cta')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Marco>
  )
}

/** El marco: banner, logo, y el ancho de lectura en el centro. */
function Marco({ evento, children }: { evento?: EventoPublico; children: React.ReactNode }) {
  const p = evento?.personalizacion
  return (
    <main className="min-h-dvh bg-superficie" style={{ fontFamily: "'Source Sans 3', system-ui, sans-serif" }}>
      {p?.bannerUrl ? (
        <div className="relative">
          <img
            src={p.bannerUrl}
            alt=""
            className="h-56 w-full object-cover sm:h-72"
            // Imagen rota = se esconde, queda el degradado.
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(to top, var(--c-superficie) 4%, transparent 55%)' }}
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="h-24 w-full sm:h-32"
          style={{ background: 'linear-gradient(135deg, var(--c-primario), var(--c-secundario))' }}
        />
      )}

      <div className="mx-auto -mt-10 max-w-lg px-4 pb-8 sm:py-12 sm:pt-0">
        {p?.logoUrl ? (
          <img
            src={p.logoUrl}
            alt=""
            className="mb-6 h-12 w-auto rounded-lg bg-white/80 p-1"
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

function Cargando({ t }: { t: Texto }) {
  return <p className="py-16 text-center text-sm text-texto-suave">{t('pub.cargando')}</p>
}

function NoDisponible({ t }: { t: Texto }) {
  return (
    <div className="space-y-3 py-16 text-center">
      <h1 className="text-lg font-semibold text-texto">{t('pub.noexiste.t')}</h1>
      <p className="text-sm text-texto-suave">{t('pub.noexiste.d')}</p>
    </div>
  )
}

/** Texto corto de cuenta regresiva. */
function cuentaRegresiva(iso: string, t: Texto): string | null {
  const ms = new Date(iso).getTime() - Date.now()
  if (Number.isNaN(ms) || ms <= 0) return null
  const dias = Math.floor(ms / 86_400_000)
  if (dias >= 2) return t('pub.cd.dias', { n: dias })
  if (dias === 1) return t('pub.cd.manana')
  const horas = Math.floor(ms / 3_600_000)
  if (horas >= 1) return t('pub.cd.hoy', { n: horas })
  return t('pub.cd.minutos')
}

function Encabezado({ evento, t }: { evento: EventoPublico; t: Texto }) {
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
    <header className="space-y-4">
      {cuentaRegresiva(evento.fecha, t) ? (
        <p className="inline-flex items-center rounded-full bg-primario px-3 py-1 text-xs font-bold uppercase tracking-wide text-sobre-primario">
          {cuentaRegresiva(evento.fecha, t)}
        </p>
      ) : null}
      <h1
        className="text-4xl font-bold leading-none tracking-wide text-texto sm:text-5xl"
        style={{ fontFamily: "'Bebas Neue', 'Source Sans 3', system-ui, sans-serif" }}
      >
        {evento.nombre}
      </h1>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-texto-suave">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">{t('pub.f.fecha')}</dt>
          <dd className="font-semibold text-texto">{cuando}</dd>
        </div>
        {evento.lugar ? (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{t('pub.f.lugar')}</dt>
            <dd>{evento.lugar}</dd>
          </div>
        ) : null}
      </dl>

      {evento.personalizacion.textoBienvenida ? (
        <p className="pt-2 text-sm leading-relaxed text-texto">
          {evento.personalizacion.textoBienvenida}
        </p>
      ) : null}

      {evento.agotado ? (
        <div className="rounded-lg border border-borde bg-superficie p-4 text-sm text-texto">
          <p className="font-semibold">{t('pub.agotado.t')}</p>
          <p className="mt-1 text-texto-suave">{t('pub.agotado.d')}</p>
        </div>
      ) : evento.lugaresRestantes <= 20 ? (
        <p className="rounded-lg border border-borde bg-superficie p-3 text-sm font-semibold text-texto">
          {t('pub.ultimos', { n: evento.lugaresRestantes })}
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
  t,
}: {
  evento: EventoPublico
  problemas: ProblemasDelFormulario
  enviando: boolean
  errorEnvio: string | null
  onEnviar: (datos: Record<string, string>) => void
  t: Texto
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

      <Campo nombre="nombre" etiqueta={t('pub.form.nombre')} problemas={problemas}>
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

      <Campo nombre="email" etiqueta={t('pub.form.email')} problemas={problemas}>
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

      <Campo nombre="telefono" etiqueta={t('pub.form.tel')} problemas={problemas}>
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

      <Campo nombre="dni" etiqueta={t('pub.form.dni')} problemas={problemas}>
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

      <Campo nombre="fechaNacimiento" etiqueta={t('pub.form.nac')} problemas={problemas}>
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
        <label htmlFor="sitioWeb">{t('pub.form.trampa')}</label>
        <input id="sitioWeb" name="sitioWeb" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {evento.requierePago && evento.precioEntrada ? (
        <p className="rounded-lg border border-borde bg-superficie p-3 text-sm text-texto">
          {t('pub.form.pago', { monto: `$${evento.precioEntrada.toFixed(0)}` })}
        </p>
      ) : null}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg bg-primario px-4 py-3 text-sm font-semibold text-sobre-primario disabled:opacity-60"
        >
          {enviando ? t('pub.form.enviando') : t('pub.form.enviar')}
        </button>

        <p className="text-center text-xs text-texto-suave">{t('pub.form.aviso')}</p>
    </form>
  )
}

/** Función de texto compartida por las subsecciones de esta pantalla. */
type Texto = (clave: ClaveTexto, vars?: Record<string, string | number>) => string

/** La pantalla de "listo". No muestra el token, no muestra el email. */
function Confirmacion({ evento, t }: { evento: EventoPublico; t: Texto }) {
  return (
    <>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primario text-2xl text-sobre-primario">
        ✓
      </div>
      <h1 className="text-xl font-bold text-texto">{t('pub.ok.t')}</h1>
      <p className="text-sm leading-relaxed text-texto-suave">{t('pub.ok.d')}</p>
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
