import { useCallback, useEffect, useState } from "react"
import { ConfirmDialog } from "./ConfirmDialog"
import {
  CLOSE_REQUEST_EVENT,
  acknowledgeCloseRequest,
  cancelClose,
  closeApp,
} from "../lib/desktop"

/**
 * Confirms closing the desktop window.
 *
 * The Flask server runs inside the desktop process, so closing the window
 * stops it for every client on the local network. `backend/desktop.py` cancels
 * the close and dispatches `CLOSE_REQUEST_EVENT`; this component turns that
 * into the app's own confirmation dialog.
 *
 * The listener is registered unconditionally: the event only ever fires from
 * the desktop shell, and the bridge helpers are no-ops in a plain browser.
 * Gating on `window.pywebview` would risk missing the event if pywebview
 * injects its object after this effect runs.
 */
export function CloseGuard() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleRequest = () => {
      setOpen(true)
      // Stop the backend from retrying (and eventually closing anyway).
      acknowledgeCloseRequest()
    }

    window.addEventListener(CLOSE_REQUEST_EVENT, handleRequest)
    return () => window.removeEventListener(CLOSE_REQUEST_EVENT, handleRequest)
  }, [])

  const handleConfirm = useCallback(() => {
    // The window is destroyed by the backend; leave the dialog open so the
    // last frame does not flash the app behind it.
    closeApp()
  }, [])

  const handleCancel = useCallback(() => {
    setOpen(false)
    cancelClose()
  }, [])

  return (
    <ConfirmDialog
      open={open}
      title="Stop the server?"
      message="Closing this window stops CHU2CORE. Client computers will no longer be able to browse the catalog or download applications."
      confirmLabel="Stop server and exit"
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )
}
