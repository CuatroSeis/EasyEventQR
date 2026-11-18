import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import TemaToggle from '../components/TemaToggle'
import { useIdioma, IdiomaToggle } from '../components/IdiomaContext'
import { useReducedMotion } from '../../shared/useReducedMotion'

export default function Home() {
  const { t } = useIdioma()
  const [query, setQuery] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<EventoResultado[]>([])
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  )
  const abortControllerRef = useRef<AbortController | null>(null)
  const reducedMotion = useReducedMotion()

  const bloquesConfianza = [
    { n: 1, clave: 'home.confianza.1t', desc: 'home.confianza.1d' },
    { n: 2, clave: 'home.confianza.2t', desc: 'home.confianza.2d' },
    { n: 3, clave: 'home.confianza.3t', desc: 'home.confianza.3d' },
    { n: 4, clave: 'home.confianza.4t', desc: 'home.confianza.4d' },
  ] as const

  async function copiarCodigo(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(codigo)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      // Clipboard no disponible; se ignora silenciosamente.
    }
  }

  useEffect(() => {
    const enLinea = () => setOffline(false)
    const sinLinea = () => setOffline(true)
    if (typeof window !== 'undefined') {
      window.addEventListener('online', enLinea)
      window.addEventListener('offline', sinLinea)
      return () => {
        window.removeEventListener('online', enLinea)
        window.removeEventListener('offline', sinLinea)
      }
    }
  }, [])

  function normalizarParaBusqueda(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  }

  /** Fecha con año completo para tarjetas tipo entrada. */
  function fechaConAnio(iso: string): string {
    return new Intl.DateTimeFormat('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!navigator.onLine) {
      setOffline(true)
      setError(t('home.buscar.red'))
      setBuscando(false)
      return
    }
    const q = normalizarParaBusqueda(query)
    if (!q) return

    // Abortar búsqueda previa si existe (cancel durante búsqueda en vuelo).
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setBuscando(true)
    setError(null)
    setResultados([])

    try {
      const resp = await fetch(`/api/eventos/buscar?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
      const data = await resp.json()
      if (!resp.ok) {
        // Error de red o de servidor HTTP (4xx/5xx).
        setError(data.error || t('home.buscar.errorServidor'))
        return
      }
      if (!data.ok) {
        // Respuesta HTTP OK pero la API indica fallo lógico.
        setError(data.error || t('home.buscar.errorServidor'))
        return
      }
      if (data.eventos && data.eventos.length > 0) {
        setResultados(data.eventos)
      } else {
        setError(t('home.buscar.no'))
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return // Cancelación intencional: no mostrar error al usuario.
      }
      setError(t('home.buscar.red'))
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      setBuscando(false)
    }
  }

  // Un solo resultado exacto no redirige: el usuario elige de la lista.

  return (
    <main className="ee-fondo mx-auto flex min-h-dvh max-w-2xl flex-col gap-12 p-4 pb-12 relative isolation">
      <span className="ee-glow" aria-hidden="true" />
      <a
        href="#buscar"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primario focus:text-sobre-primario focus:rounded-lg focus:outline-none"
      >
        Saltar a buscar
      </a>
      {/* Hero: qué es, para quién, qué hacer. */}
      <header className="text-center relative pt-12 pb-20">
        {/* Patrón QR sutil de fondo para identidad visual de marca */}
        <div className="absolute inset-0 -z-10 opacity-4 pointer-events-none">
          <svg
            className="w-full h-full text-secundario"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <rect width="100" height="100" fill="currentColor" opacity="0.06" />
            <rect x="10" y="10" width="8" height="8" fill="currentColor" opacity="0.1" />
            <rect x="82" y="10" width="8" height="8" fill="currentColor" opacity="0.1" />
            <rect x="10" y="82" width="8" height="8" fill="currentColor" opacity="0.1" />
            <rect x="82" y="82" width="8" height="8" fill="currentColor" opacity="0.1" />
            <rect x="40" y="40" width="2" height="2" fill="currentColor" opacity="0.15" />
            <rect x="48" y="40" width="2" height="2" fill="currentColor" opacity="0.15" />
            <rect x="44" y="44" width="2" height="2" fill="currentColor" opacity="0.15" />
          </svg>
        </div>
        <p className="mx-auto inline-flex items-center rounded-full bg-primario/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primario ee-sans">
          {t('app.tagline')}
        </p>
        <h1 className="mt-4 text-6xl font-bold leading-tight tracking-tighter text-texto sm:text-7xl font-display">
          EasyEventQR
        </h1>
        <p className="mx-auto mt-4 max-w-[42ch] text-xl text-texto ee-sans ee-medida leading-relaxed">
          {t('home.hero.bajada')}
        </p>
        {/* Mockup de entrada con QR real dentro. */}
        <div className="mx-auto mt-8 flex items-center justify-center">
          <div className="ee-ticket w-full max-w-md sm:max-w-lg">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-primario" />
              <span className="text-xs font-semibold text-ee-texto-suave ee-sans">Entrada · EasyEventQR</span>
            </div>
            <div className="mb-3">
              <p className="text-xs font-medium text-ee-texto-suave ee-sans uppercase tracking-wider">Evento</p>
              <p className="text-base font-semibold text-texto ee-sans">{t('home.hero.titulo')}</p>
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <p className="text-xs font-medium text-ee-texto-suave ee-sans uppercase tracking-wider">Código</p>
                <div className="mt-1 flex items-center gap-1 px-2 py-1.5 rounded border border-ee-borde bg-ee-superficie">
                  <span className="text-xs font-mono text-primario">FEST-8K2P</span>
                </div>
              </div>
              <div className="shrink-0 relative">
                <div className="absolute inset-0 bg-ee-acento/20 rounded blur-xl" />
                <img
                  src="/qr-logo.svg"
                  alt="QR de entrada"
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded relative z-10 border border-ee-borde/50 bg-white/10"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            className="ee-boton-primario ee-foco ee-sans min-h-[56px] w-full sm:w-auto flex-1 items-center justify-center rounded-xl px-6 py-3 text-lg font-semibold text-sobre-primario"
          >
            {t('home.hero.buscar')}
          </button>
          <Link
            to="/entrar"
            className="ee-boton-secundario ee-foco ee-sans min-h-[56px] shrink-0 items-center justify-center rounded-xl px-6 py-3 text-sm font-medium"
          >
            {t('home.hero.crear')}
          </Link>
        </div>
      </header>

      {/* Buscar: acción principal del visitante. */}
      <section id="buscar" aria-labelledby="invitado-heading" className="ee-seccion ee-textura scroll-mt-4 space-y-6">
        <div className="max-w-md mx-auto">
          <h2 id="invitado-heading" className="ee-titulo-seccion text-center text-texto">
            {t('home.buscar.titulo')}
          </h2>
          <p className="ee-subtitulo-seccion text-center text-ee-texto-suave">
            {t('home.buscar.subtitulo')}
          </p>

          <div className="ee-tarjeta-premium p-6 mt-4">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <label htmlFor="buscar" className="text-sm font-semibold text-texto ee-sans block mb-2">
                Buscar evento por código o nombre
              </label>
              <div className="relative">
                <input
                  id="buscar"
                  type="search"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder={t('home.buscar.ph')}
                  className="w-full min-h-[56px] rounded-xl border border-ee-borde bg-ee-superficie px-4 py-3 text-base text-texto placeholder:text-ee-texto-suave focus:outline-none focus-visible:outline-2 focus-visible:outline-ee-acento"
                  disabled={buscando}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={
                  error
                    ? 'buscar-error'
                    : touched && !buscando && !query.trim()
                    ? 'buscar-hint'
                    : undefined
                }
              />
              {touched && !buscando && !query.trim() && (
                <p id="buscar-hint" className="text-center text-xs text-ee-texto-suave mt-1">
                  {t('home.buscar.hintVacio')}
                </p>
              )}
              {buscando && (
                <>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
                    <span
                      className={`inline-block rounded-full h-3 w-3 bg-ee-acento ${!reducedMotion ? 'animate-ping' : ''}`}
                    />
                  </span>
                  <span className="sr-only" aria-live="polite">
                    {t('home.buscar.buscando')}
                  </span>
                </>
              )}
            </div>
            <button
              type="submit"
              disabled={buscando || !query.trim() || offline}
              className="ee-boton-primario ee-foco ee-sans w-full min-h-[56px] rounded-xl px-6 py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {buscando ? t('home.buscar.buscando') : t('home.buscar.boton')}
            </button>
          </form>
          </div>
        </div>

        {error && (
          <>
            <p id="buscar-error" role="alert" className="text-center text-sm text-error">
              {error}
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setResultados([])
                  document.getElementById('buscar')?.focus()
                }}
                className="ee-boton-secundario ee-foco ee-sans min-h-[56px] shrink-0 px-6 py-3 text-sm font-medium"
              >
                {t('comun.reintentar')}
              </button>
              {error === t('home.buscar.no') && (
                <>
                  <a
                    href="#buscar"
                    className="ee-boton-secundario ee-foco ee-sans min-h-[56px] shrink-0 px-6 py-3 text-sm font-medium"
                  >
                    {t('home.buscar.buscarNombre')}
                  </a>
                  <Link
                    to="/entrar"
                    className="ee-boton-secundario ee-foco ee-sans min-h-[56px] shrink-0 px-6 py-3 text-sm font-medium border-2 border-ee-acento"
                  >
                    {t('home.buscar.crearOrg')}
                  </Link>
                </>
              )}
              {error === t('home.buscar.red') && (
                <p className="text-center text-xs text-ee-texto-suave ee-sans mt-2 sm:mt-0">
                  {t('home.buscar.noCodigo')} — {t('home.buscar.contactoOrg')}
                </p>
              )}
            </div>
          </>
        )}

        {resultados.length > 0 && (
          <>
            <p className="text-center text-sm font-semibold text-texto ee-sans">
              {resultados.length} evento{resultados.length !== 1 ? 's' : ''} encontrado{resultados.length !== 1 ? 's' : ''}
            </p>
            <ul role="list" className="space-y-3 max-w-md mx-auto">
              {resultados.map((evt) => (
              <li key={evt.codigoCorto}>
                <Link
                  to={`/e/${evt.codigoCorto}`}
                  className="block ee-tarjeta-premium p-5 relative group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-texto ee-sans">{evt.nombre}</h3>
                      <p className="text-sm text-ee-texto-suave ee-sans">{evt.lugar} · {fechaConAnio(evt.fecha)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => copiarCodigo(evt.codigoCorto)}
                        aria-label={`Copiar código ${evt.codigoCorto}`}
                        className="shrink-0 flex items-center gap-1 font-mono text-xs text-primario bg-primario/10 px-2 py-1 rounded hover:bg-primario/20 transition"
                      >
                        {copiado === evt.codigoCorto ? (
                          <span className="text-primario font-bold text-[10px]">✓</span>
                        ) : (
                          evt.codigoCorto
                        )}
                        <svg
                          className="shrink-0 w-3 h-3 text-secundario mt-1"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          </>
        )}

        <p className="text-center text-xs text-ee-texto-suave ee-sans">
          {t('home.buscar.ayuda')} <code className="font-mono">FEST-8K2P</code>.
        </p>
      </section>

      <section aria-labelledby="como-funciona" className="ee-seccion ee-textura space-y-6">
        <div className="max-w-2xl mx-auto">
          <h2 id="como-funciona" className="ee-titulo-seccion text-center text-texto">
            {t('home.como.titulo')}
          </h2>
          <p className="ee-subtitulo-seccion text-center text-ee-texto-suave">
            Tres pasos sencillos para crear tu evento y validar entradas con QR.
          </p>
        </div>
        <ol role="list" className="max-w-2xl mx-auto relative">
          {/* Línea conectora vertical entre pasos (desktop). */}
          <span
            className="absolute left-1/2 top-8 bottom-8 w-[1px] -translate-x-1/2 bg-ee-borde-claro hidden sm:block"
            aria-hidden="true"
          />
          {[
            { n: '1', t: t('home.como.1t'), d: t('home.como.1d') },
            { n: '2', t: t('home.como.2t'), d: t('home.como.2d') },
            { n: '3', t: t('home.como.3t'), d: t('home.como.3d') },
          ].map((p) => (
            <li key={p.n} className="relative flex flex-col sm:flex-row items-start gap-6">
              <span className="ee-conector ee-paso-numero shrink-0 z-10">{p.n}</span>
              <div className="ee-tarjeta-paso flex-1">
                <h3 className="mt-0 font-bold text-texto ee-sans">{p.t}</h3>
                <p className="mt-1 text-sm text-ee-texto-suave ee-sans leading-relaxed ee-medida">
                  {p.d}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Dos públicos. */}
      <section aria-labelledby="para-quien" className="ee-seccion ee-textura grid gap-4 sm:grid-cols-2">
        <div className="sr-only" id="para-quien">Para quién es</div>
        <div className="ee-tarjeta-premium p-6">
          <h3 className="mt-0 font-bold text-texto ee-sans">{t('home.quien.org.t')}</h3>
          <p className="mt-1 text-sm text-ee-texto-suave ee-sans leading-relaxed">
            {t('home.quien.org.d')}
          </p>
          <Link to="/entrar" className="mt-5 inline-block text-sm font-semibold text-ee-acento ee-sans">
            {t('home.quien.org.link')}
          </Link>
        </div>
        <div className="ee-tarjeta-premium p-6">
          <h3 className="mt-0 font-bold text-texto ee-sans">{t('home.quien.inv.t')}</h3>
          <p className="mt-1 text-sm text-ee-texto-suave ee-sans leading-relaxed">
            {t('home.quien.inv.d')}
          </p>
          <a href="#buscar" className="mt-5 inline-block text-sm font-semibold text-ee-acento ee-sans">
            {t('home.quien.inv.link')}
          </a>
        </div>
      </section>

      {copiado && (
        <p className={`text-center text-xs text-ee-texto-suave ee-sans mt-2 ${!reducedMotion ? 'animate-ping' : ''}`}>
          {t('home.copiado.toast', { codigo: copiado })}
        </p>
      )}

      {/* Confianza: qué recibe el visitante y por qué funciona en la puerta. */}
      <section aria-labelledby="confianza-heading" className="ee-seccion ee-textura space-y-6">
        <div className="max-w-3xl mx-auto">
          <h2 id="confianza-heading" className="ee-titulo-seccion text-center text-texto sm:text-3xl">
            {t('home.confianza.titulo')}
          </h2>
          <p className="ee-subtitulo-seccion text-center text-ee-texto-suave">
            Cada entrada con QR es única, personal y válida una sola vez.
          </p>
        </div>
        <ul className="space-y-6 max-w-3xl mx-auto text-texto leading-relaxed ee-sans">
          {bloquesConfianza.map(({ clave, desc }) => (
            <li key={clave} className="ee-tarjeta-premium p-5">
              <p className="font-bold text-texto">{t(clave)}</p>
              <p className="mt-1 text-sm text-ee-texto-suave">{t(desc)}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-auto pt-12 pb-8 border-t border-ee-borde-claro ee-textura">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-ee-texto-suave ee-sans">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <p className="leading-none">{t('home.pie')}</p>
            <p className="text-xs font-medium text-texto leading-none">·</p>
            <p className="text-xs font-medium text-texto leading-none">Entrá directo con tu código</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-ee-borde-claro text-xs font-semibold ee-borde-activo">
              <IdiomaToggle />
              <TemaToggle />
            </div>
          </div>
        </div>
        <nav className="mt-4 sm:mt-0 flex flex-col sm:flex-row sm:flex-nowrap gap-2 sm:gap-4 text-xs text-ee-texto-suave sm:ml-auto ee-sans">
          <Link
            to="/entrar"
            className="hover:text-ee-acento transition"
          >
            {t('home.pie.link.crear')}
          </Link>
          <a href="#buscar" className="hover:text-ee-acento transition">
            {t('home.pie.link.buscar')}
          </a>
        </nav>
      </footer>
    </main>
  )
}

interface EventoResultado {
  codigoCorto: string
  nombre: string
  fecha: string
  lugar: string
}