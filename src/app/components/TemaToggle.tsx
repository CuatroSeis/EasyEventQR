import { useState } from 'react'

import { aplicarTemaApp, leerTema, type TemaApp } from '../../shared/tema'
import { useIdioma } from './IdiomaContext'

/** Toggle claro/oscuro. Default: lo que diga el sistema; persiste en localStorage. */
export default function TemaToggle() {
  const { t } = useIdioma()
  const [tema, setTema] = useState<TemaApp>(() => leerTema())

  function cambiar() {
    const siguiente: TemaApp = tema === 'claro' ? 'oscuro' : 'claro'
    setTema(siguiente)
    aplicarTemaApp(siguiente)
  }

  return (
    <button
      type="button"
      onClick={cambiar}
      aria-label={tema === 'claro' ? t('tema.claro') : t('tema.oscuro')}
      aria-pressed={tema === 'oscuro'}
      className="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-lg border border-borde px-3 text-sm text-texto hover:bg-superficie"
    >
      <span aria-hidden="true">
        {tema === 'claro' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        )}
      </span>
    </button>
  )
}
