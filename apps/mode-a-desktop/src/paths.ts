// This app's runtime state (registry.json, institution-keys.json,
// content-store/) lives in Electron's per-user data directory — not next to
// the installed app code, which may not be writable and is wiped on
// reinstall/update.

import { app } from 'electron'
import { resolvePaths, Paths } from '@campvus/engine'

export function getPaths (): Paths {
  return resolvePaths(app.getPath('userData'))
}
