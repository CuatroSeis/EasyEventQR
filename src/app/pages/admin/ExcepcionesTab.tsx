import { useCallback, useEffect, useState } from 'react'

import {
  concederExcepcion,
  pedirOrganizadores,
  pedirExcepciones,
  revocarExcepciones,
  type ExcepcionAdmin,
  type OrganizadorAdmin,
} from '../../../services/admin'
import { Cargando } from './Cargando'
import { MensajeError } from './MensajeError'
import { useIdioma } from '../../components/IdiomaContext'

function etiquetasCampo(t: (clave: 'adm.exc.f.banner' | 'adm.exc.f.color' | 'adm.exc.f.logo' | 'adm.exc.f.capacidad') => string): Record<string, string> {
  return {
    bannerPermitido: t('adm.exc.f.banner'),
    colorPersonalizadoPermitido: t('adm.exc.f.color'),
    logoPermitido: t('adm.exc.f.logo'),
    capacidadMaximaPorEvento: t('adm.exc.f.capacidad'),
  }
}

/**
 * Excepciones comerciales por organizador.
 *
 * Una excepción es un `limitesPersonalizacion` que no coincide con el del
 * plan (ver `tieneExcepcion` en el backend). Concederla es un update del
 * documento del organizador, sin deploy: la regla de creación de eventos
 * lee ese mismo campo, así que el efecto es inmediato.
 *
 * El formulario se arma desde los límites del plan del organizador elegido
 * y sólo se envían los campos tocados. Así "darle capacidad 10.000" no
 * reinicia de paso el banner a false.
 */
