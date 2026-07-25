import test from 'node:test'
import assert from 'node:assert/strict'
import nacl from 'tweetnacl'
import { signManifest, verifyManifest, hashBuffer } from '../src/engine/crypto-utils'
import { ManifestFields } from '../src/engine/types'

function manifestFields (overrides: Partial<ManifestFields> = {}): ManifestFields {
  return {
    courseId: 'COMSCI214',
    filename: 'slides.pdf',
    hash: hashBuffer(Buffer.from('hello')),
    size: 5,
    timestamp: 1,
    ...overrides
  }
}

test('sign/verify roundtrip succeeds with the correct key', () => {
  const kp = nacl.sign.keyPair()
  const manifest = signManifest(manifestFields(), kp.secretKey)
  assert.equal(verifyManifest(manifest, kp.publicKey), true)
})

test('tamper detection: flipping a signed field fails verification', () => {
  const kp = nacl.sign.keyPair()
  const manifest = signManifest(manifestFields(), kp.secretKey)
  const tampered = { ...manifest, filename: 'slides-tampered.pdf' }
  assert.equal(verifyManifest(tampered, kp.publicKey), false)
})

test('verification fails against the wrong public key', () => {
  const kp = nacl.sign.keyPair()
  const other = nacl.sign.keyPair()
  const manifest = signManifest(manifestFields(), kp.secretKey)
  assert.equal(verifyManifest(manifest, other.publicKey), false)
})

test('verification fails when the signature is missing', () => {
  const kp = nacl.sign.keyPair()
  const manifest = signManifest(manifestFields(), kp.secretKey)
  const { signature, ...withoutSignature } = manifest
  assert.equal(verifyManifest(withoutSignature, kp.publicKey), false)
})
