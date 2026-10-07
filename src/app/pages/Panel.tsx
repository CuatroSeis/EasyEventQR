import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useIdioma } from '../components/IdiomaContext'

import { useOrganizador } from '../ContextoOrganizador'
import EmptyState from '../components/EmptyState'
import { listarEventos, resumenVentas } from '../../services/eventos'
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
  const { t } = useIdioma()
  const organizador = useOrganizador()
  const [eventos, setEventos] = useState<EventoConId[] | null>(null)
  const [ventas, setVentas] = useState<{ entradas: number; monto: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true

    // Pantalla en blanco = mirar el índice compuesto (FAILED_PRECONDITION sin él).
    listarEventos(organizador.uid)
      .then((resultado) => {
        if (!vigente) return
        setEventos(resultado)
        // Si las ventas fallan, el panel igual muestra lo demás.
        resumenVentas(resultado.map((e) => e.id))
          .then((r) => {
            if (vigente) setVentas(r)
          })
          .catch(() => {
            if (vigente) setVentas(null)
          })
      })
      .catch((fallo: unknown) => {
        if (!vigente) return
        setEventos([])
        setError(
          fallo instanceof Error
            ? fallo.message
            : t('panel.error.carga'),
        )
      })

    // Flag anti setState post-desmontaje (StrictMode corre el efecto dos veces).
    return () => {
      vigente = false
    }
  }, [organizador.uid])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-texto">{t('panel.titulo')}</h1>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-borde bg-superficie p-3 text-sm text-texto"
        >
          {error}
        </p>
      ) : null}

      {!error && eventos === null ? <Cargando /> : null}

      {!error && eventos !== null ? <Resumen eventos={eventos} ventas={ventas} /> : null}

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
  const { t } = useIdioma()
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {[0, 1].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl border border-borde" />
      ))}
      <span className="sr-only">{t('panel.cargando')}</span>
    </div>
  )
}

function Resumen({
  eventos,
  ventas,
}: {
  eventos: EventoConId[]
  ventas: { entradas: number; monto: number } | null
}) {
  // Suma local de `reservas` (no en vivo: se actualiza al volver a entrar).
  const { t } = useIdioma()
  const inscriptos = eventos.reduce((total, e) => total + (Number(e.reservas) || 0), 0)
  const abiertos = eventos.filter((e) => e.estado === 'activo').length
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl border border-borde bg-superficie p-3 text-center">
        <dt className="text-xs text-texto-suave">{t('panel.m.eventos')}</dt>
        <dd className="text-xl font-bold text-texto">{eventos.length}</dd>
      </div>
      <div className="rounded-xl border border-borde bg-superficie p-3 text-center">
        <dt className="text-xs text-texto-suave">{t('panel.m.abiertos')}</dt>
        <dd className="text-xl font-bold text-texto">{abiertos}</dd>
      </div>
      <div className="rounded-xl border border-borde bg-superficie p-3 text-center">
        <dt className="text-xs text-texto-suave">{t('panel.m.inscriptos')}</dt>
        <dd className="text-xl font-bold text-texto">{inscriptos}</dd>
      </div>
      <div className="rounded-xl border border-borde bg-superficie p-3 text-center">
        <dt className="text-xs text-texto-suave">{t('panel.m.vendidas')}</dt>
        <dd className="text-xl font-bold text-texto">
          {ventas === null ? '—' : ventas.entradas}
        </dd>
        {ventas !== null && ventas.monto > 0 ? (
          <dd className="text-xs text-texto-suave">
            $ {ventas.monto.toLocaleString('es-AR')}
          </dd>
        ) : null}
      </div>
    </dl>
  )
}

function Vacio() {
  const { t } = useIdioma()
  return (
    <EmptyState
      titulo={t('panel.vacio.t')}
      ayuda={t('panel.vacio.d')}
      cta={t('panel.vacio.boton')}
      to="/panel/eventos/nuevo"
    />
  )
}