export function ExcepcionesTab() {
  const { t } = useIdioma()
  const [excepciones, setExcepciones] = useState<ExcepcionAdmin[]>([])
  const [organizadores, setOrganizadores] = useState<OrganizadorAdmin[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [excepcionesResp, organizadoresResp] = await Promise.all([
        pedirExcepciones(),
        pedirOrganizadores(),
      ])
      setExcepciones(excepcionesResp.excepciones)
      setOrganizadores(organizadoresResp.organizadores)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las excepciones.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function revocar(excepcion: ExcepcionAdmin) {
    if (!window.confirm(t('adm.exc.revocar.q', { nombre: excepcion.organizadorNombre, plan: excepcion.plan }))) {
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await revocarExcepciones(excepcion.organizadorId)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revocar.')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return <Cargando etiqueta={t('adm.exc.cargando')} />

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-texto">{t('adm.tabs.exc')}</h1>
          <p className="text-sm text-texto-suave">{t('adm.exc.sub')}</p>
        </div>
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="rounded-lg bg-primario px-3 py-1.5 text-sm font-medium text-sobre-primario"
        >
          {t('adm.exc.conceder')}
        </button>
      </header>

      {error && <MensajeError texto={error} />}

      {excepciones.length === 0 ? (
        <p className="rounded-xl border border-dashed border-borde p-6 text-center text-sm text-texto-suave">
          {t('adm.exc.vacio')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde">
          <table className="w-full text-sm">
            <thead className="bg-superficie text-left text-xs text-texto-suave">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.org')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.plan')}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t('adm.th.excepciones')}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('adm.th.acciones')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {excepciones.map((exc) => (
                <tr key={exc.organizadorId} className="hover:bg-superficie/50">
                  <td className="px-3 py-2">
                    <p className="font-medium text-texto">{exc.organizadorNombre}</p>
                    <p className="text-xs text-texto-suave">{exc.organizadorEmail}</p>
                  </td>
                  <td className="px-3 py-2 text-texto-suave">{exc.plan}</td>
                  <td className="px-3 py-2">
                    <ul className="space-y-0.5 text-xs">
                      {exc.campos.map((campo) => (
                        <li key={campo} className="text-texto">
                          <span className="text-texto-suave">{etiquetasCampo(t)[campo] ?? campo}:</span>{' '}
                          {formatearValor(t, campo, exc.limitesPersonalizacion)}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void revocar(exc)}
                      disabled={guardando}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {t('adm.exc.revocar')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalAbierto && (
        <ModalConceder
          organizadores={organizadores}
          onCerrar={() => setModalAbierto(false)}
          onGuardado={async () => {
            setModalAbierto(false)
            await cargar()
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

function formatearValor(t: (clave: 'adm.exc.permitido' | 'adm.exc.nopermitido') => string, campo: string, limites: ExcepcionAdmin['limitesPersonalizacion']): string {
  if (campo === 'capacidadMaximaPorEvento') return String(limites.capacidadMaximaPorEvento)
  return limites[campo as 'bannerPermitido'] ? t('adm.exc.permitido') : t('adm.exc.nopermitido')
}

function ModalConceder({
  organizadores,
  onCerrar,
  onGuardado,
  onError,
}: {
 organizadores: OrganizadorAdmin[]
  onCerrar: () => void
  onGuardado: () => Promise<void>
  onError: (texto: string) => void
}) {
  const { t } = useIdioma()
  const [uid, setUid] = useState('')
  const [banner, setBanner] = useState(false)
  const [color, setColor] = useState(true)
  const [logo, setLogo] = useState(false)
  const [capacidad, setCapacidad] = useState(100)
  const [guardando, setGuardando] = useState(false)

  const elegido = organizadores.find((o) => o.uid === uid)

  // Al elegir organizador se precargan sus límites actuales: la excepción
  // parte de donde está la cuenta, no de los defaults del formulario.
  function seleccionar(nuevoUid: string) {
    setUid(nuevoUid)
    const org = organizadores.find((o) => o.uid === nuevoUid)
    if (!org) return
    const l = org.limitesPersonalizacion
    setBanner(l.bannerPermitido)
    setColor(l.colorPersonalizadoPermitido)
    setLogo(l.logoPermitido)
    setCapacidad(l.capacidadMaximaPorEvento)
  }

  async function guardar() {
    if (!elegido) return
    setGuardando(true)
    try {
      await concederExcepcion(elegido.uid, {
        bannerPermitido: banner,
        colorPersonalizadoPermitido: color,
        logoPermitido: logo,
        capacidadMaximaPorEvento: capacidad,
      })
      await onGuardado()
    } catch (e) {
      onError(e instanceof Error ? e.message : t('adm.exc.err'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('adm.exc.conceder.b')}
    >
      <div className="w-full max-w-md rounded-xl border border-borde bg-sobre-primario p-4">
        <h2 className="text-base font-bold text-texto">{t('adm.exc.conceder.b')}</h2>

        <label className="mt-3 block text-sm text-texto" htmlFor="organizador-excepcion">
          {t('adm.exc.org')}
        </label>
        <select
          id="organizador-excepcion"
          value={uid}
          onChange={(e) => seleccionar(e.target.value)}
          className="campo mt-1"
        >
          <option value="">{t('adm.exc.elegi')}</option>
          {organizadores.map((o) => (
            <option key={o.uid} value={o.uid}>
              {o.nombre} ({o.plan})
            </option>
          ))}
        </select>

        <fieldset className="mt-3 space-y-2" disabled={!elegido}>
          <legend className="text-sm text-texto-suave">{t('adm.exc.limites')}</legend>
          {(
            [
              [t('adm.exc.f.banner'), banner, setBanner],
              [t('adm.exc.f.color'), color, setColor],
              [t('adm.exc.f.logo'), logo, setLogo],
            ] as const
          ).map(([etiqueta, valor, setter]) => (
            <label key={etiqueta} className="flex items-center gap-2 text-sm text-texto">
              <input type="checkbox" checked={valor} onChange={(e) => setter(e.target.checked)} />
              {etiqueta}
            </label>
          ))}

          <label className="block text-sm text-texto" htmlFor="capacidad-excepcion">
            {t('adm.exc.capmax')}
          </label>
          <input
            id="capacidad-excepcion"
            type="number"
            min={1}
            value={capacidad}
            onChange={(e) => setCapacidad(Number(e.target.value))}
            className="campo mt-1"
          />
        </fieldset>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg border border-borde px-3 py-1.5 text-sm text-texto hover:bg-superficie"
          >
            {t('adm.exc.cancelar')}
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={!elegido || guardando}
            className="rounded-lg bg-primario px-3 py-1.5 text-sm font-medium text-sobre-primario disabled:opacity-50"
          >
            {guardando ? t('adm.exc.guardando') : t('adm.exc.guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}