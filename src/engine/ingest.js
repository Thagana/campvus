// The shared ingestion pipeline: hash -> dedup check -> sign -> append
// registry -> store bytes. This is the primitive both product modes are
// meant to call — Mode A's LMS watcher adapter reads a file off disk first
// (ingestFile), but a future Mode B direct-upload adapter would receive an
// in-memory buffer straight from an HTTP upload and should call
// ingestBuffer directly, never be forced through a temp file.

const fs = require('fs')
const path = require('path')
const { hashBuffer, signManifest } = require('./crypto-utils')
const { loadRegistry, saveRegistry, findByHashAndCourse } = require('./manifest-store')
const { writeContent } = require('./content-store')
const { loadKeypair } = require('./identity')
const { resolvePaths } = require('../config/paths')

function ingestBuffer ({ courseId, filename, buf, keypair, paths = resolvePaths() }) {
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

function ingestFile ({ courseId, filePath, keypair, paths = resolvePaths() }) {
  const buf = fs.readFileSync(filePath)
  const filename = path.basename(filePath)
  return ingestBuffer({ courseId, filename, buf, keypair, paths })
}

module.exports = { ingestBuffer, ingestFile }
