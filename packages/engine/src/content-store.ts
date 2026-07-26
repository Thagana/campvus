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

export interface ContentStat {
  hash: string
  size: number
  lastAccessMs: number
}

// Bumps a file's mtime to "now" — used as an explicit last-accessed marker
// (not relying on OS atime, which is frequently disabled/imprecise) whenever
// content is served to a peer or freshly written, so eviction preferentially
// removes truly cold files rather than ones just handled.
export function touchContent (contentDir: string, hash: string): void {
  const now = new Date()
  fs.utimesSync(path.join(contentDir, hash), now, now)
}

export function statContent (contentDir: string, hash: string): ContentStat {
  const stat = fs.statSync(path.join(contentDir, hash))
  return { hash, size: stat.size, lastAccessMs: stat.mtimeMs }
}

export function listContentStats (contentDir: string): ContentStat[] {
  return [...listContentHashes(contentDir)].map(hash => statContent(contentDir, hash))
}

export function deleteContent (contentDir: string, hash: string): void {
  fs.rmSync(path.join(contentDir, hash), { force: true })
}
