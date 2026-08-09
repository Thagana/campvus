import test from 'node:test'
import assert from 'node:assert/strict'
import nacl from 'tweetnacl'
import { signSessionStart, signLiveSegment, hashBuffer } from '../src/crypto-utils'
import {
  applySessionStartMessage,
  applySegmentMessage,
  planSegmentRelay
} from '../src/live-segment-protocol'
import { Keypair, LiveSegmentFields, SessionStartFields, SignedLiveSegment, SignedSessionStart } from '../src/types'

function makeSessionStart (keypair: Keypair, overrides: Partial<SessionStartFields> = {}): SignedSessionStart {
  return signSessionStart({
    sessionId: 'session-1',
    courseId: 'COMSCI214',
    startedAt: 1,
    ...overrides
  }, keypair.secretKey)
}

function makeSegment (keypair: Keypair, overrides: Partial<LiveSegmentFields> = {}): SignedLiveSegment {
  return signLiveSegment({
    sessionId: 'session-1',
    courseId: 'COMSCI214',
    seq: 0,
    hash: hashBuffer(Buffer.from('segment-bytes')),
    size: 13,
    timestamp: 1,
    ...overrides
  }, keypair.secretKey)
}

function hex (publicKey: Uint8Array): string {
  return Buffer.from(publicKey).toString('hex')
}

test('applySessionStartMessage learns a new verified session in an enrolled course', () => {
  const keypair = nacl.sign.keyPair()
  const session = makeSessionStart(keypair)
  const knownSessions = new Map<string, SignedSessionStart>()

  const result = applySessionStartMessage({
    msg: { type: 'session-start', session },
    courseIds: ['COMSCI214'],
    publicKeyHex: hex(keypair.publicKey),
    knownSessions
  })

  assert.equal(result.accept, true)
  assert.equal(knownSessions.has(session.sessionId), true)
})

test('applySessionStartMessage rejects a session for a course not enrolled in', () => {
  const keypair = nacl.sign.keyPair()
  const session = makeSessionStart(keypair, { courseId: 'MATH101' })
  const knownSessions = new Map<string, SignedSessionStart>()

  const result = applySessionStartMessage({
    msg: { type: 'session-start', session },
    courseIds: ['COMSCI214'],
    publicKeyHex: hex(keypair.publicKey),
    knownSessions
  })

  assert.equal(result.accept, false)
  assert.equal(result.reason, 'unknown-course')
  assert.equal(knownSessions.size, 0)
})

test('applySessionStartMessage rejects an invalid signature', () => {
  const keypair = nacl.sign.keyPair()
  const otherKeypair = nacl.sign.keyPair()
  const session = makeSessionStart(otherKeypair)
  const knownSessions = new Map<string, SignedSessionStart>()

  const result = applySessionStartMessage({
    msg: { type: 'session-start', session },
    courseIds: ['COMSCI214'],
    publicKeyHex: hex(keypair.publicKey),
    knownSessions
  })

  assert.equal(result.accept, false)
  assert.equal(result.reason, 'invalid-signature')
})

test('applySessionStartMessage rejects a session it already knows about', () => {
  const keypair = nacl.sign.keyPair()
  const session = makeSessionStart(keypair)
  const knownSessions = new Map<string, SignedSessionStart>([[session.sessionId, session]])

  const result = applySessionStartMessage({
    msg: { type: 'session-start', session },
    courseIds: ['COMSCI214'],
    publicKeyHex: hex(keypair.publicKey),
    knownSessions
  })

  assert.equal(result.accept, false)
  assert.equal(result.reason, 'duplicate')
})

test('applySegmentMessage accepts a verified segment matching its claimed hash', () => {
  const keypair = nacl.sign.keyPair()
  const bytes = Buffer.from('segment-bytes')
  const hash = hashBuffer(bytes)
  const segment = makeSegment(keypair, { hash })
  const seenSegments = new Set<string>()

  const result = applySegmentMessage({
    msg: { type: 'segment', segment, content: bytes.toString('base64') },
    courseIds: ['COMSCI214'],
    publicKeyHex: hex(keypair.publicKey),
    seenSegments
  })

  assert.equal(result.accept, true)
  assert.ok(result.accept && result.bytes.equals(bytes))
  assert.equal(seenSegments.has('session-1:0'), true)
})

