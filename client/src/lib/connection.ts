import type { ConnectionState } from "../types"

/** How a connection state is presented in the navbar, footer and Settings. */
export interface ConnectionDisplay {
  /** Short label for the status pill. */
  label: string
  /** daisyUI `status-*` modifier for the dot. */
  dot: string
  /** daisyUI `badge-*` modifier for the pill. */
  badge: string
  /** One-line explanation shown in Settings. */
  detail: string
}

const displays: Record<ConnectionState, ConnectionDisplay> = {
  connected: {
    label: "Connected",
    dot: "status-success",
    badge: "badge-success",
    detail: "The server answered the last catalog request.",
  },
  unreachable: {
    label: "Server unreachable",
    dot: "status-error",
    badge: "badge-error",
    detail: "The address is set, but the server did not answer. Check that it is running.",
  },
  unconfigured: {
    label: "No server set",
    dot: "status-warning",
    badge: "badge-warning",
    detail: "No server address is stored yet. Discover one on the LAN or enter it below.",
  },
}

/** Presentation metadata for a {@link ConnectionState}. */
export function describeConnection(state: ConnectionState): ConnectionDisplay {
  return displays[state]
}
