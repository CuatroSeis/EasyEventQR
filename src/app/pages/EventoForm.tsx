import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useOrganizador } from '../ContextoOrganizador'
import ConfirmModal from '../components/ConfirmModal'
import { t } from '../../shared/toast'
import { actualizarEvento, cambiarEstadoEvento, crearEventoBackend, duplicarEvento, eliminarEvento, obtenerEvento } from '../../services/eventos'
import { validarBorrador, type BorradorEvento, type ProblemaDeValidacion } from '../../services/documentoEvento'
import { useIdioma } from '../components/IdiomaContext'
import { PRESETS } from '../../shared/theming'

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
  const { t: txt } = useIdioma()
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
  const [confirmaBorrado, setConfirmaBorrado] = useState(false)
  const [confirmaDuplicado, setConfirmaDuplicado] = useState(false)

  useEffect(() => {
    if (esNuevo) return
    let vigente = true
    obtenerEvento(eventoId)
      .then((evento) => {
        if (!vigente) return
        if (!evento) {
          setError(txt('ef.err.noexiste'))
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
          tema: evento.personalizacion?.tema ?? null,
        })
      })
      .catch(() => {
        if (vigente) setError(txt('ef.err.carga'))
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
        // Alta por backend (código/slug en transacción).
        await crearEventoBackend(borrador)
        t.success(txt('ef.toast.creado'))
        navegar('/panel', { replace: true })
      } else {
        await actualizarEvento(eventoId, borrador, organizador)
        t.success(txt('ef.toast.guardado'))
        navegar('/panel', { replace: true })
      }
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : txt('ef.err.guardar'))
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
      setError(fallo instanceof Error ? fallo.message : txt('ef.err.estado'))
      setGuardando(false)
    }
  }

  async function duplicar() {
    if (esNuevo) return
    setConfirmaDuplicado(false)
    setGuardando(true)
    setError(null)
    try {
      const evento = await obtenerEvento(eventoId)
      if (!evento) {
        setError(txt('ef.err.noexiste'))
        setGuardando(false)
        return
      }
      const creado = await duplicarEvento(evento)
      t.success(txt('ef.toast.duplicado', { codigo: creado.codigoCorto }))
      navegar('/panel', { replace: true })
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : txt('ef.err.duplicar'))
      setGuardando(false)
    }
  }

  async function borrar() {
    if (esNuevo) return
    setConfirmaBorrado(false)
    setGuardando(true)
    try {
      await eliminarEvento(eventoId, organizador)
      navegar('/panel', { replace: true })
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : txt('ef.err.borrar'))
      setGuardando(false)
    }
  }

  if (cargando) {
    return <p className="py-8 text-center text-sm text-texto-suave">{txt('ef.cargando')}</p>
  }

  const mensaje = (campo: keyof BorradorEvento) =>
    problemas.find((p) => p.campo === campo)?.mensaje

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <h1 className="text-lg font-bold text-texto">{esNuevo ? txt('ef.nuevo') : txt('ef.editar')}</h1>

      {confirmaBorrado ? (
        <ConfirmModal
          titulo={txt('ef.borrar.t')}
          mensaje={txt('ef.borrar.d')}
          confirmar={txt('ef.borrar.b')}
          enCurso={guardando ? txt('ef.borrar.curso') : undefined}
          onConfirmar={() => void borrar()}
          onCerrar={() => setConfirmaBorrado(false)}
        />
      ) : null}
      {confirmaDuplicado ? (
        <ConfirmModal
          titulo={txt('ef.duplicar.t')}
          mensaje={txt('ef.duplicar.d')}
          confirmar={txt('ef.duplicar.b')}
          enCurso={guardando ? txt('ef.duplicar.curso') : undefined}
          onConfirmar={() => void duplicar()}
          onCerrar={() => setConfirmaDuplicado(false)}
        />
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-borde p-3 text-sm text-texto">
          {error}
        </p>
      ) : null}

      <Campo etiqueta={txt('ef.nombre')} error={mensaje('nombre')}>
        <input
          className="campo"
          value={borrador.nombre}
          onChange={(e) => cambiar('nombre', e.target.value)}
          placeholder={txt('ef.nombre.ph')}
          autoComplete="off"
        />
      </Campo>

      <Campo etiqueta={txt('ef.fecha')} error={mensaje('fecha')}>
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

      <Campo etiqueta={txt('ef.donde')} error={mensaje('lugar')}>
        <input
          className="campo"
          value={borrador.lugar}
          onChange={(e) => cambiar('lugar', e.target.value)}
          placeholder={txt('ef.donde.ph')}
          autoComplete="off"
        />
      </Campo>

      <Campo etiqueta={txt('ef.desc')} ayuda={txt('ef.desc.d')}>
        <textarea
          className="campo min-h-24"
          value={borrador.descripcion}
          onChange={(e) => cambiar('descripcion', e.target.value)}
        />
      </Campo>

      <Campo
        etiqueta={txt('ef.banner')}
        error={mensaje('bannerUrl')}
        ayuda={txt('ef.banner.d')}
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

      <fieldset className="flex flex-col gap-3 rounded-xl border border-borde p-4">
        <legend className="px-1 text-sm font-medium text-texto">{txt('ef.estilo')}</legend>
        <p className="text-xs text-texto-suave">
          {txt('ef.estilo.d')}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => cambiar('tema', null)}
            aria-pressed={borrador.tema == null}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${borrador.tema == null ? 'border-primario bg-primario/10 text-texto' : 'border-borde text-texto-suave'}`}
          >
            {txt('ef.sinEstilo')}
          </button>
          {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((clave) => (
            <button
              key={clave}
              type="button"
              onClick={() => cambiar('tema', clave)}
              aria-pressed={borrador.tema === clave}
              title={PRESETS[clave].descripcion}
              className={`rounded-lg border px-3 py-2 text-left ${borrador.tema === clave ? 'border-primario' : 'border-borde'}`}
            >
              <span
                className="mb-1 flex h-6 overflow-hidden rounded"
                style={{ background: PRESETS[clave].paleta.superficie, border: `1px solid ${PRESETS[clave].paleta.borde}` }}
              >
                <span className="h-full w-1/2" style={{ background: PRESETS[clave].paleta.colorPrimario }} />
                <span className="h-full w-1/2" style={{ background: PRESETS[clave].paleta.colorSecundario }} />
              </span>
              <span className="block text-xs font-medium text-texto">{PRESETS[clave].nombre}</span>
            </button>
          ))}
        </div>
        {mensaje('tema') ? <p className="text-xs text-red-600">{mensaje('tema')}</p> : null}
      </fieldset>

      <Campo
        etiqueta={txt('ef.cupo')}
        error={mensaje('capacidadMaxima')}
        ayuda={txt('ef.cupo.d', { n: limite })}
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
        <legend className="px-1 text-sm font-medium text-texto">{txt('ef.quien')}</legend>
        <label className="flex items-start gap-3 text-sm text-texto">
          <input
            type="radio"
            name="visibilidad"
            className="mt-1 h-5 w-5 accent-[var(--c-primario)]"
            checked={borrador.visibilidad === 'privado'}
            onChange={() => cambiar('visibilidad', 'privado')}
          />
          <span>
            <span className="font-medium">{txt('ef.privado')}</span>
            <span className="block text-xs text-texto-suave">
              {txt('ef.privado.d')}
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
            <span className="font-medium">{txt('ef.publico')}</span>
            <span className="block text-xs text-texto-suave">
              {txt('ef.publico.d')}
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
          {txt('ef.pago')}
        </label>

        {borrador.requierePago ? (
          <Campo etiqueta={txt('ef.precio')} error={mensaje('precioEntrada')}>
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
            {txt('ef.pago.prox')}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={guardando}
          className="min-h-[var(--touch-min)] rounded-xl bg-primario px-4 text-sm font-semibold text-sobre-primario disabled:opacity-60"
        >
          {guardando ? txt('ef.guardando') : esNuevo ? txt('ef.crear') : txt('ef.guardar')}
        </button>

        {esNuevo ? null : (
          <>
            <button
              type="button"
              onClick={alternarCerrado}
              disabled={guardando}
              className="min-h-[var(--touch-min)] rounded-xl border border-borde px-4 text-sm font-medium text-texto disabled:opacity-60"
            >
              {txt('ef.cerrar')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmaDuplicado(true)}
              disabled={guardando}
              className="min-h-[var(--touch-min)] rounded-xl border border-borde px-4 text-sm font-medium text-texto disabled:opacity-60"
            >
              {txt('ef.duplicar')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmaBorrado(true)}
              disabled={guardando}
              className="min-h-[var(--touch-min)] px-4 text-sm font-medium text-texto-suave underline disabled:opacity-60"
            >
              {txt('ef.borrar')}
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
