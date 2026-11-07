import { RefreshIcon } from "./icons"

interface ErrorNoticeProps {
  title: string
  message: string
  /** Rendered as a "Try again" button when provided. */
  onRetry?: () => void
  className?: string
}

/**
 * Inline failure card. Used both for the full-screen "backend unreachable"
 * state and for a failed catalog fetch inside the shell, so every request
 * failure has somewhere to surface.
 */
export function ErrorNotice({ title, message, onRetry, className = "" }: ErrorNoticeProps) {
  return (
    <div className={`card border border-error/40 surface ${className}`}>
      <div className="card-body items-center gap-2 py-10 text-center">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-md text-xs text-base-content/60">{message}</p>
        {onRetry && (
          <button type="button" className="btn btn-sm btn-primary mt-2 gap-2" onClick={onRetry}>
            <RefreshIcon width={14} height={14} />
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
