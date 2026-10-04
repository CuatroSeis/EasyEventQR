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
    <div className="rounded-xl border border-dashed border-borde p-6 text-center">
      <p className="text-sm font-medium text-texto">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-texto-suave">{ayuda}</p>
      {cta && to ? (
        <Link
          to={to}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primario px-5 text-sm font-semibold text-sobre-primario"
        >
          {cta}
        </Link>
      ) : null}
    </div>
  )
}
