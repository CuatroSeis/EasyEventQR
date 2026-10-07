import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import TemaToggle from '../components/TemaToggle'
import { useIdioma, IdiomaToggle } from '../components/IdiomaContext'

export default function Home() {
  const { t } = useIdioma()
  const [query, setQuery] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<EventoResultado[]>([])
  const [error, setError] = useState<string | null>(null)

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

    setBuscando(true)
    setError(null)
    setResultados([])

    try {
      const resp = await fetch(`/api/eventos/buscar?q=${encodeURIComponent(q)}`)
      const data = await resp.json()
      if (!resp.ok || !data.ok) {
        setError(data.error || 'Error buscando el evento')
        return
      }
      if (data.eventos && data.eventos.length > 0) {
        setResultados(data.eventos)
      } else {
        setError(t('home.buscar.no'))
      }
    } catch {
      setError(t('home.buscar.red'))
    } finally {
      setBuscando(false)
    }
  }

  // Un solo resultado exacto no redirige: el usuario elige de la lista.

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-10 p-4 pb-12">
      <div className="flex items-center justify-end gap-2 pt-2">
        <IdiomaToggle />
        <TemaToggle />
      </div>
      {/* Hero: qué es, para quién, qué hacer. */}
      <header className="text-center">
        <p className="inline-flex items-center rounded-full bg-primario/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primario">
          {t('app.tagline')}
        </p>
        <h1
          className="mt-3 text-5xl font-bold leading-none tracking-wide text-texto sm:text-6xl"
          style={{ fontFamily: "'Bebas Neue', 'Source Sans 3', system-ui, sans-serif" }}
        >
          EasyEventQR
        </h1>
        <p className="mx-auto mt-3 max-w-md text-lg text-texto-suave">
          {t('home.hero.bajada')}
        </p>
        <div className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row">
          <Link
            to="/entrar"
            className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-xl bg-primario px-6 py-3 text-lg font-semibold text-sobre-primario transition hover:brightness-110"
          >
            {t('home.hero.crear')}
          </Link>
          <a
            href="#buscar"
            className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-xl border-2 border-primario px-6 py-3 text-lg font-semibold text-primario transition hover:bg-primario/5"
          >
            {t('home.hero.codigo')}
          </a>
        </div>
      </header>

      {/* {t('home.como.titulo')}: 3 pasos. */}
      <section aria-labelledby="como-funciona" className="space-y-4">
        <h2 id="como-funciona" className="text-center text-xl font-bold text-texto">
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

      <section id="buscar" aria-labelledby="invitado-heading" className="scroll-mt-4 space-y-4">
        <h2 id="invitado-heading" className="text-center text-xl font-bold text-texto">
          {t('home.buscar.titulo')}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3 max-w-md mx-auto" noValidate>
          <label htmlFor="buscar" className="sr-only">
            Buscar evento por código o nombre
          </label>
          <div className="relative">
            <input
              id="buscar"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('home.buscar.ph')}
              className="w-full min-h-[56px] rounded-xl border border-borde bg-superficie px-4 py-3 text-base text-texto placeholder:text-texto-suave focus:outline-none focus-visible:outline-2 focus-visible:outline-primario"
              disabled={buscando}
              autoComplete="off"
              autoFocus
            />
            {buscando && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
                ⏳
              </span>
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
          <p role="alert" className="text-center text-sm text-red-600">
            {error}
          </p>
        )}

        {resultados.length > 0 && (
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
                      <p className="text-sm text-texto-suave">{evt.lugar} · {evt.fecha}</p>
                    </div>
                    <span className="shrink-0 font-mono text-sm text-primario bg-primario/10 px-2 py-1 rounded">
                      {evt.codigoCorto}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="text-center text-xs text-texto-suave">
          {t('home.buscar.ayuda')} <code className="font-mono">FEST-8K2P</code>.
        </p>
      </section>

      <footer className="mt-auto text-center text-xs text-texto-suave">
        <p>{t('home.pie')}</p>
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