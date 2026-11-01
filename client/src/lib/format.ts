/**
 * Formats a byte count into a short human-readable string.
 * Returns "—" for missing or non-finite values so tables stay aligned.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const decimals = value >= 100 || unit === 0 ? 0 : 1
  return `${value.toFixed(decimals)} ${units[unit]}`
}

/**
 * Formats a percentage from a byte pair, clamped to 0–100.
 */
export function formatPercent(received: number, total: number): string {
  if (total <= 0) return "0%"
  const ratio = Math.min(1, Math.max(0, received / total))
  return `${Math.round(ratio * 100)}%`
}

/**
 * Renders an ISO timestamp as a short relative age ("just now", "3h ago").
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return "—"

  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return "just now"

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`

  return new Date(iso).toISOString().slice(0, 10)
}
