// This app's runtime state (registry.json, institution-keys.json,
// content-store/) lives alongside its own code, not at the workspace root
// — each app owns its own data, since a future Mode B app will have an
// entirely different data model (real DB / object storage).

import path from 'path'
import { resolvePaths, Paths } from '@campvus/engine'

const APP_ROOT = path.join(__dirname, '..')

export function getPaths (): Paths {
  return resolvePaths(APP_ROOT)
}
