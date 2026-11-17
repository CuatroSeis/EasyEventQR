import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import TemaToggle from '../components/TemaToggle'
import { useIdioma, IdiomaToggle } from '../components/IdiomaContext'
import { formatoFecha } from '../../shared/fecha'

export default function Home() {
  const { t } = useIdioma()
  const [query, setQuery] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<EventoResultado[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sugeridos, setSugeridos] = useState<Array<{ codigoCorto: string; nombre: string; fecha: string; lugar: string }> | null>(null)
  const [sugeridosError, setSugeridosError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

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
    let cancelado = false
    async function cargarSugeridos() {
      try {
        const resp = await fetch('/api/eventos/destacados?limit=3')
        if (!resp.ok) throw new Error('No se pudieron cargar los eventos sugeridos')
        const data = await resp.json()
        if (!cancelado && data.ok) {
          setSugeridos(data.eventos)
        }
      } catch {
        if (!cancelado) setSugeridosError('No se pudieron cargar los eventos sugeridos')
      }
    }
    cargarSugeridos()
    return () => { cancelado = true }
  }, [])

  function normalizarParaBusqueda(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 p-4 pb-12">
      {/* Hero: qué es, para quién, qué hacer. */}
      <header className="text-center">
        <p className="inline-flex items-center rounded-full bg-primario/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primario">
          {t('app.tagline')}
        </p>
        <h1 className="mt-3 text-5xl font-bold leading-none tracking-wide text-texto sm:text-6xl font-display">
          EasyEventQR
        </h1>
        <p className="mx-auto mt-3 max-w-md text-lg text-texto-suave">
          {t('home.hero.bajada')}
        </p>
        {/* Visual de producto: código QR de entrada, sin decoración gratuita. */}
        <div className="mx-auto mt-6 flex items-center justify-center">
          <div className="relative inline-block p-2 bg-primario/10 rounded-2xl border border-borde/30 shadow-sm">
            <svg
              className="w-20 h-20 sm:w-24 sm:h-24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="20" height="20" rx="2" />
              <rect x="4" y="4" width="6" height="6" />
              <rect x="14" y="4" width="6" height="6" />
              <rect x="4" y="14" width="6" height="6" />
              <rect x="9" y="10" width="2" height="2" />
              <rect x="13" y="10" width="2" height="2" />
              <rect x="11" y="12" width="2" height="2" />
              <rect x="9" y="14" width="2" height="2" />
              <rect x="13" y="14" width="2" height="2" />
            </svg>
            <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primario text-[10px] font-bold text-sobre-primario shadow-sm">
              QR
            </span>
          </div>
        </div>
        <div className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row">
          <a
            href="#buscar"
            className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-xl bg-primario px-6 py-3 text-lg font-semibold text-sobre-primario transition hover:brightness-110"
          >
            {t('home.hero.codigo')}
          </a>
          <Link
            to="/entrar"
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-borde px-4 py-2.5 text-base font-medium text-texto-suave transition hover:bg-superficie/50"
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
              autoComplete="off"
              autoFocus
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
                  <span className="inline-block animate-ping rounded-full h-3 w-3 bg-primario" />
                </span>
                <span className="sr-only" aria-live="polite">
                  {t('home.buscar.buscando')}
                </span>
              </>
            )}
          </div>
          <button
            type="submit"
            disabled={buscando || !query.trim()}
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
                  className="block rounded-xl border border-borde bg-superficie p-4 hover:bg-superficie/50 transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-texto">{evt.nombre}</h3>
                      <p className="text-sm text-texto-suave">{evt.lugar} · {formatoFecha(evt.fecha)}</p>
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
                          className="shrink-0 w-3 h-3 text-texto-suave mt-1"
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

      {/* Eventos sugeridos: reconocimiento sobre recuerdo para quien no tiene el código a mano. */}
      <section aria-labelledby="sugeridos-heading" className="space-y-4">
        <h2 id="sugeridos-heading" className="text-center text-xl font-bold text-texto font-display">
          {t('home.buscar.sugeridos.titulo')}
        </h2>
        {sugeridos === null && (
          <p className="text-center text-xs text-texto-suave">Cargando eventos sugeridos…</p>
        )}
        {sugeridosError && (
          <>
            <p className="text-center text-xs text-error">{sugeridosError}</p>
            <button
              type="button"
              onClick={() => {
                setSugeridosError(null)
                setSugeridos(null)
              }}
              className="text-xs text-primario underline underline-offset-4 hover:text-primario/70 transition"
            >
              {t('home.sugeridos.reintentar')}
            </button>
          </>
        )}
        {sugeridos && sugeridos.length > 0 && (
          <ul role="list" className="grid gap-3 sm:grid-cols-3">
            {sugeridos.map((evt) => (
              <li key={evt.codigoCorto} className="rounded-xl border border-borde bg-superficie p-4">
                <Link
                  to={`/e/${evt.codigoCorto}`}
                  className="block flex flex-col gap-2 hover:bg-superficie/50 transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-texto">{evt.nombre}</h3>
                      <p className="text-sm text-texto-suave">{evt.lugar} · {formatoFecha(evt.fecha)}</p>
                    </div>
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
                        className="shrink-0 w-3 h-3 text-texto-suave mt-1"
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
                </Link>
              </li>
            ))}
          </ul>
        )}
        {sugeridos && sugeridos.length === 0 && (
          <p className="text-center text-xs text-texto-suave">
            No hay eventos destacados todavía. Buscá el tuyo por código o nombre arriba.
          </p>
        )}
      </section>

      {/* {t('home.como.titulo')}: 3 pasos. */}
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
            <li key={p.n} className="rounded-xl border border-borde bg-superficie p-4">
              <p aria-hidden="true" className="text-2xl font-bold text-primario">{p.n}</p>
              <h3 className="mt-1 font-semibold text-texto">{p.t}</h3>
              <p className="mt-1 text-sm text-texto-suave">{p.d}</p>
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
        <p className="text-center text-xs text-texto-suave mt-2 animate-ping">
          Código {copiado} copiado
        </p>
      )}

      <footer className="mt-auto pt-8 border-t border-borde">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-texto-suave">
          <p>{t('home.pie')}</p>
          <p className="text-xs font-medium text-texto">Entrá directo con tu código</p>
          <div className="flex items-center gap-3">
            <IdiomaToggle />
            <TemaToggle />
          </div>
          <nav className="flex gap-4 sm:gap-6">
            <Link
              to="/entrar"
              className="hover:text-primario transition"
            >
              {t('home.pie.link.crear')}
            </Link>
            <a href="#buscar" className="hover:text-primario transition">
              {t('home.pie.link.buscar')}
            </a>
            <a href="mailto:ivanrufinocontac@gmail.com" className="hover:text-primario transition">
              {t('home.pie.link.contacto')}
            </a>
          </nav>
        </div>
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