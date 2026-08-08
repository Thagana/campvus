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

export interface LoginModeBArgs {
  modeBUrl: string
  email: string
  password: string
}

// Distinct from SaveConfigResult: a login attempt fails for reasons that
// aren't per-field validation (bad credentials, unreachable server, no
// enrolled courses yet) — a single error string reads better than a fake
// field-shaped error for those.
export type LoginModeBResult =
  | { ok: true, config: PartialDesktopConfig }
  | { ok: false, error: string }

export interface CampvusApi {
  getState (): Promise<AppState>
  // Returns an unsubscribe function.
  onStateChange (handler: (state: AppState) => void): () => void
  getConfig (): Promise<PartialDesktopConfig>
  saveConfig (config: PartialDesktopConfig): Promise<SaveConfigResult>
  // Signs in against a live apps/mode-b-api instance and auto-fills
  // courseIds/institutionPublicKeyHex/originUrl/manifestOriginUrl from it —
  // closes Open Question #9(a) (docs/ARCHITECTURE.md) on the desktop side.
  loginModeB (args: LoginModeBArgs): Promise<LoginModeBResult>
}

export type { DesktopConfig, PartialDesktopConfig }
