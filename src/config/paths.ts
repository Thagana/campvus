// Single source of truth for where the spike's on-disk state lives.
//
// Every engine module takes a `paths` object (defaulting to resolvePaths())
// instead of independently computing path.join(__dirname, '..', X) the way
// identity.ts/watcher.ts/peer-node.ts each used to. This is what lets tests
// point at a disposable tmp directory instead of the real registry.json /
// content-store / institution-keys.json.

import path from 'path'

const REPO_ROOT = path.join(__dirname, '..', '..')

export interface Paths {
  rootDir: string
  registryFile: string
  contentStoreDir: string
  keyFile: string
}

export type PathOverrides = Partial<Paths>

export function resolvePaths (overrides: PathOverrides = {}): Paths {
  const rootDir = overrides.rootDir || REPO_ROOT
  return {
    rootDir,
    registryFile: overrides.registryFile || path.join(rootDir, 'registry.json'),
    contentStoreDir: overrides.contentStoreDir || path.join(rootDir, 'content-store'),
    keyFile: overrides.keyFile || path.join(rootDir, 'institution-keys.json')
  }
}

export { REPO_ROOT }
