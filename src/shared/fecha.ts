/**
 * Formatea una fecha ISO (string o Date) para mostrarla de forma legible
 * en la UI, usando el locale es-AR (Rioplatense, coincide con el idioma
 * de la app). Ejemplo: "20 nov, 19:00".
 */
export function formatoFecha(fecha?: string | Date): string {
  if (!fecha) return ''
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-AR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}
