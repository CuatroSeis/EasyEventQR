import { useState, type ReactNode } from 'react'

// Importamos de config.ts, NO de firebase.ts: esta pantalla lee dos
// variables de entorno y no debería arrastrar el SDK de Firebase entero
// (~400 kB) para eso. Compará los dos builds: el bundle inicial baja
// de 728 kB a menos de 200 kB.
import { firebaseConfigurado } from '../../services/config'
import { aplicarTema } from '../../shared/theming'

const COLORES = [
  { hex: '#2563eb', nombre: 'Azul' },
  { hex: '#dc2626', nombre: 'Rojo' },
  { hex: '#0d9488', nombre: 'Verde' },
  { hex: '#7c3aed', nombre: 'Violeta' },
  { hex: '#f59e0b', nombre: 'Ámbar' },
]

/**
 * Pantalla mínima de la Fase 0.
 *
 * No es un placeholder: es el comprobador de que los tres engranajes de
 * esta fase funcionan. Si esto anda, el andamiaje está bien.
 *
 *  1. Vite + React + Tailwind compilan y se ven.
 *  2. Firebase está inicializado y Connected al proyecto real.
 *  3. El patrón de theming cambia la pantalla en vivo.
 */
export default function Home() {
  // Estado del selector de color. En la Fase 3 estos valores van a
  // venir de un documento de Firestore, no de un click.
  const [color, setColor] = useState(COLORES[0].hex)

  // Esta es TODA la personalización: una llamada que escribe variables CSS.
  // Después de esto, bg-primario/ text-sobre-primario/ border-primario
  // en cualquier componente de la app ya usan el color elegido.
  aplicarTema({ colorPrimario: color, colorSecundario: '#0f172a' }, document.documentElement)

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-4 pb-12">
      <header className="flex items-center gap-3 pt-4">
        <div className="bg-primario grid size-11 place-items-center rounded-xl text-xl text-sobre-primario">
          ⬛
        </div>
        <div>
          <h1 className="text-xl font-bold">EasyEventQR</h1>
          <p className="text-texto-suave text-sm">Fase 0 · andamiaje</p>
        </div>
      </header>

      <section className="border-borde divide-y divide-[var(--c-borde)] overflow-hidden rounded-2xl border bg-superficie">
        <Fila titulo="React + Vite + Tailwind" valor="ok" />
        <Fila
          titulo="Config de Firebase"
          valor={firebaseConfigurado ? 'ok' : 'falta .env'}
          ok={firebaseConfigurado}
        />
        <Fila
          titulo="Proyecto"
          valor={import.meta.env.VITE_FIREBASE_PROJECT_ID || '—'}
          ok={firebaseConfigurado}
        />
        <Fila
          titulo="Backend /api/salud"
          // El padding es sólo para el área táctil: sin él el link mide
          // 43x14 en un móvil de 360px, por debajo de los 44px que
          // recomienda WCAG 2.5.8. El texto se ve exactamente igual.
          valor={
            <a
              className="-my-3 inline-flex min-h-11 items-center px-2 text-primario underline"
              href="/api/salud"
            >
              probar
            </a>
          }
          ok={firebaseConfigurado}
        />
      </section>

      <section className="border-borde rounded-2xl border bg-superficie p-5">
        <h2 className="font-semibold">El patrón de theming</h2>
        <p className="text-texto-suave mt-1 text-sm">
          Mismo componente, mismos estilos, aspecto distinto. Lo único que cambia es el valor de
          una variable CSS.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {COLORES.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => setColor(c.hex)}
              aria-pressed={color === c.hex}
              className="min-h-11 rounded-full border-2 px-4 text-sm font-medium transition"
              style={{
                borderColor: color === c.hex ? c.hex : 'var(--c-borde)',
                backgroundColor: color === c.hex ? c.hex : 'transparent',
                color: color === c.hex ? '#fff' : 'inherit',
              }}
            >
              {c.nombre}
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button className="bg-primario text-sobre-primario min-h-11 flex-1 rounded-xl px-5 font-semibold">
            Confirmar asistencia
          </button>
          <span className="text-texto-suave text-center font-mono text-xs">{color}</span>
        </div>
        <p className="text-texto-suave mt-3 text-xs">
          Fijate en el texto del botón: el blanco o el oscuro se calculan solos a partir del color
          del cliente (<code>colorDeTextoSobre</code> en <code>shared/theming.ts</code>).
        </p>
      </section>

      <p className="text-texto-suave mt-auto text-center text-xs">
        Próximas fases: auth con Google y reglas multi-tenant (1) · CRUD de eventos (2)
      </p>
    </main>
  )
}

function Fila({ titulo, valor, ok }: { titulo: string; valor: string | ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <span className="text-sm">{titulo}</span>
      <span className="font-mono text-xs">
        {ok === false ? <span className="text-amber-600">{valor}</span> : valor}
      </span>
    </div>
  )
}
