// Pure P2P gossip/verify/seed protocol logic, extracted from what used to
// be peer-node.js's inline handleMessage. No fs/Hyperswarm access here —
// plain data in, plain decisions out — which is what makes this testable
// without a live swarm connection. swarm-node.js is the I/O shell that
// wires these decisions to Hyperswarm, the manifest store, and the content
// store.

const { hashBuffer, verifyManifest } = require('./crypto-utils')

function planManifestsAnnouncement (knownManifests) {
  return { type: 'manifests', items: [...knownManifests.values()] }
}

// Merges verified, in-course manifests from an incoming `manifests` message
// into `knownManifests` (mutated in place — it's the peer's running session
// state, analogous to a small in-memory database), then decides what's
// still missing locally.
function applyManifestsMessage ({ msg, courseId, publicKeyHex, knownManifests, localHashes }) {
  const learned = []
  const rejected = []

  for (const m of msg.items) {
    if (m.courseId !== courseId) continue
    if (knownManifests.has(m.hash)) continue
    if (!verifyManifest(m, publicKeyHex)) {
      rejected.push({ filename: m.filename, reason: 'invalid-signature' })
      continue
    }
    knownManifests.set(m.hash, m)
    learned.push(m)
  }

  const toRequest = []
  for (const m of knownManifests.values()) {
    if (!localHashes.has(m.hash)) toRequest.push(m)
  }

  return { learned, rejected, toRequest }
}

function planWantResponse ({ msg, localHashes }) {
  return localHashes.has(msg.hash) ? { hash: msg.hash } : null
}

// Decides whether to accept received file bytes: hash must match what was
// claimed, and there must be a known verified manifest for that hash.
function applyDataMessage ({ msg, knownManifests }) {
  const bytes = Buffer.from(msg.content, 'base64')
  const actualHash = hashBuffer(bytes)
  if (actualHash !== msg.hash) {
    return { accept: false, reason: 'hash-mismatch', expectedHash: msg.hash, actualHash }
  }

  const manifest = knownManifests.get(msg.hash)
  if (!manifest) {
    return { accept: false, reason: 'no-manifest' }
  }

  return { accept: true, manifest, bytes }
}

module.exports = { planManifestsAnnouncement, applyManifestsMessage, planWantResponse, applyDataMessage }