function TarjetaEvento({ evento }: { evento: EventoConId }) {
  const { t } = useIdioma()
  const cerrado = evento.estado === 'cerrado'
  const pagado = evento.requierePago
  const [copiado, setCopiado] = useState<'link' | 'codigo' | 'qr' | null>(null)

  // Link público con código corto (es lo que se comparte).
  const linkPublico = typeof window !== 'undefined'
    ? `${window.location.origin}/e/${evento.codigoCorto}`
    : ''

  async function copiar(texto: string, cual: 'link' | 'codigo' | 'qr') {    try {
      await navigator.clipboard.writeText(texto)
    } catch {

      const textarea = document.createElement('textarea')
      textarea.value = texto
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopiado(cual)
    setTimeout(() => setCopiado(null), 2000)
  }

  // QR del link público, generado en el navegador (nada viaja al servidor).
  async function descargarQR() {
    try {
      const { default: QRCode } = await import('qrcode')
      const png = await QRCode.toDataURL(linkPublico, { width: 512, margin: 2 })
      const a = document.createElement('a')
      a.href = png
      a.download = `qr-${evento.codigoCorto}.png`
      a.click()
      setCopiado('qr')
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      // Sin toast: sin contexto de error, fallar en silencio es mejor que un alert.
    }
  }

  return (
    <Link
      to={`/panel/eventos/${evento.id}`}
      className="block rounded-xl border border-borde bg-superficie p-4 active:bg-superficie/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-texto">{evento.nombre}</h2>
          <p className="mt-0.5 font-mono text-xs text-texto-suave" aria-label={`${t('panel.codigo.aria')} ${evento.codigoCorto}`}>
            {evento.codigoCorto}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={
              cerrado
                ? 'shrink-0 rounded-full bg-borde px-2 py-0.5 text-xs text-texto-suave'
                : 'shrink-0 rounded-full bg-primario px-2 py-0.5 text-xs text-sobre-primario'
            }
          >
{cerrado ? t('panel.estado.cerrado') : t('panel.estado.abierto')}
          </span>
          <span
            className="shrink-0 rounded-full border border-borde px-2 py-0.5 text-xs text-texto-suave"
            title={evento.visibilidad === 'publico' ? t('panel.vis.pub.t') : t('panel.vis.priv.t')}
          >
{evento.visibilidad === 'publico' ? t('panel.vis.pub') : t('panel.vis.priv')}
          </span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); void copiar(linkPublico, 'link'); }}
          className="min-h-11 flex-1 rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-superficie active:bg-borde transition disabled:opacity-50"
          disabled={copiado !== null}
          aria-label={t('panel.copiarLink.aria')}
        >
          {copiado === 'link' ? `✓ ${t('comun.copiado')}` : t('panel.copiarLink')}
        </button>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); void copiar(evento.codigoCorto, 'codigo'); }}
          className="min-h-11 flex-1 rounded-lg border border-borde px-3 py-1.5 font-mono text-xs font-medium text-texto hover:bg-superficie active:bg-borde transition disabled:opacity-50"
          disabled={copiado !== null}
          aria-label={t('panel.copiarCodigo.aria')}
        >
          {copiado === 'codigo' ? `✓ ${t('comun.copiado')}` : t('panel.copiarCodigo')}
        </button>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); void descargarQR(); }}
          className="min-h-11 flex-1 rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-superficie active:bg-borde transition disabled:opacity-50"
          disabled={copiado !== null}
          aria-label={t('panel.qr.aria')}
        >
          {copiado === 'qr' ? `✓ ${t('panel.qr.listo')}` : t('panel.qr')}
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <Link
          to={`/panel/eventos/${evento.id}/escanear`}
          onClick={(e) => { e.stopPropagation(); }}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primario px-3 py-1.5 text-xs font-semibold text-sobre-primario transition hover:brightness-110"
          aria-label={`${t('panel.escanear.aria')} ${evento.nombre}`}
        >
          {t('panel.escanear')}
        </Link>
        <Link
          to={`/panel/eventos/${evento.id}/registros`}
          onClick={(e) => { e.stopPropagation(); }}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-superficie active:bg-borde transition"
          aria-label={`${t('panel.registros.aria')} ${evento.nombre}`}
        >
          {t('panel.registros')}
        </Link>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs">
        <dt className="text-texto-suave">{t('panel.f.cuando')}</dt>
        <dd className="text-texto">{formatearFecha(evento.fecha)}</dd>

        <dt className="text-texto-suave">{t('panel.f.donde')}</dt>
        <dd className="truncate text-texto">{evento.lugar || '—'}</dd>

        <dt className="text-texto-suave">{t('panel.f.cupo')}</dt>
        <dd className="text-texto">{t('panel.cupo.n', { n: evento.capacidadMaxima })}</dd>

        <dt className="text-texto-suave">{t('panel.f.entrada')}</dt>
        <dd className="text-texto">
          {pagado && evento.precioEntrada !== null
            ? `$ ${evento.precioEntrada.toLocaleString('es-AR')}`
            : t('panel.gratis')}
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
