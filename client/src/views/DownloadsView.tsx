import { CheckIcon } from "../components/icons"

/**
 * Download queue placeholder.
 *
 * The client backend installs synchronously today, so there is no transfer
 * record to show. A real job shape arrives with the background-install work;
 * until then this screen explains the current behaviour instead of inventing
 * progress data.
 */
export function DownloadsView() {
  return (
    <div className="flex flex-col gap-5">
      <div className="card border border-base-300 bg-base-200">
        <div className="card-body gap-4">
          <h2 className="card-title text-sm">Active transfers</h2>
          <div className="flex items-center gap-2 rounded-field bg-base-100 px-3 py-4 text-xs text-base-content/60">
            <CheckIcon width={16} height={16} className="text-success" />
            Nothing is downloading right now.
          </div>
        </div>
      </div>

      <div className="card border border-dashed border-base-300 bg-base-200">
        <div className="card-body items-center gap-2 py-12 text-center">
          <p className="text-sm font-medium">Transfer history is not available yet</p>
          <p className="max-w-md text-xs text-base-content/60">
            Installs currently run to completion before the request returns, so there is no
            progress to report. Background installs with live progress are coming next.
          </p>
        </div>
      </div>
    </div>
  )
}
