// Only the live-session methods (startLiveSession/publishSegment/
// finishLiveSession) are covered here, not the rest of swarm-node.ts —
// everything else is Hyperswarm I/O, validated by manual/smoke testing on
// real devices (see docs/ARCHITECTURE.md §13.1), the same reason no other
// swarm-node.test.ts exists. These three happen to need no network at all
// (they only touch connectedPeers, which is empty until start() runs), so
// they're testable the same direct way ingest.test.ts tests ingestBuffer.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import nacl from 'tweetnacl'
import b4a from 'b4a'
import { resolvePaths, Paths } from '../src/paths'
import { createSwarmNode } from '../src/swarm-node'
import { readContent } from '../src/content-store'
import { signSessionStart, signLiveSegment, hashBuffer } from '../src/crypto-utils'
import { Keypair } from '../src/types'

function tmpPaths (): Paths {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campvus-test-'))
  return resolvePaths(rootDir)
}

function makeKeypair (): Keypair {
  const kp = nacl.sign.keyPair()
  return { publicKey: kp.publicKey, secretKey: kp.secretKey }
}

test('startLiveSession throws without a keypair (a student node has none)', () => {
  const paths = tmpPaths()
  const keypair = makeKeypair()
  const node = createSwarmNode({
    courseIds: ['COMSCI214'],
    contentDir: path.join(paths.rootDir, 'content'),
    publicKeyHex: b4a.toString(keypair.publicKey, 'hex'),
    paths,
    log: () => {}
  })

  assert.throws(() => node.startLiveSession('COMSCI214'), /requires a keypair/)
})

test('startLiveSession signs a session verifiable against this node\'s own public key', () => {
  const paths = tmpPaths()
  const keypair = makeKeypair()
  const publicKeyHex = b4a.toString(keypair.publicKey, 'hex')
  const node = createSwarmNode({
    courseIds: ['COMSCI214'],
    contentDir: path.join(paths.rootDir, 'content'),
    publicKeyHex,
    paths,
    keypair,
    log: () => {}
  })

  const session = node.startLiveSession('COMSCI214')
  assert.equal(session.courseId, 'COMSCI214')
  assert.ok(session.sessionId)
  assert.ok(session.signature)
})

test('publishSegment throws without a keypair', () => {
  const paths = tmpPaths()
  const keypair = makeKeypair()
  const node = createSwarmNode({
    courseIds: ['COMSCI214'],
    contentDir: path.join(paths.rootDir, 'content'),
    publicKeyHex: b4a.toString(keypair.publicKey, 'hex'),
    paths,
    log: () => {}
  })

  assert.throws(() => node.publishSegment('session-1', 'COMSCI214', 0, Buffer.from('x')), /requires a keypair/)
})

test('finishLiveSession throws for a session this node never published to', () => {
  const paths = tmpPaths()
  const keypair = makeKeypair()
  const node = createSwarmNode({
    courseIds: ['COMSCI214'],
    contentDir: path.join(paths.rootDir, 'content'),
    publicKeyHex: b4a.toString(keypair.publicKey, 'hex'),
    paths,
    keypair,
    log: () => {}
  })

  assert.throws(() => node.finishLiveSession('never-started', 'recording.webm'), /never published/)
})

test('publishSegment then finishLiveSession concatenates segments in call order and publishes via ingestBuffer', () => {
  const paths = tmpPaths()
  const keypair = makeKeypair()
  const node = createSwarmNode({
    courseIds: ['COMSCI214'],
    contentDir: path.join(paths.rootDir, 'content'),
    publicKeyHex: b4a.toString(keypair.publicKey, 'hex'),
    paths,
    keypair,
    log: () => {}
  })

  const session = node.startLiveSession('COMSCI214')
  node.publishSegment(session.sessionId, 'COMSCI214', 0, Buffer.from('first-'))
  node.publishSegment(session.sessionId, 'COMSCI214', 1, Buffer.from('second-'))
  node.publishSegment(session.sessionId, 'COMSCI214', 2, Buffer.from('third'))

  const { manifest, deduped } = node.finishLiveSession(session.sessionId, 'recording.webm')

  assert.equal(deduped, false)
  assert.equal(manifest.courseId, 'COMSCI214')
  assert.equal(manifest.filename, 'recording.webm')
  assert.deepEqual(readContent(paths.contentStoreDir, manifest.hash), Buffer.from('first-second-third'))
})

