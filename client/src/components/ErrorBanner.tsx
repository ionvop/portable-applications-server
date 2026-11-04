import { RefreshIcon } from "./icons"

interface ErrorBannerProps {
  /** The failure text, already human-readable (`ApiError.message`). */
  message: string
  /** Hides the banner. The parent owns the state. */
  onDismiss: () => void
  /** Rendered as a "Try again" button when provided. */
  onRetry?: () => void
}

/**
 * Shell-level failure banner.
 *
 * Sits directly under the navbar so every screen inherits it: a request that
 * fails while the user is on the Library or Downloads screen still has
 * somewhere to surface. It stays until dismissed rather than auto-hiding,
 * because a message that vanishes mid-download is a message the user misses.
 */
export function ErrorBanner({ message, onDismiss, onRetry }: ErrorBannerProps) {
  return (
    <div role="alert" className="alert alert-error shrink-0 rounded-none px-6 py-2">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3">
        <span className="text-sm">{message}</span>
        <div className="ml-auto flex items-center gap-2">
          {onRetry && (
            <button type="button" className="btn btn-xs gap-1" onClick={onRetry}>
              <RefreshIcon width={12} height={12} />
              Try again
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              width={14}
              height={14}
              aria-hidden
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
