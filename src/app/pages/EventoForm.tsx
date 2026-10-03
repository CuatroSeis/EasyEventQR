import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useOrganizador } from '../ContextoOrganizador'
import { actualizarEvento, cambiarEstadoEvento, crearEvento, eliminarEvento, obtenerEvento } from '../../services/eventos'
import { validarBorrador, type BorradorEvento, type ProblemaDeValidacion } from '../../services/documentoEvento'

/**
 * Crear y editar un evento. Es el mismo formulario para los dos casos:
 * la ruta decide si hay id o no, y la diferencia real es si al final
 * llama a crearEvento() o a actualizarEvento().
 *
 * Dos componentes separados duplicarían el HTML del formulario, y la
 * mitad de las correcciones de un bug de mobile se aplicarían a uno y se
 * olvidarían del otro.
 */

const HOY = new Date()

function borradorDesdeFecha(fecha: Date): BorradorEvento {
  return {
    nombre: '',
    fecha,
    lugar: '',
    descripcion: '',
    capacidadMaxima: 50,
    requierePago: false,
    precioEntrada: null,
    bannerUrl: null,
    visibilidad: 'privado',
  }
}

export default function EventoForm() {
  const { eventoId } = useParams<{ eventoId: string }>()
  const esNuevo = eventoId === undefined
  const navegar = useNavigate()
  const organizador = useOrganizador()

  const [borrador, setBorrador] = useState<BorradorEvento>(() =>
    borradorDesdeFecha(sumarDias(HOY, 14)),
  )
  const [problemas, setProblemas] = useState<ProblemaDeValidacion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando] = useState(!esNuevo)

  useEffect(() => {
    if (esNuevo) return
    let vigente = true
    obtenerEvento(eventoId)
      .then((evento) => {
        if (!vigente) return
        if (!evento) {
          setError('Ese evento no existe o ya no es tuyo.')
          return
        }
        setBorrador({
          nombre: evento.nombre,
          fecha: evento.fecha,
          lugar: evento.lugar,
          descripcion: evento.descripcion,
          capacidadMaxima: evento.capacidadMaxima,
          requierePago: evento.requierePago,
          precioEntrada: evento.precioEntrada,
          bannerUrl: evento.personalizacion?.bannerUrl ?? null,
          visibilidad: evento.visibilidad,
        })
      })
      .catch(() => {
        if (vigente) setError('No pudimos cargar el evento.')
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [esNuevo, eventoId])

  const limite = organizador.limitesPersonalizacion.capacidadMaximaPorEvento

  function cambiar<K extends keyof BorradorEvento>(campo: K, valor: BorradorEvento[K]) {
    setBorrador((previo) => ({ ...previo, [campo]: valor }))
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setGuardando(true)
    setError(null)

    const encontrados = validarBorrador(borrador, limite)
    setProblemas(encontrados)
    if (encontrados.length > 0) {
      setGuardando(false)
      return
    }

    try {
      if (esNuevo) {
        await crearEvento(organizador.uid, borrador, organizador)
      } else {
        await actualizarEvento(eventoId, borrador, organizador)
      }
      navegar('/panel', { replace: true })
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar el evento.')
      setGuardando(false)
    }
  }

  async function alternarCerrado() {
    if (esNuevo) return
    setGuardando(true)
    try {
      const evento = await obtenerEvento(eventoId)
      const destino = evento?.estado === 'cerrado' ? 'activo' : 'cerrado'
      await cambiarEstadoEvento(eventoId, destino, organizador)
      navegar('/panel', { replace: true })
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cambiar el estado.')
      setGuardando(false)
    }
  }

  async function borrar() {
    if (esNuevo) return
    if (!confirm('¿Borrar este evento? Se va con las reservas que tenga adentro.')) return
    setGuardando(true)
    try {
      await eliminarEvento(eventoId, organizador)
      navegar('/panel', { replace: true })
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo borrar el evento.')
      setGuardando(false)
    }
  }

  if (cargando) {
    return <p className="py-8 text-center text-sm text-texto-suave">Cargando evento…</p>
  }

  const mensaje = (campo: keyof BorradorEvento) =>
    problemas.find((p) => p.campo === campo)?.mensaje

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <h1 className="text-lg font-bold text-texto">{esNuevo ? 'Nuevo evento' : 'Editar evento'}</h1>

      {error ? (
        <p role="alert" className="rounded-xl border border-borde p-3 text-sm text-texto">
          {error}
        </p>
      ) : null}

      <Campo etiqueta="Nombre" error={mensaje('nombre')}>
        <input
          className="campo"
          value={borrador.nombre}
          onChange={(e) => cambiar('nombre', e.target.value)}
          placeholder="Concierto, cena, curso…"
          autoComplete="off"
        />
      </Campo>

      <Campo etiqueta="Fecha y hora" error={mensaje('fecha')}>
        <input
          className="campo"
          type="datetime-local"
          value={aInputDateTime(borrador.fecha)}
          onChange={(e) => {
            const fecha = new Date(e.target.value)
            if (!Number.isNaN(fecha.getTime())) cambiar('fecha', fecha)
          }}
        />
      </Campo>

      <Campo etiqueta="Dónde" error={mensaje('lugar')}>
        <input
          className="campo"
          value={borrador.lugar}
          onChange={(e) => cambiar('lugar', e.target.value)}
          placeholder="Salón, dirección, link"
          autoComplete="off"
        />
      </Campo>

      <Campo etiqueta="Descripción" ayuda="Opcional. Sale en la página del evento.">
        <textarea
          className="campo min-h-24"
          value={borrador.descripcion}
          onChange={(e) => cambiar('descripcion', e.target.value)}
        />
      </Campo>

      <Campo
        etiqueta="Banner (URL)"
        error={mensaje('bannerUrl')}
        ayuda="Opcional. Link a una imagen (jpg, png, webp) en Imgur, Drive, Cloudinary, etc."
      >
        <input
          className="campo"
          type="url"
          value={borrador.bannerUrl ?? ''}
          onChange={(e) => cambiar('bannerUrl', e.target.value || null)}
          placeholder="https://ejemplo.com/banner.jpg"
          autoComplete="off"
        />
      </Campo>

      <Campo
        etiqueta="Cupo"
        error={mensaje('capacidadMaxima')}
        ayuda={`Tu plan permite hasta ${limite} entradas por evento.`}
      >
        <input
          className="campo"
          type="number"
          inputMode="numeric"
          min={1}
          max={limite}
          value={borrador.capacidadMaxima}
          onChange={(e) => cambiar('capacidadMaxima', Number.parseInt(e.target.value || '0', 10))}
        />
      </Campo>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-borde p-4">
        <legend className="px-1 text-sm font-medium text-texto">Quién lo puede encontrar</legend>
        <label className="flex items-start gap-3 text-sm text-texto">
          <input
            type="radio"
            name="visibilidad"
            className="mt-1 h-5 w-5 accent-[var(--c-primario)]"
            checked={borrador.visibilidad === 'privado'}
            onChange={() => cambiar('visibilidad', 'privado')}
          />
          <span>
            <span className="font-medium">Privado</span>
            <span className="block text-xs text-texto-suave">
              Solo entra quien tenga el link o el código. No aparece en el buscador.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-texto">
          <input
            type="radio"
            name="visibilidad"
            className="mt-1 h-5 w-5 accent-[var(--c-primario)]"
            checked={borrador.visibilidad === 'publico'}
            onChange={() => cambiar('visibilidad', 'publico')}
          />
          <span>
            <span className="font-medium">Público</span>
            <span className="block text-xs text-texto-suave">
              Aparece cuando alguien lo busca por nombre en el inicio.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-borde p-4">
        <label className="flex items-center gap-3 text-sm text-texto">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--c-primario)]"
            checked={borrador.requierePago}
            onChange={(e) => cambiar('requierePago', e.target.checked)}
          />
          El evento es pago
        </label>

        {borrador.requierePago ? (
          <Campo etiqueta="Precio por entrada" error={mensaje('precioEntrada')}>
            <input
              className="campo"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={borrador.precioEntrada ?? ''}
              onChange={(e) => {
                const texto = e.target.value
                cambiar('precioEntrada', texto === '' ? null : Number.parseFloat(texto))
              }}
              placeholder="0"
            />
          </Campo>
        ) : (
          <p className="text-xs text-texto-suave">
            El cobro real llega en una fase posterior. Por ahora el evento queda como gratis.
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={guardando}
          className="min-h-[var(--touch-min)] rounded-xl bg-primario px-4 text-sm font-semibold text-sobre-primario disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : esNuevo ? 'Crear evento' : 'Guardar cambios'}
        </button>

        {esNuevo ? null : (
          <>
            <button
              type="button"
              onClick={alternarCerrado}
              disabled={guardando}
              className="min-h-[var(--touch-min)] rounded-xl border border-borde px-4 text-sm font-medium text-texto disabled:opacity-60"
            >
              Cerrar / reabrir reservas
            </button>
            <button
              type="button"
              onClick={borrar}
              disabled={guardando}
              className="min-h-[var(--touch-min)] px-4 text-sm font-medium text-texto-suave underline disabled:opacity-60"
            >
              Borrar evento
            </button>
          </>
        )}
      </div>
    </form>
  )
}

function Campo({
  etiqueta,
  error,
  ayuda,
  children,
}: {
  etiqueta: string
  error?: string
  ayuda?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-texto">{etiqueta}</span>
      {children}
      {ayuda && !error ? <span className="text-xs text-texto-suave">{ayuda}</span> : null}
      {error ? (
        <span role="alert" className="text-xs text-texto-suave">
          {error}
        </span>
      ) : null}
    </label>
  )
}

function sumarDias(base: Date, dias: number): Date {
  const copia = new Date(base)
  copia.setDate(copia.getDate() + dias)
  return copia
}

/**
 * `datetime-local` no pide un ISO con zona: pide "2026-06-01T20:00" en la
 * hora local. Si se le pasa un `toISOString()`, que es UTC, el evento se
 * guarda corrido por el offset y aparece a otra hora en la pantalla del
 * organizador. Es la clase de bug que sólo aparece cuando el evento es a
 * la tarde, o cuando el servidor está en otra zona.
 */
function aInputDateTime(fecha: Date): string {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return ''
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}T${dos(
    fecha.getHours(),
  )}:${dos(fecha.getMinutes())}`
}
