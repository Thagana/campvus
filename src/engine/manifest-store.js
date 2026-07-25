// Flat-file manifest registry — the list of every signed manifest known
// locally. A single JSON array, read-modify-written wholesale. Fine for a
// single-process spike; becomes a real race the moment two writers touch it
// concurrently (e.g. a future Mode B upload path alongside Mode A's watcher)
// — deferred deliberately, not an oversight.

const fs = require('fs')
const { resolvePaths } = require('../config/paths')

function loadRegistry (paths = resolvePaths()) {
  if (!fs.existsSync(paths.registryFile)) return []
  return JSON.parse(fs.readFileSync(paths.registryFile, 'utf8'))
}

function saveRegistry (registry, paths = resolvePaths()) {
  fs.writeFileSync(paths.registryFile, JSON.stringify(registry, null, 2))
}

function findByHashAndCourse (registry, hash, courseId) {
  return registry.find(m => m.hash === hash && m.courseId === courseId)
}

module.exports = { loadRegistry, saveRegistry, findByHashAndCourse }
