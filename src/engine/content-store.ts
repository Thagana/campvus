// Content-addressed blob store — files on disk named by their own hash.
// Unifies what used to be two independent implementations of the same
// concept: watcher.js copying an ingested file into content-store/<hash>,
// and peer-node.js reading/writing swarm-received bytes by hash filename.

import fs from 'fs'
import path from 'path'

export function ensureDir (dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function hasContent (contentDir: string, hash: string): boolean {
  return fs.existsSync(path.join(contentDir, hash))
}

export function readContent (contentDir: string, hash: string): Buffer {
  return fs.readFileSync(path.join(contentDir, hash))
}

export function writeContent (contentDir: string, hash: string, buf: Uint8Array): void {
  ensureDir(contentDir)
  fs.writeFileSync(path.join(contentDir, hash), buf)
}

export function listContentHashes (contentDir: string): Set<string> {
  ensureDir(contentDir)
  return new Set(fs.readdirSync(contentDir))
}
