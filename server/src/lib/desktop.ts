/**
 * Bridge to the PyWebView desktop shell.
 *
 * The desktop window is the only place the server runs, so closing it stops
 * the server for every client. `backend/desktop.py` cancels the close and
 * dispatches `CLOSE_REQUEST_EVENT`; this module lets the UI answer.
 *
 * `window.pywebview` only exists inside the desktop shell. Under `npm run dev`
 * (or in a plain browser) it is undefined, so every helper here is a no-op and
 * the confirmation dialog never appears.
 */

/** Must match `CLOSE_REQUEST_EVENT` in `backend/desktop.py`. */
export const CLOSE_REQUEST_EVENT = "pas:close-requested"

/** Methods exposed by `DesktopApi` in `backend/desktop.py`. */
interface DesktopApi {
  /** Confirm the close: the window is destroyed and the server stops. */
  close_app: () => Promise<unknown>
  /** Dismiss the dialog; the window stays open. */
  cancel_close: () => Promise<unknown>
  /** Tell the backend the dialog is on screen, so it stops retrying. */
  acknowledge_close_request: () => Promise<unknown>
}

declare global {
  interface Window {
    pywebview?: { api?: DesktopApi }
  }
}

/** The desktop bridge, or `undefined` when running in a browser. */
function desktopApi(): DesktopApi | undefined {
  return window.pywebview?.api
}

/**
 * Report that the confirmation dialog is visible.
 *
 * The backend retries the request once and then closes the window anyway, so
 * acknowledging promptly is what keeps a slow first paint from skipping the
 * confirmation entirely.
 */
export function acknowledgeCloseRequest(): void {
  void desktopApi()?.acknowledge_close_request().catch(() => {
    // The window is going away; nothing useful to report.
  })
}

/** Confirm the close. The window disappears and the server stops. */
export function closeApp(): void {
  void desktopApi()?.close_app().catch(() => {
    // The window is going away; nothing useful to report.
  })
}

/** Dismiss the close request and keep the server running. */
export function cancelClose(): void {
  void desktopApi()?.cancel_close().catch(() => {
    // The window is going away; nothing useful to report.
  })
}
