import { useEffect, useRef } from "react"

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Small daisyUI `<dialog>` confirmation prompt.
 *
 * The native dialog element gives us focus trapping, ESC handling and a
 * backdrop for free; React only drives `showModal()` / `close()`.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        // ESC: keep React state in sync instead of closing silently.
        event.preventDefault()
        if (!busy) onCancel()
      }}
    >
      <div className="modal-box">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="py-4 text-sm text-base-content/70">{message}</p>

        {error && (
          <div role="alert" className="alert alert-error mb-4">
            <span className="text-sm">{error}</span>
          </div>
        )}

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