test('applySegmentMessage rejects a segment for a course not enrolled in', () => {
  const keypair = nacl.sign.keyPair()
  const bytes = Buffer.from('segment-bytes')
  const segment = makeSegment(keypair, { courseId: 'MATH101', hash: hashBuffer(bytes) })
  const seenSegments = new Set<string>()

  const result = applySegmentMessage({
    msg: { type: 'segment', segment, content: bytes.toString('base64') },
    courseIds: ['COMSCI214'],
    publicKeyHex: hex(keypair.publicKey),
    seenSegments
  })

  assert.equal(result.accept, false)
  assert.ok(!result.accept && result.reason === 'unknown-course')
})

test('applySegmentMessage rejects an invalid signature', () => {
  const keypair = nacl.sign.keyPair()
  const otherKeypair = nacl.sign.keyPair()
  const bytes = Buffer.from('segment-bytes')
  const segment = makeSegment(otherKeypair, { hash: hashBuffer(bytes) })
  const seenSegments = new Set<string>()

  const result = applySegmentMessage({
    msg: { type: 'segment', segment, content: bytes.toString('base64') },
    courseIds: ['COMSCI214'],
    publicKeyHex: hex(keypair.publicKey),
    seenSegments
  })

  assert.equal(result.accept, false)
  assert.ok(!result.accept && result.reason === 'invalid-signature')
})

test('applySegmentMessage rejects bytes not matching the claimed hash', () => {
  const keypair = nacl.sign.keyPair()
  const claimedHash = hashBuffer(Buffer.from('something-else'))
  const segment = makeSegment(keypair, { hash: claimedHash })
  const seenSegments = new Set<string>()

  const result = applySegmentMessage({
    msg: { type: 'segment', segment, content: Buffer.from('segment-bytes').toString('base64') },
    courseIds: ['COMSCI214'],
    publicKeyHex: hex(keypair.publicKey),
    seenSegments
  })

  assert.equal(result.accept, false)
  assert.ok(!result.accept && result.reason === 'hash-mismatch')
})

test('applySegmentMessage rejects a segment already seen (flood-gossip re-delivery)', () => {
  const keypair = nacl.sign.keyPair()
  const bytes = Buffer.from('segment-bytes')
  const hash = hashBuffer(bytes)
  const segment = makeSegment(keypair, { hash })
  const seenSegments = new Set<string>(['session-1:0'])

  const result = applySegmentMessage({
    msg: { type: 'segment', segment, content: bytes.toString('base64') },
    courseIds: ['COMSCI214'],
    publicKeyHex: hex(keypair.publicKey),
    seenSegments
  })

  assert.equal(result.accept, false)
  assert.ok(!result.accept && result.reason === 'duplicate')
})

test('applySegmentMessage treats distinct sequence numbers in the same session as distinct segments', () => {
  const keypair = nacl.sign.keyPair()
  const bytes = Buffer.from('segment-bytes')
  const hash = hashBuffer(bytes)
  const seenSegments = new Set<string>(['session-1:0'])
  const segment = makeSegment(keypair, { hash, seq: 1 })

  const result = applySegmentMessage({
    msg: { type: 'segment', segment, content: bytes.toString('base64') },
    courseIds: ['COMSCI214'],
    publicKeyHex: hex(keypair.publicKey),
    seenSegments
  })

  assert.equal(result.accept, true)
})

test('planSegmentRelay flood-relays to every connected peer except the sender', () => {
  const targets = planSegmentRelay({ connectedPeerIds: ['a', 'b', 'c'], fromPeerId: 'b' })
  assert.deepEqual(targets, ['a', 'c'])
})

test('planSegmentRelay returns nothing when the sender is the only connected peer', () => {
  const targets = planSegmentRelay({ connectedPeerIds: ['a'], fromPeerId: 'a' })
  assert.deepEqual(targets, [])
})
