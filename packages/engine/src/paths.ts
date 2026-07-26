// The shape of where an app's runtime state lives — registry.json,
// content-store/, institution-keys.json. The engine only knows this shape;
// deciding the actual root directory is an app-level concern. Each app
// package computes its own default rootDir and passes the resulting Paths
// into every engine call explicitly — there is no hidden default here,
// because a shared engine used by more than one app (Mode A today, Mode B
// later) cannot assume any single "repo root" file layout on their behalf.

import path from 'path'

export interface Paths {
  rootDir: string
  registryFile: string
  contentStoreDir: string
  keyFile: string
}

export type PathOverrides = Partial<Omit<Paths, 'rootDir'>>

export function resolvePaths (rootDir: string, overrides: PathOverrides = {}): Paths {
  return {
    rootDir,
    registryFile: overrides.registryFile || path.join(rootDir, 'registry.json'),
    contentStoreDir: overrides.contentStoreDir || path.join(rootDir, 'content-store'),
    keyFile: overrides.keyFile || path.join(rootDir, 'institution-keys.json')
  }
}
