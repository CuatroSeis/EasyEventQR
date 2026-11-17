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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-12 p-4 pb-12">
      <a
        href="#buscar"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primario focus:text-sobre-primario focus:rounded-lg focus:outline-none"
      >
        Saltar a buscar
      </a>
      {/* Hero: qué es, para quién, qué hacer. */}
      <header className="text-center relative">
        {/* Patrón QR sutil de fondo para identidad visual de marca */}
        <div className="absolute inset-0 -z-10 opacity-5 pointer-events-none">
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
        <p className="inline-flex items-center rounded-full bg-primario/20 px-3 py-1 text-sm font-bold uppercase tracking-wider text-primario">
          {t('app.tagline')}
        </p>
        <h1 className="mt-3 text-6xl font-bold leading-tight tracking-tighter text-texto sm:text-7xl font-display">
          EasyEventQR
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-xl text-texto">
          {t('home.hero.bajada')}
        </p>
        {/* QR real: escanearlo lleva a crear tu evento. */}
        <div className="mx-auto mt-6 flex items-center justify-center">
          <img
            src="/qr-logo.svg"
            alt="QR de EasyEventQR"
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl shadow-sm"
          />
        </div>
        <div className="mx-auto mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => document.getElementById('buscar')?.focus()}
            className="inline-flex min-h-[56px] w-full sm:w-auto flex-1 items-center justify-center rounded-xl bg-primario px-6 py-3 text-lg font-semibold text-sobre-primario shadow-sm transition hover:brightness-105 hover:shadow-md"
          >
            {t('home.hero.buscar')}
          </button>
          <Link
            to="/entrar"
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-xl border border-borde bg-superficie px-4 py-2.5 text-sm font-medium text-texto transition hover:bg-primario/5 hover:text-primario"
          >
            {t('home.hero.crear')}
          </Link>
        </div>
      </header>

      {/* Buscar: acción principal del visitante. */}
      <section id="buscar" aria-labelledby="invitado-heading" className="scroll-mt-4 space-y-4">
        <h2 id="invitado-heading" className="text-center text-xl font-bold text-texto font-display">
          {t('home.buscar.titulo')}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3 max-w-md mx-auto" noValidate>
          <label htmlFor="buscar" className="text-sm font-semibold text-texto">
            Buscar evento por código o nombre
          </label>
          <div className="relative">
            <input
              id="buscar"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={t('home.buscar.ph')}
              className="w-full min-h-[56px] rounded-xl border border-borde bg-superficie px-4 py-3 text-base text-texto placeholder:text-texto-suave focus:outline-none focus-visible:outline-2 focus-visible:outline-primario"
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
              <p id="buscar-hint" className="text-center text-xs text-texto-suave mt-1">
                {t('home.buscar.hintVacio')}
              </p>
            )}
            {buscando && (
              <>
                <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
                  <span
                    className={`inline-block rounded-full h-3 w-3 bg-primario ${!reducedMotion ? 'animate-ping' : ''}`}
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
            className="w-full min-h-[56px] rounded-xl bg-primario px-6 py-3 text-lg font-semibold text-sobre-primario disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {buscando ? t('home.buscar.buscando') : t('home.buscar.boton')}
          </button>
        </form>

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
                className="min-h-[56px] rounded-xl border border-borde bg-superficie px-6 py-3 text-sm font-semibold text-texto transition hover:bg-superficie/50"
              >
                {t('comun.reintentar')}
              </button>
              {error === t('home.buscar.no') && (
                <>
                  <a
                    href="#buscar"
                    className="min-h-[56px] rounded-xl border border-borde bg-superficie px-6 py-3 text-sm font-semibold text-texto transition hover:bg-superficie/50"
                  >
                    {t('home.buscar.buscarNombre')}
                  </a>
                  <Link
                    to="/entrar"
                    className="min-h-[56px] rounded-xl border-2 border-primario px-6 py-3 text-sm font-semibold text-primario transition hover:bg-primario/5"
                  >
                    {t('home.buscar.crearOrg')}
                  </Link>
                </>
              )}
              {error === t('home.buscar.red') && (
                <p className="text-center text-xs text-texto-suave mt-2 sm:mt-0">
                  {t('home.buscar.noCodigo')} — {t('home.buscar.contactoOrg')}
                </p>
              )}
            </div>
          </>
        )}

        {resultados.length > 0 && (
          <>
            <p className="text-center text-sm font-semibold text-texto">
              {resultados.length} evento{resultados.length !== 1 ? 's' : ''} encontrado{resultados.length !== 1 ? 's' : ''}
            </p>
            <ul role="list" className="space-y-2 max-w-md mx-auto">
              {resultados.map((evt) => (
              <li key={evt.codigoCorto}>
                <Link
                  to={`/e/${evt.codigoCorto}`}
                  className="block rounded-xl border border-borde bg-superficie p-5 hover:bg-superficie/70 transition shadow-sm hover:shadow-md relative group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-texto">{evt.nombre}</h3>
                      <p className="text-sm text-texto-suave">{evt.lugar} · {fechaConAnio(evt.fecha)}</p>
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

        <p className="text-center text-xs text-texto-suave">
          {t('home.buscar.ayuda')} <code className="font-mono">FEST-8K2P</code>.
        </p>
      </section>

      <section aria-labelledby="como-funciona" className="space-y-4">
        <h2 id="como-funciona" className="text-center text-xl font-bold text-texto font-display">
          {t('home.como.titulo')}
        </h2>
        <ol role="list" className="grid gap-3 sm:grid-cols-3">
          {[
            { n: '1', t: t('home.como.1t'), d: t('home.como.1d') },
            { n: '2', t: t('home.como.2t'), d: t('home.como.2d') },
            { n: '3', t: t('home.como.3t'), d: t('home.como.3d') },
          ].map((p) => (
            <li key={p.n} className="rounded-xl border border-borde bg-superficie p-5">
              <p aria-hidden="true" className="text-3xl font-black text-primario">{p.n}</p>
              <h3 className="mt-1 font-bold text-texto">{p.t}</h3>
              <p className="mt-1 text-base text-texto-suave">{p.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Dos públicos. */}
      <section aria-labelledby="para-quien" className="grid gap-3 sm:grid-cols-2">
        <h2 id="para-quien" className="sr-only">Para quién es</h2>
        <div className="rounded-xl border border-borde bg-superficie p-5">
          <h3 className="font-bold text-texto">{t('home.quien.org.t')}</h3>
          <p className="mt-1 text-sm text-texto-suave">
            {t('home.quien.org.d')}
          </p>
          <Link to="/entrar" className="mt-3 inline-block text-sm font-semibold text-primario">
            {t('home.quien.org.link')}
          </Link>
        </div>
        <div className="rounded-xl border border-borde bg-superficie p-5">
          <h3 className="font-bold text-texto">{t('home.quien.inv.t')}</h3>
          <p className="mt-1 text-sm text-texto-suave">
            {t('home.quien.inv.d')}
          </p>
          <a href="#buscar" className="mt-3 inline-block text-sm font-semibold text-primario">
            {t('home.quien.inv.link')}
          </a>
        </div>
      </section>

      {copiado && (
        <p className={`text-center text-xs text-texto-suave mt-2 ${!reducedMotion ? 'animate-ping' : ''}`}>
          {t('home.copiado.toast', { codigo: copiado })}
        </p>
      )}

      {/* Confianza: qué recibe el visitante y por qué funciona en la puerta. */}
      <section aria-labelledby="confianza-heading" className="space-y-6">
        <h2 id="confianza-heading" className="text-center text-2xl font-bold text-texto font-display sm:text-3xl">
          {t('home.confianza.titulo')}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bloquesConfianza.map(({ n, clave, desc }) => (
            <div key={n} className="rounded-xl border border-borde bg-superficie p-5 flex flex-col gap-2">
              <p className="text-3xl font-black text-primario">{n}</p>
              <h3 className="font-bold text-texto">{t(clave)}</h3>
              <p className="mt-1 text-sm text-texto-suave leading-relaxed">{t(desc)}</p>
            </div>
          ))}
        </dl>
      </section>

      <footer className="mt-auto pt-8 border-t border-borde">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-texto-suave">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <p className="leading-none">{t('home.pie')}</p>
            <p className="text-xs font-medium text-texto leading-none">·</p>
            <p className="text-xs font-medium text-texto leading-none">Entrá directo con tu código</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-borde text-xs font-semibold">
              <IdiomaToggle />
              <TemaToggle />
            </div>
          </div>
        </div>
        <nav className="mt-4 sm:mt-0 flex flex-col sm:flex-row sm:flex-nowrap gap-2 sm:gap-4 text-xs text-texto-suave sm:ml-auto">
          <Link
            to="/entrar"
            className="hover:text-primario transition"
          >
            {t('home.pie.link.crear')}
          </Link>
          <a href="#buscar" className="hover:text-primario transition">
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