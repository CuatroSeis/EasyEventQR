import { useCallback, useEffect, useState } from 'react'

import { pedirRegistrosAdmin, type RegistroAdmin } from '../../../services/admin'
import { Cargando } from './Cargando'
import { MensajeError } from './MensajeError'

const POR_PAGINA = 25

const ESTADOS: { valor: RegistroAdmin['estado']; etiqueta: string }[] = [
  { valor: 'pendiente', etiqueta: 'Pendiente' },
  { valor: 'aprobado', etiqueta: 'Aprobado' },
  { valor: 'rechazado', etiqueta: 'Rechazado' },
]

const PAGOS: { valor: RegistroAdmin['pago']['estado']; etiqueta: string }[] = [
  { valor: 'no_aplica', etiqueta: 'Gratis' },
  { valor: 'pendiente', etiqueta: 'Pendiente' },
  { valor: 'pagado', etiqueta: 'Pagado' },
  { valor: 'rechazado', etiqueta: 'Rechazado' },
]

/**
 * Registros de todos los eventos, en modo lectura.
 *
 * Este listado NO ofrece reenvío de mail ni cambio de estado a propósito.
 * `/api/registros` reenvía porque conoce el evento y sus reglas; hacerlo
 * desde acá tendría que duplicar ese camino y abrir una puerta donde el
 * QR ya salió una vez. Reenviar y corregir estado son acciones del
 * organizador en su propio evento.
 *
 * El CSV se arma en el navegador con los datos que ya están en pantalla.
 * Para un volume de producción esto debería ser un endpoint que genere el
 * archivo, porque acá sólo se exporta lo que la página trajo.
 */
