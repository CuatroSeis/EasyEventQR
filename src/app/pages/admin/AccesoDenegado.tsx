import { salir } from '../../../services/auth'

/**
 * "No sos super-admin" con motivo y salida, en vez de expulsar en silencio.
 * Un rechazo sin motivo ("no tengo permisos") no dice QUÉ falta: claim,
 * variable o sesión. Cada `porQue` de `/api/me` tiene su texto acá.
 */
import { useIdioma } from '../../components/IdiomaContext'
import type { ClaveTexto } from '../../../shared/i18n'

type InfoMotivo = { titulo: ClaveTexto; cuerpo: ClaveTexto; pasos: ClaveTexto[] }

function motivos(): Record<string, InfoMotivo> {
  return {
    'falta-var': {
      titulo: 'adm.den.faltavar.t',
      cuerpo: 'adm.den.faltavar.d',
      pasos: ['adm.den.faltavar.p1', 'adm.den.faltavar.p2', 'adm.den.faltavar.p3'],
    },
    'sin-claim': {
      titulo: 'adm.den.sinclaim.t',
      cuerpo: 'adm.den.sinclaim.d',
      pasos: ['adm.den.sinclaim.p1', 'adm.den.sinclaim.p2', 'adm.den.sinclaim.p3'],
    },
    'error-red': {
      titulo: 'adm.den.red.t',
      cuerpo: 'adm.den.red.d',
      pasos: ['adm.den.red.p1', 'adm.den.red.p2', 'adm.den.red.p3'],
    },
    desconocido: {
      titulo: 'adm.den.desc.t',
      cuerpo: 'adm.den.desc.d',
      pasos: ['adm.den.desc.p1'],
    },
    'sin-sesion': {
      titulo: 'adm.den.sinsesion.t',
      cuerpo: 'adm.den.sinsesion.d',
      pasos: ['adm.den.sinsesion.p1'],
    },
  }
}

export default function AccesoDenegado({
  motivo,
  onSalir,
}: {
  motivo: string | null
  onSalir: () => void
}) {
  const { t } = useIdioma()
  const tabla = motivos()
  const info = tabla[motivo ?? ''] ?? tabla['desconocido']

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-borde bg-superficie p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-2xl leading-none">
            🔒
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-texto">{t(info.titulo)}</h1>
            <p className="mt-1 text-sm text-texto-suave">{t(info.cuerpo)}</p>
          </div>
        </div>

        <ol className="mt-4 space-y-2">
          {info.pasos.map((paso) => (
            <li key={paso} className="flex gap-2 text-sm text-texto">
              <span aria-hidden="true" className="text-texto-suave">
                →
              </span>
              <span>{t(paso)}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-xl bg-superficie-2 p-3">
          <p className="text-sm font-semibold text-texto">{t('adm.den.cambio')}</p>
          <p className="mt-1 text-sm text-texto-suave">{t('adm.den.cambio.d')}</p>
          <button
            type="button"
            onClick={() => void salir()}
            className="mt-3 min-h-[var(--touch-min)] w-full rounded-xl bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario"
          >
            {t('adm.den.resalir')}
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onSalir}
            className="min-h-[var(--touch-min)] flex-1 rounded-xl border border-borde px-4 py-2 text-sm font-medium text-texto"
          >
            {t('adm.volver')}
          </button>
        </div>
      </div>
    </main>
  )
}