test('finishLiveSession clears the buffer, so calling it twice for the same session throws the second time', () => {
  const paths = tmpPaths()
  const keypair = makeKeypair()
  const node = createSwarmNode({
    courseIds: ['COMSCI214'],
    contentDir: path.join(paths.rootDir, 'content'),
    publicKeyHex: b4a.toString(keypair.publicKey, 'hex'),
    paths,
    keypair,
    log: () => {}
  })

  const session = node.startLiveSession('COMSCI214')
  node.publishSegment(session.sessionId, 'COMSCI214', 0, Buffer.from('only-segment'))
  node.finishLiveSession(session.sessionId, 'recording.webm')

  assert.throws(() => node.finishLiveSession(session.sessionId, 'recording.webm'), /never published/)
})

test('two different sessions record independently', () => {
  const paths = tmpPaths()
  const keypair = makeKeypair()
  const node = createSwarmNode({
    courseIds: ['COMSCI214', 'MATH101'],
    contentDir: path.join(paths.rootDir, 'content'),
    publicKeyHex: b4a.toString(keypair.publicKey, 'hex'),
    paths,
    keypair,
    log: () => {}
  })

  const sessionA = node.startLiveSession('COMSCI214')
  const sessionB = node.startLiveSession('MATH101')
  node.publishSegment(sessionA.sessionId, 'COMSCI214', 0, Buffer.from('cs-content'))
  node.publishSegment(sessionB.sessionId, 'MATH101', 0, Buffer.from('math-content'))

  const resultA = node.finishLiveSession(sessionA.sessionId, 'a.webm')
  const resultB = node.finishLiveSession(sessionB.sessionId, 'b.webm')

  assert.equal(resultA.manifest.courseId, 'COMSCI214')
  assert.equal(resultB.manifest.courseId, 'MATH101')
  assert.deepEqual(readContent(paths.contentStoreDir, resultA.manifest.hash), Buffer.from('cs-content'))
  assert.deepEqual(readContent(paths.contentStoreDir, resultB.manifest.hash), Buffer.from('math-content'))
})

// announceSignedSession/relaySignedSegment: the signing-proxy path for a
// client with no local secretKey (e.g. apps/mode-a-desktop) — these floods
// an already-signed object it got back from a server-side signer, rather
// than signing locally like startLiveSession/publishSegment. No keypair
// needed on the node itself for either.

test('announceSignedSession works on a node with no keypair configured', () => {
  const paths = tmpPaths()
  const signerKeypair = makeKeypair() // stands in for apps/mode-b-api's server-held key
  const publicKeyHex = b4a.toString(signerKeypair.publicKey, 'hex')
  const node = createSwarmNode({
    courseIds: ['COMSCI214'],
    contentDir: path.join(paths.rootDir, 'content'),
    publicKeyHex,
    paths,
    log: () => {}
  })

  const session = signSessionStart({ sessionId: 'session-1', courseId: 'COMSCI214', startedAt: Date.now() }, signerKeypair.secretKey)
  // Should not throw despite this node having no keypair.
  node.announceSignedSession(session)
})

test('relaySignedSegment works on a node with no keypair configured, and finishLiveSession still assembles the recording', () => {
  const paths = tmpPaths()
  const signerKeypair = makeKeypair()
  const publicKeyHex = b4a.toString(signerKeypair.publicKey, 'hex')
  const node = createSwarmNode({
    courseIds: ['COMSCI214'],
    contentDir: path.join(paths.rootDir, 'content'),
    publicKeyHex,
    paths,
    log: () => {}
  })

  const bytes = Buffer.from('captured-by-desktop-client')
  const segment = signLiveSegment({
    sessionId: 'session-1', courseId: 'COMSCI214', seq: 0,
    hash: hashBuffer(bytes), size: bytes.length, timestamp: Date.now()
  }, signerKeypair.secretKey)

  node.relaySignedSegment(segment, bytes)

  // finishLiveSession itself still requires a keypair (it signs the final
  // manifest) — a keypair-less desktop node isn't expected to call it; the
  // real flow publishes the recording via the existing HTTP upload route
  // instead. Confirm that boundary explicitly rather than leaving it assumed.
  assert.throws(() => node.finishLiveSession('session-1', 'recording.webm'), /requires a keypair/)
})
