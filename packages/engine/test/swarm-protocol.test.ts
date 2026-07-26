import test from 'node:test'
import assert from 'node:assert/strict'
import nacl from 'tweetnacl'
import { signManifest, hashBuffer } from '../src/crypto-utils'
import {
  planManifestsAnnouncement,
  applyManifestsMessage,
  planWantResponse,
  applyDataMessage
} from '../src/swarm-protocol'
import { ManifestFields, SignedManifest, Keypair } from '../src/types'

function makeManifest (keypair: Keypair, overrides: Partial<ManifestFields> = {}): SignedManifest {
  return signManifest({
    courseId: 'COMSCI214',
    filename: 'slides.pdf',
    hash: hashBuffer(Buffer.from('content')),
    size: 7,
    timestamp: 1,
    ...overrides
  }, keypair.secretKey)
}

function hex (publicKey: Uint8Array): string {
  return Buffer.from(publicKey).toString('hex')
}

test('applyManifestsMessage learns new verified manifests and requests missing content', () => {
  const keypair = nacl.sign.keyPair()
  const manifest = makeManifest(keypair)
  const knownManifests = new Map<string, SignedManifest>()
  const localHashes = new Set<string>()

  const result = applyManifestsMessage({
    msg: { type: 'manifests', items: [manifest] },
    courseId: 'COMSCI214',
    publicKeyHex: hex(keypair.publicKey),
    knownManifests,
    localHashes
  })

  assert.equal(result.learned.length, 1)
  assert.equal(result.rejected.length, 0)
  assert.equal(result.toRequest.length, 1)
  assert.equal(knownManifests.has(manifest.hash), true)
})

test('applyManifestsMessage ignores manifests for other courses', () => {
  const keypair = nacl.sign.keyPair()
  const manifest = makeManifest(keypair, { courseId: 'MATH101' })
  const knownManifests = new Map<string, SignedManifest>()
  const localHashes = new Set<string>()

  const result = applyManifestsMessage({
    msg: { type: 'manifests', items: [manifest] },
    courseId: 'COMSCI214',
    publicKeyHex: hex(keypair.publicKey),
    knownManifests,
    localHashes
  })

  assert.equal(result.learned.length, 0)
  assert.equal(knownManifests.size, 0)
})

test('applyManifestsMessage rejects manifests with an invalid signature', () => {
  const keypair = nacl.sign.keyPair()
  const otherKeypair = nacl.sign.keyPair()
  const manifest = makeManifest(otherKeypair)
  const knownManifests = new Map<string, SignedManifest>()
  const localHashes = new Set<string>()

  const result = applyManifestsMessage({
    msg: { type: 'manifests', items: [manifest] },
    courseId: 'COMSCI214',
    publicKeyHex: hex(keypair.publicKey),
    knownManifests,
    localHashes
  })

  assert.equal(result.learned.length, 0)
  assert.equal(result.rejected.length, 1)
  assert.equal(knownManifests.size, 0)
})

test('applyManifestsMessage does not re-request content already on disk', () => {
  const keypair = nacl.sign.keyPair()
  const manifest = makeManifest(keypair)
  const knownManifests = new Map<string, SignedManifest>()
  const localHashes = new Set<string>([manifest.hash])

  const result = applyManifestsMessage({
    msg: { type: 'manifests', items: [manifest] },
    courseId: 'COMSCI214',
    publicKeyHex: hex(keypair.publicKey),
    knownManifests,
    localHashes
  })

  assert.equal(result.toRequest.length, 0)
})

test('planWantResponse only responds when content is available locally', () => {
  assert.deepEqual(planWantResponse({ msg: { type: 'want', hash: 'abc' }, localHashes: new Set(['abc']) }), { hash: 'abc' })
  assert.equal(planWantResponse({ msg: { type: 'want', hash: 'missing' }, localHashes: new Set(['abc']) }), null)
})

test('applyDataMessage accepts bytes matching a known manifest hash', () => {
  const bytes = Buffer.from('content')
  const hash = hashBuffer(bytes)
  const manifest = makeManifest(nacl.sign.keyPair(), { hash })
  const knownManifests = new Map<string, SignedManifest>([[hash, manifest]])

  const result = applyDataMessage({
    msg: { type: 'data', hash, content: bytes.toString('base64') },
    knownManifests
  })

  assert.equal(result.accept, true)
  assert.ok(result.accept && result.bytes.equals(bytes))
})

test('applyDataMessage rejects a hash mismatch', () => {
  const bytes = Buffer.from('content')
  const claimedHash = hashBuffer(Buffer.from('something-else'))
  const manifest = makeManifest(nacl.sign.keyPair(), { hash: claimedHash })
  const knownManifests = new Map<string, SignedManifest>([[claimedHash, manifest]])

  const result = applyDataMessage({
    msg: { type: 'data', hash: claimedHash, content: bytes.toString('base64') },
    knownManifests
  })

  assert.equal(result.accept, false)
  assert.ok(!result.accept && result.reason === 'hash-mismatch')
})

test('applyDataMessage rejects content with no known manifest', () => {
  const bytes = Buffer.from('content')
  const hash = hashBuffer(bytes)

  const result = applyDataMessage({
    msg: { type: 'data', hash, content: bytes.toString('base64') },
    knownManifests: new Map()
  })

  assert.equal(result.accept, false)
  assert.ok(!result.accept && result.reason === 'no-manifest')
})

test('planManifestsAnnouncement lists all known manifests', () => {
  const keypair = nacl.sign.keyPair()
  const m1 = makeManifest(keypair, { hash: 'h1' })
  const m2 = makeManifest(keypair, { hash: 'h2' })
  const knownManifests = new Map<string, SignedManifest>([['h1', m1], ['h2', m2]])
  const msg = planManifestsAnnouncement(knownManifests)
  assert.equal(msg.type, 'manifests')
  assert.equal(msg.items.length, 2)
})