export function RegistrosTab() {
  const [registros, setRegistros] = useState<RegistroAdmin[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [consulta, setConsulta] = useState('')
  const [estado, setEstado] = useState<RegistroAdmin['estado'] | ''>('')
  const [pago, setPago] = useState<RegistroAdmin['pago']['estado'] | ''>('')
  const [pagina, setPagina] = useState(1)

  // La caja de búsqueda no dispara peticiones: se escribe rápido y cada
  // tecla sería un viaje. El fetch ocurre al confirmar con Enter.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setConsulta(busqueda)
      setPagina(1)
    }, 350)
    return () => window.clearTimeout(t)
  }, [busqueda])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const respuesta = await pedirRegistrosAdmin({
        search: consulta,
        estado,
        pagoEstado: pago,
        limite: POR_PAGINA,
        offset: (pagina - 1) * POR_PAGINA,
      })
      setRegistros(respuesta.registros)
      setTotal(respuesta.total)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los registros.')
    } finally {
      setCargando(false)
    }
  }, [consulta, estado, pago, pagina])

  useEffect(() => {
    void cargar()
  }, [cargar])

  function exportarCsv() {
    if (registros.length === 0) return

    const filas = registros.map((r) =>
      COLUMNAS_CSV.map((c) => {
          const valor = valorColumna(r, c)
          return `"${String(valor).replace(/"/g, '""')}"`
        })
        .join(','),
    )

    // BOM al principio: sin él, Excel abre el CSV en latin-1 y los acentos
    // de "Rodríguez" salen rotos. Es el motivo por el que el archivo pesa
    // tres bytes más.
    const csv = `﻿${COLUMNAS_CSV.join(',')}\n${filas.join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = `registros-${new Date().toISOString().slice(0, 10)}.csv`
    enlace.click()
    URL.revokeObjectURL(url)
  }

  const paginas = Math.max(Math.ceil(total / POR_PAGINA), 1)
  const usados = registros.filter((r) => r.usado).length

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-texto">Registros</h1>
          <p className="text-sm text-texto-suave">
            {total} en total · {usados} usados en esta página
          </p>
        </div>
        <button
          type="button"
          onClick={exportarCsv}
          disabled={registros.length === 0}
          className="rounded-lg border border-borde px-3 py-1.5 text-xs font-medium text-texto hover:bg-superficie disabled:opacity-50"
        >
          Exportar página ({registros.length})
        </button>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, email, DNI, teléfono, evento o id"
          className="campo flex-1"
          aria-label="Buscar registro"
        />
        <select
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value as RegistroAdmin['estado'] | '')
            setPagina(1)
          }}
          className="campo sm:w-36"
          aria-label="Filtrar por estado"
        >
          <option value="">Todo estado</option>
          {ESTADOS.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.etiqueta}
            </option>
          ))}
        </select>
        <select
          value={pago}
          onChange={(e) => {
            setPago(e.target.value as RegistroAdmin['pago']['estado'] | '')
            setPagina(1)
          }}
          className="campo sm:w-36"
          aria-label="Filtrar por pago"
        >
          <option value="">Todo pago</option>
          {PAGOS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {error && <MensajeError texto={error} />}

      {cargando ? (
        <Cargando etiqueta="Cargando registros…" />
      ) : registros.length === 0 ? (
        <p className="rounded-xl border border-dashed border-borde p-6 text-center text-sm text-texto-suave">
          No hay reservas que coincidan.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde">
          <table className="w-full text-sm">
            <thead className="bg-superficie text-left text-xs text-texto-suave">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Asistente</th>
                <th scope="col" className="px-3 py-2 font-medium">Evento</th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">DNI</th>
                <th scope="col" className="px-3 py-2 font-medium">Estado</th>
                <th scope="col" className="px-3 py-2 font-medium">Pago</th>
                <th scope="col" className="px-3 py-2 font-medium">Usado</th>
                <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Registrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {registros.map((r) => (
                <tr key={r.id} className="hover:bg-superficie/50">
                  <td className="px-3 py-2">
                    <p className="font-medium text-texto">{r.nombre}</p>
                    <p className="text-xs text-texto-suave">{r.email}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-texto">{r.eventoNombre}</p>
                    <p className="text-xs text-texto-suave">{r.organizadorNombre}</p>
                  </td>
                  <td className="hidden px-3 py-2 font-mono text-xs text-texto md:table-cell">{r.dni}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorEstado(r.estado)}`}>
                      {r.estado}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorPago(r.pago.estado)}`}>
                      {r.pago.estado === 'no_aplica' ? 'Gratis' : r.pago.estado}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-texto-suave">{r.usado ? 'Sí' : 'No'}</td>
                  <td className="hidden px-3 py-2 text-texto-suave lg:table-cell">
                    {formatearFechaHora(r.fechaRegistro)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="Paginación">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina === 1}
            className="rounded-lg border border-borde px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="px-2 text-sm text-texto-suave">
            Página {pagina} de {paginas}
          </span>
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
            disabled={pagina >= paginas}
            className="rounded-lg border border-borde px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Siguiente
          </button>
        </nav>
      )}
    </div>
  )
}

/** El CSV aplana `pago` a dos columnas; el resto sale del registro tal cual. */
type ColumnaCsv = Exclude<keyof RegistroAdmin, 'pago'> | 'pagoEstado' | 'montoPagado'

const COLUMNAS_CSV: ColumnaCsv[] = [
  'id',
  'eventoNombre',
  'organizadorNombre',
  'nombre',
  'email',
  'dni',
  'telefono',
  'estado',
  'pagoEstado',
  'montoPagado',
  'usado',
  'fechaRegistro',
  'fechaUso',
]

function valorColumna(r: RegistroAdmin, columna: ColumnaCsv): string | number | boolean {
  if (columna === 'pagoEstado') return r.pago.estado
  if (columna === 'montoPagado') return r.pago.montoPagado ?? ''
  const valor = r[columna]
  return valor instanceof Date ? valor.toISOString() : valor ?? ''
}

function colorEstado(estado: RegistroAdmin['estado']): string {
  if (estado === 'aprobado') return 'bg-green-100 text-green-700'
  if (estado === 'rechazado') return 'bg-red-100 text-red-700'
  return 'bg-yellow-100 text-yellow-700'
}

function colorPago(estado: RegistroAdmin['pago']['estado']): string {
  if (estado === 'pagado') return 'bg-green-100 text-green-700'
  if (estado === 'rechazado') return 'bg-red-100 text-red-700'
  if (estado === 'pendiente') return 'bg-yellow-100 text-yellow-700'
  return 'bg-slate-100 text-slate-700'
}

function formatearFechaHora(valor: Date | string): string {
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}