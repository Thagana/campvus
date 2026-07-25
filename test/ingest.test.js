const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const os = require('os')
const nacl = require('tweetnacl')
const { resolvePaths } = require('../src/config/paths')
const { ingestBuffer } = require('../src/engine/ingest')
const { readContent } = require('../src/engine/content-store')

function tmpPaths () {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campvus-test-'))
  return resolvePaths({ rootDir })
}

test('ingestBuffer signs, stores, and registers a new file', () => {
  const paths = tmpPaths()
  const keypair = nacl.sign.keyPair()
  const buf = Buffer.from('week 6 slides')

  const { manifest, deduped } = ingestBuffer({ courseId: 'COMSCI214', filename: 'slides.pdf', buf, keypair, paths })

  assert.equal(deduped, false)
  assert.equal(manifest.courseId, 'COMSCI214')
  assert.equal(manifest.filename, 'slides.pdf')
  assert.equal(manifest.size, buf.length)
  assert.ok(manifest.signature)
  assert.deepEqual(readContent(paths.contentStoreDir, manifest.hash), buf)
})

test('ingestBuffer dedups identical content for the same course', () => {
  const paths = tmpPaths()
  const keypair = nacl.sign.keyPair()
  const buf = Buffer.from('week 6 slides')

  const first = ingestBuffer({ courseId: 'COMSCI214', filename: 'slides.pdf', buf, keypair, paths })
  const second = ingestBuffer({ courseId: 'COMSCI214', filename: 'slides-reupload.pdf', buf, keypair, paths })

  assert.equal(second.deduped, true)
  assert.equal(second.manifest.hash, first.manifest.hash)
  // Dedup returns the originally-registered manifest, it does not re-sign.
  assert.equal(second.manifest.filename, first.manifest.filename)
})

test('ingestBuffer treats identical content as new for a different course', () => {
  const paths = tmpPaths()
  const keypair = nacl.sign.keyPair()
  const buf = Buffer.from('shared reading')

  ingestBuffer({ courseId: 'COMSCI214', filename: 'reading.pdf', buf, keypair, paths })
  const other = ingestBuffer({ courseId: 'MATH101', filename: 'reading.pdf', buf, keypair, paths })

  assert.equal(other.deduped, false)
  assert.equal(other.manifest.courseId, 'MATH101')
})
