import { useEffect, useRef } from "react"

interface ConfirmDialogProps {
  /** Whether the dialog is on screen. The parent owns this flag. */
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  /** Shows a spinner on the confirm button and blocks both buttons. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation prompt built on the native `<dialog>` element.
 *
 * `window.confirm` is unreliable inside pywebview's WebView2 renderer, so the
 * modal is a real dialog: the browser handles focus trapping, the backdrop and
 * the Escape key, and `showModal()` keeps the rest of the page inert.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  // Mirror the `open` prop onto the element. `showModal()` is imperative, so
  // the dialog cannot be driven by rendering alone.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="modal"
      // Escape fires `cancel`; route it through the parent so its state stays
      // the single source of truth for whether the dialog is open.
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onCancel()
      }}
      // Fires after `close()`, including the programmatic close above. Only
      // report it when the parent still believes the dialog is open.
      onClose={() => {
        if (open) onCancel()
      }}
    >
      <div className="modal-box">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="py-4 text-sm text-base-content/70">{message}</p>
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-error gap-2"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <span className="loading loading-spinner loading-xs" />}
            {confirmLabel}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onCancel} disabled={busy}>
          close
        </button>
      </form>
    </dialog>
  )
}
