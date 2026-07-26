// Shared IPC contract between preload.ts (main-world bridge) and
// renderer.ts (consumer). Kept as plain types with no electron import so
// both sides — and the pure status-view.ts formatter — can depend on it.

export interface AppState {
  status: 'idle' | 'syncing' | 'error'
  peerCount: number
  errorMessage?: string
  seedingAllowed: boolean
}

export interface CampvusApi {
  getState (): Promise<AppState>
  // Returns an unsubscribe function.
  onStateChange (handler: (state: AppState) => void): () => void
}
