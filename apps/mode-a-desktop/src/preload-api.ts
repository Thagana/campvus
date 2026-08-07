// Shared IPC contract between preload.ts (main-world bridge) and
// renderer.ts (consumer). Kept as plain types with no electron import so
// both sides — and the pure status-view.ts formatter — can depend on it.

import type { DesktopConfig, PartialDesktopConfig } from './config-store'

export interface AppState {
  status: 'idle' | 'syncing' | 'error'
  peerCount: number
  errorMessage?: string
  seedingAllowed: boolean
  configured: boolean
}

export interface SaveConfigResult {
  ok: boolean
  errors?: Array<{ field: string, message: string }>
}

export interface CampvusApi {
  getState (): Promise<AppState>
  // Returns an unsubscribe function.
  onStateChange (handler: (state: AppState) => void): () => void
  getConfig (): Promise<PartialDesktopConfig>
  saveConfig (config: PartialDesktopConfig): Promise<SaveConfigResult>
}

export type { DesktopConfig, PartialDesktopConfig }
