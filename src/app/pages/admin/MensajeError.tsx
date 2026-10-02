/**
 * Aviso de error del panel.
 *
 * Va con `role="alert"` para que un lector de pantalla lo anuncie apenas
 * aparece. Importarlo desde `DashboardTab` funcionaría, pero ataría las seis
 * tabs a un módulo que no tiene nada que ver con errores.
 */
export function MensajeError({ texto }: { texto: string }) {
  return (
    <p role="alert" className="rounded-xl border border-borde bg-superficie p-3 text-sm text-texto">
      {texto}
    </p>
  )
}