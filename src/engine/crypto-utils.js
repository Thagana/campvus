// Content hashing + manifest signing/verification.
//
// The manifest — not the raw file — is what gets signed. Any peer that
// receives file bytes over the swarm re-hashes them locally and checks
// that hash against the signed manifest before accepting the file.
// This is the entire trust model: one known signer (the institution),
// content-addressed by hash, no quorum or reputation needed.

const crypto = require('crypto')
const nacl = require('tweetnacl')
const b4a = require('b4a')

function hashBuffer (buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

// Canonical, deterministic string form of a manifest's signed fields.
// Key order matters for signature verification to be reproducible.
function canonicalManifestString (m) {
  return JSON.stringify({
    courseId: m.courseId,
    filename: m.filename,
    hash: m.hash,
    size: m.size,
    timestamp: m.timestamp
  })
}

function signManifest (manifestFields, secretKey) {
  const message = b4a.from(canonicalManifestString(manifestFields), 'utf8')
  const signature = nacl.sign.detached(message, secretKey)
  return {
    ...manifestFields,
    signature: b4a.toString(signature, 'hex')
  }
}

function verifyManifest (manifest, publicKey) {
  const { signature, ...fields } = manifest
  if (!signature) return false
  const message = b4a.from(canonicalManifestString(fields), 'utf8')
  const sig = b4a.from(signature, 'hex')
  const pub = typeof publicKey === 'string' ? b4a.from(publicKey, 'hex') : publicKey
  try {
    return nacl.sign.detached.verify(message, sig, pub)
  } catch (err) {
    return false
  }
}

module.exports = { hashBuffer, signManifest, verifyManifest, canonicalManifestString }
