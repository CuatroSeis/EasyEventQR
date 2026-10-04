import { useEffect, useRef } from 'react'

/**
 * Modal de confirmación accesible para acciones destructivas.
 *
 * Reemplaza a `window.confirm`, que en el móvil se ve como un diálogo
 * del sistema, no respeta el tema y no admite explicar consecuencias.
 * Este modal: atrapa el foco, cierra con Escape, anuncia con role=dialog
 * y devuelve el foco al botón que lo abrió.
 */
export default function ConfirmModal({
  titulo,
  mensaje,
  confirmar,
  cancelando,
  enCurso,
  onConfirmar,
  onCerrar,
}: {
  titulo: string
  mensaje: string
  confirmar: string
  cancelando?: string
  enCurso?: string
  onConfirmar: () => void
  onCerrar: () => void
}) {
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const anteriorFoco = useRef<Element | null>(null)

  useEffect(() => {
    anteriorFoco.current = document.activeElement
    cancelarRef.current?.focus()
    function alTeclado(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
      // Trampa de foco mínima: el Tab no se escapa del diálogo.
      if (e.key === 'Tab') {
        const focoables = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button, [role="dialog"] a[href]',
          ),
        ).filter((el) => !el.hasAttribute('disabled'))
        if (focoables.length === 0) return
        const primero = focoables[0]
        const ultimo = focoables[focoables.length - 1]
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault()
          ultimo.focus()
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault()
          primero.focus()
        }
      }
    }
    document.addEventListener('keydown', alTeclado)
    return () => {
      document.removeEventListener('keydown', alTeclado)
      if (anteriorFoco.current instanceof HTMLElement) anteriorFoco.current.focus()
    }
  }, [onCerrar])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-titulo"
        aria-describedby="confirm-mensaje"
        className="w-full max-w-sm rounded-2xl border border-borde bg-superficie p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-titulo" className="text-base font-bold text-texto">
          {titulo}
        </h2>
        <p id="confirm-mensaje" className="mt-1 text-sm text-texto-suave">
          {mensaje}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            ref={cancelarRef}
            type="button"
            onClick={onCerrar}
            className="min-h-11 flex-1 rounded-xl border border-borde px-4 text-sm font-medium text-texto"
          >
            {cancelando ?? 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className="min-h-11 flex-1 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {enCurso ?? confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
