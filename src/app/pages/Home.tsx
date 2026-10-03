import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

export default function Home() {
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
        setError('Evento no encontrado. Verificá el código o el nombre.')
      }
    } catch {
      setError('No pudimos buscar. Revisá la conexión.')
    } finally {
      setBuscando(false)
    }
  }

  // Si hay un solo resultado exacto por código, redirigir directo
  // (el backend ya filtra, pero por UX podemos redirigir si es 1 y coincide exacto)
  // Por ahora mostramos la lista y el usuario elige.

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 p-4 pb-12">
      <header className="pt-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-texto">EasyEventQR</h1>
          <p className="mt-2 text-texto-suave text-lg">
            La forma simple de gestionar entradas para tus eventos
          </p>
        </div>
      </header>

      <section aria-labelledby="organizador-heading" className="space-y-4">
        <h2 id="organizador-heading" className="text-xl font-bold text-texto text-center">
          ¿Sos organizador?
        </h2>
        <p className="text-center text-texto-suave">
          Creá tu evento, vendé entradas y gestioná asistentes en minutos.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/entrar"
            className="flex-1 min-h-[56px] inline-flex items-center justify-center rounded-xl bg-primario px-6 py-3 text-lg font-semibold text-sobre-primario hover:opacity-90 transition"
          >
            Iniciar sesión
          </Link>
          <Link
            to="/entrar"
            className="flex-1 min-h-[56px] inline-flex items-center justify-center rounded-xl border-2 border-primario px-6 py-3 text-lg font-semibold text-primario hover:bg-primario/5 transition"
          >
            Crear cuenta
          </Link>
        </div>
      </section>

      <section aria-labelledby="invitado-heading" className="space-y-4">
        <h2 id="invitado-heading" className="text-xl font-bold text-texto text-center">
          ¿Sos invitado?
        </h2>
        <p className="text-center text-texto-suave">
          Encontrá tu evento con el código o el nombre.
        </p>

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
              placeholder="Código (FEST-8K2P) o nombre del evento"
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
            {buscando ? 'Buscando…' : 'Buscar evento'}
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
          El código es algo como <code className="font-mono">FEST-8K2P</code>.
        </p>
      </section>

      <footer className="mt-auto text-center text-xs text-texto-suave">
        <p>EasyEventQR · La forma simple de gestionar entradas</p>
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