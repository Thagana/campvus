// Content-addressed blob store — files on disk named by their own hash.
// Unifies what used to be two independent implementations of the same
// concept: watcher.js copying an ingested file into content-store/<hash>,
// and peer-node.js reading/writing swarm-received bytes by hash filename.

const fs = require('fs')
const path = require('path')

function ensureDir (dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function hasContent (contentDir, hash) {
  return fs.existsSync(path.join(contentDir, hash))
}

function readContent (contentDir, hash) {
  return fs.readFileSync(path.join(contentDir, hash))
}

function writeContent (contentDir, hash, buf) {
  ensureDir(contentDir)
  fs.writeFileSync(path.join(contentDir, hash), buf)
}

function listContentHashes (contentDir) {
  ensureDir(contentDir)
  return new Set(fs.readdirSync(contentDir))
}

module.exports = { ensureDir, hasContent, readContent, writeContent, listContentHashes }
