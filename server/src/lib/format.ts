/** Display formatting helpers for transfer sizes and timestamps. */

/** Format a byte count as a compact human-readable size, e.g. "1.4 GB". */
export function formatBytes(bytes: number): string {
  const value = Math.max(0, bytes)
  if (value < 1024) return `${Math.round(value)} B`

  const units = ["KB", "MB", "GB", "TB"]
  let scaled = value / 1024
  let unitIndex = 0
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024
    unitIndex += 1
  }
  return `${scaled.toFixed(1)} ${units[unitIndex]}`
}

/**
 * Percentage of a transfer that has been streamed, clamped to 0-100.
 * Returns 0 when the total size is unknown, so the bar stays empty rather
 * than jumping to a misleading value.
 */
export function formatPercent(processed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  const ratio = (processed / total) * 100
  return Math.min(100, Math.max(0, Math.round(ratio)))
}

/** Format an ISO timestamp as a local clock time, e.g. "10:42". */
export function formatClock(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

/** Format an ISO timestamp as a short relative label, e.g. "2 min ago". */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—"
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) return "—"

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return "just now"

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`

  const days = Math.floor(hours / 24)
  return `${days} d ago`
}
