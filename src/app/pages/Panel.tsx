import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useOrganizador } from '../ContextoOrganizador'
import { listarEventos } from '../../services/eventos'
import type { EventoConId } from '../../services/eventos'

/**
 * Lista de eventos del organizador.
 *
 * Mobile-first de verdad, no "desktop que se achica": la acción principal
 * vive en la barra fija de abajo (PanelLayout), no en un botón suelto
 * arriba que queda fuera del alcance del pulgar con el celular en una
 * mano. La lista son cards apiladas y no una tabla: una tabla con
 * scroll horizontal en un celular de 360 px es una tabla que nadie usa.
 */
export default function Panel() {
  const organizador = useOrganizador()
  const [eventos, setEventos] = useState<EventoConId[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true

    // El `where` de listarEventos es lo que impide que un list sin filtro
    // devuelva una lista vacía sin error. Si algún día esta pantalla se
    // queda en blanco, el primer lugar donde mirar es el índice
    // compuesto: sin él, la consulta falla con FAILED_PRECONDITION.
    listarEventos(organizador.uid)
      .then((resultado) => {
        if (vigente) setEventos(resultado)
      })
      .catch((fallo: unknown) => {
        if (!vigente) return
        setEventos([])
        setError(
          fallo instanceof Error
            ? fallo.message
            : 'No pudimos cargar tus eventos. Probá de nuevo en un momento.',
        )
      })

    // El flag evita setState sobre un componente desmontado. Con
    // StrictMode en desarrollo el efecto corre dos veces y la primera
    // promesa se resuelve después del desmontaje.
    return () => {
      vigente = false
    }
  }, [organizador.uid])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-texto">Tus eventos</h1>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-borde bg-superficie p-3 text-sm text-texto"
        >
          {error}
        </p>
      ) : null}

      {!error && eventos === null ? <Cargando /> : null}

      {!error && eventos?.length === 0 ? <Vacio /> : null}

      {eventos && eventos.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {eventos.map((evento) => (
            <li key={evento.id}>
              <TarjetaEvento evento={evento} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Cargando() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {[0, 1].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl border border-borde" />
      ))}
      <span className="sr-only">Cargando eventos…</span>
    </div>
  )
}

function Vacio() {
  return (
    <div className="rounded-xl border border-dashed border-borde p-6 text-center">
      <p className="text-sm font-medium text-texto">Todavía no tenés eventos</p>
      <p className="mt-1 text-xs text-texto-suave">
        Creá el primero con el botón de abajo. Después vas a poder compartir el link de
        reservas.
      </p>
    </div>
  )
}

function TarjetaEvento({ evento }: { evento: EventoConId }) {
  const cerrado = evento.estado === 'cerrado'
  const pagado = evento.requierePago

  return (
    <Link
      to={`/panel/eventos/${evento.id}`}
      className="block rounded-xl border border-borde bg-superficie p-4 active:bg-superficie/60"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-sm font-semibold text-texto">{evento.nombre}</h2>
        <span
          className={
            cerrado
              ? 'shrink-0 rounded-full bg-borde px-2 py-0.5 text-xs text-texto-suave'
              : 'shrink-0 rounded-full bg-primario px-2 py-0.5 text-xs text-sobre-primario'
          }
        >
          {cerrado ? 'Cerrado' : 'Abierto'}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs">
        <dt className="text-texto-suave">Cuándo</dt>
        <dd className="text-texto">{formatearFecha(evento.fecha)}</dd>

        <dt className="text-texto-suave">Dónde</dt>
        <dd className="truncate text-texto">{evento.lugar || '—'}</dd>

        <dt className="text-texto-suave">Cupo</dt>
        <dd className="text-texto">{evento.capacidadMaxima} entradas</dd>

        <dt className="text-texto-suave">Entrada</dt>
        <dd className="text-texto">
          {pagado && evento.precioEntrada !== null
            ? `$ ${evento.precioEntrada.toLocaleString('es-AR')}`
            : 'Gratis'}
        </dd>
      </dl>
    </Link>
  )
}

/**
 * `fecha` llega como Date gracias al aFecha() del service. Si algún día
 * se rompe ese normalizado, esto tiene que devolver "—" y no reventar:
 * una fecha ilegible no puede dejar la lista en blanco.
 */
function formatearFecha(fecha: Date): string {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return '—'
  return fecha.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
