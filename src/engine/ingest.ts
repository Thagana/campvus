// The shared ingestion pipeline: hash -> dedup check -> sign -> append
// registry -> store bytes. This is the primitive both product modes are
// meant to call — Mode A's LMS watcher adapter reads a file off disk first
// (ingestFile), but a future Mode B direct-upload adapter would receive an
// in-memory buffer straight from an HTTP upload and should call
// ingestBuffer directly, never be forced through a temp file.

import fs from 'fs'
import path from 'path'
import { hashBuffer, signManifest } from './crypto-utils'
import { loadRegistry, saveRegistry, findByHashAndCourse } from './manifest-store'
import { writeContent } from './content-store'
import { loadKeypair } from './identity'
import { resolvePaths, Paths } from '../config/paths'
import { Keypair, SignedManifest } from './types'

export interface IngestResult {
  manifest: SignedManifest
  deduped: boolean
}

export function ingestBuffer (args: {
  courseId: string
  filename: string
  buf: Buffer
  keypair?: Keypair
  paths?: Paths
}): IngestResult {
  const { courseId, filename, buf, keypair, paths = resolvePaths() } = args
  const hash = hashBuffer(buf)

  const registry = loadRegistry(paths)
  const existing = findByHashAndCourse(registry, hash, courseId)
  if (existing) {
    return { manifest: existing, deduped: true }
  }

  const { secretKey } = keypair || loadKeypair(paths)
  const manifest = signManifest({
    courseId,
    filename,
    hash,
    size: buf.length,
    timestamp: Date.now()
  }, secretKey)

  registry.push(manifest)
  saveRegistry(registry, paths)
  writeContent(paths.contentStoreDir, hash, buf)

  return { manifest, deduped: false }
}

export function ingestFile (args: {
  courseId: string
  filePath: string
  keypair?: Keypair
  paths?: Paths
}): IngestResult {
  const { courseId, filePath, keypair, paths = resolvePaths() } = args
  const buf = fs.readFileSync(filePath)
  const filename = path.basename(filePath)
  return ingestBuffer({ courseId, filename, buf, keypair, paths })
}
