export interface LoginItemSettings {
  openAtLogin: boolean
  openAsHidden: boolean
}

export type SetLoginItemSettings = (settings: LoginItemSettings) => void

// ADR-0003: the agent launches at login straight into tray-only mode, no
// window until the user opens it — so login itself must start hidden.
export function configureAutoLaunch (setLoginItemSettings: SetLoginItemSettings): void {
  setLoginItemSettings({ openAtLogin: true, openAsHidden: true })
}
