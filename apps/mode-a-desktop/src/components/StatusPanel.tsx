import { PauseCircle, ArrowsClockwise, WarningCircle, type Icon } from '@phosphor-icons/react'
import { describeState } from '../status-view'
import type { AppState } from '../preload-api'

const STATUS_ICON: Record<AppState['status'], Icon> = {
  idle: PauseCircle,
  syncing: ArrowsClockwise,
  error: WarningCircle
}

export function StatusPanel ({ state }: { state: AppState }) {
  const view = describeState(state)
  const StatusIcon = STATUS_ICON[state.status]

  return (
    <section>
      <section className="card status-card">
        <StatusIcon className="status-icon" data-status={state.status} aria-hidden />
        <h1>{view.statusLabel}</h1>
        <p className="muted">{view.statusDetail}</p>
      </section>

      {view.errorMessage !== undefined && (
        <section className="error-banner">
          <WarningCircle aria-hidden />
          <span>{view.errorMessage}</span>
        </section>
      )}

      <section className="detail-list">
        <div className="detail-row">
          <span className="muted">Peers connected</span>
          <span className="detail-value">{view.peerCountLabel}</span>
        </div>
        <div className="detail-row">
          <span className="muted">Seeding</span>
          <span className={`detail-value${state.seedingAllowed ? ' positive' : ''}`}>{view.seedingLabel}</span>
        </div>
      </section>
    </section>
  )
}
