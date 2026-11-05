import { useEffect, useRef, useState } from "react"
import { onApiError, type ApiError } from "../api/client"
import { AlertIcon } from "./icons"

/** A failed request currently shown in the corner stack. */
interface Notification {
  id: number
  message: string
  status: number
  /** How many times this exact message was reported while it was visible. */
  count: number
}

/** Identical messages inside this window are merged into one entry. */
const DEDUPE_WINDOW_MS = 4000

/** How long a toast stays on screen before dismissing itself. */
const AUTO_DISMISS_MS = 6000

/**
 * Global error toast.
 *
 * `request()` in `api/client.ts` emits every `ApiError`, so mounting this once
 * in the shell guarantees a failed request is never silent — including
 * background refreshes that deliberately swallow the rejection. Views keep
 * their own inline errors, which carry the field-level context the toast
 * cannot.
 */
export function Toaster() {
  const [items, setItems] = useState<Notification[]>([])
  const nextId = useRef(1)
  const lastSeen = useRef(new Map<string, number>())

  useEffect(() => {
    const dismiss = (id: number) => {
      setItems((current) => current.filter((item) => item.id !== id))
    }

    const timers = new Map<number, number>()

    const push = (error: ApiError) => {
      const now = Date.now()
      const previous = lastSeen.current.get(error.message)
      if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) {
        // Same failure already on screen: count it instead of stacking.
        setItems((current) =>
          current.map((item) =>
            item.message === error.message ? { ...item, count: item.count + 1 } : item,
          ),
        )
        lastSeen.current.set(error.message, now)
        return
      }

      lastSeen.current.set(error.message, now)
      const id = nextId.current++
      setItems((current) => [
        ...current,
        { id, message: error.message, status: error.status, count: 1 },
      ])

      timers.set(
        id,
        window.setTimeout(() => {
          timers.delete(id)
          dismiss(id)
        }, AUTO_DISMISS_MS),
      )
    }

    const unsubscribe = onApiError(push)
    return () => {
      unsubscribe()
      for (const timer of timers.values()) window.clearTimeout(timer)
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="toast toast-end toast-bottom z-50">
      {items.map((item) => (
        <div
          key={item.id}
          role="alert"
          className="alert alert-error shadow-lg"
        >
          <AlertIcon className="size-5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {item.message}
              {item.count > 1 && (
                <span className="ml-2 opacity-70">×{item.count}</span>
              )}
            </p>
            {item.status > 0 && (
              <p className="text-xs opacity-70">
                Request failed with status {item.status}.
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            aria-label="Dismiss notification"
            onClick={() =>
              setItems((current) => current.filter((row) => row.id !== item.id))
            }
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}
