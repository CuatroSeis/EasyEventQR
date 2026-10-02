/**
 * Skeleton de carga de las tabs del panel.
 *
 * Va en un archivo propio porque las seis tabs lo repiten y cada una
 * definiendo el suyo terminaría en seis copias que se van desincronizando.
 */
export function Cargando({ etiqueta = 'Cargando…' }: { etiqueta?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl border border-borde" />
      ))}
      <span className="sr-only">{etiqueta}</span>
    </div>
  )
}