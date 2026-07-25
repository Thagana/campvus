// Single source of truth for where the spike's on-disk state lives.
//
// Every engine module takes a `paths` object (defaulting to resolvePaths())
// instead of independently computing path.join(__dirname, '..', X) the way
// identity.js/watcher.js/peer-node.js each used to. This is what lets tests
// point at a disposable tmp directory instead of the real registry.json /
// content-store / institution-keys.json.

const path = require('path')

const REPO_ROOT = path.join(__dirname, '..', '..')

function resolvePaths (overrides = {}) {
  const rootDir = overrides.rootDir || REPO_ROOT
  return {
    rootDir,
    registryFile: overrides.registryFile || path.join(rootDir, 'registry.json'),
    contentStoreDir: overrides.contentStoreDir || path.join(rootDir, 'content-store'),
    keyFile: overrides.keyFile || path.join(rootDir, 'institution-keys.json')
  }
}

module.exports = { resolvePaths, REPO_ROOT }
