import type { AppState } from './preload-api'

// Pure formatting of AppState into display strings — kept separate from
// renderer.ts's DOM wiring so it's testable without a DOM/Electron runtime.

export interface StatusView {
  statusLabel: string
  statusDetail: string
  peerCountLabel: string
  seedingLabel: string
  errorMessage?: string
}

const STATUS_LABELS: Record<AppState['status'], string> = {
  idle: 'Idle',
  syncing: 'Syncing',
  error: 'Error'
}

export function describeState (state: AppState): StatusView {
  const peerNoun = state.peerCount === 1 ? 'peer' : 'peers'
  // Errors can surface with an empty message (e.g. a bare `new Error()`
  // from a lower layer) — treat that the same as no message at all rather
  // than rendering a red banner with nothing in it.
  const errorMessage = state.errorMessage?.trim() || undefined

  return {
    statusLabel: STATUS_LABELS[state.status],
    statusDetail: state.status === 'error'
      ? (errorMessage ?? 'Something went wrong')
      : `${state.peerCount} ${peerNoun} connected`,
    peerCountLabel: String(state.peerCount),
    seedingLabel: state.seedingAllowed ? 'Allowed' : 'Paused (metered connection)',
    errorMessage: state.status === 'error' ? errorMessage : undefined
  }
}
