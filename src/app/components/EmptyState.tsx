import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Estado vacío con ayuda y CTA opcional.
 *
 * Un listado vacío sin explicación se lee como "la app no funciona".
 * Este componente dice qué falta, por qué importa y a dónde ir, en ese
 * orden. Se usa en Panel, PanelRegistros y donde aparezca un listado.
 */
export default function EmptyState({
  titulo,
  ayuda,
  cta,
  to,
}: {
  titulo: string
  ayuda: string
  cta?: string
  to?: string
}): ReactNode {
  return (
    <div className="ee-tarjeta-premium p-6 text-center ee-sans">
      <p className="text-sm font-medium text-texto">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-ee-texto-suave">{ayuda}</p>
      {cta && to ? (
        <Link
          to={to}
          className="ee-boton-primario ee-foco mt-4 inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold"
        >
          {cta}
        </Link>
      ) : null}
    </div>
  )
}
