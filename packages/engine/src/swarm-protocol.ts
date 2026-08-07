// Pure P2P gossip/verify/seed protocol logic, extracted from what used to
// be peer-node.js's inline handleMessage. No fs/Hyperswarm access here —
// plain data in, plain decisions out — which is what makes this testable
// without a live swarm connection. swarm-node.ts is the I/O shell that
// wires these decisions to Hyperswarm, the manifest store, and the content
// store.

import { hashBuffer, verifyManifest } from './crypto-utils'
import { SignedManifest } from './types'

export interface ManifestsMessage {
  type: 'manifests'
  items: SignedManifest[]
}

export interface WantMessage {
  type: 'want'
  hash: string
}

export interface DataMessage {
  type: 'data'
  hash: string
  content: string
}

export interface RejectedManifest {
  filename: string
  reason: string
}

export interface ApplyManifestsResult {
  learned: SignedManifest[]
  rejected: RejectedManifest[]
  toRequest: SignedManifest[]
}

export type ApplyDataResult =
  | { accept: true, manifest: SignedManifest, bytes: Buffer }
  | { accept: false, reason: 'hash-mismatch', expectedHash: string, actualHash: string }
  | { accept: false, reason: 'no-manifest' }

export function planManifestsAnnouncement (knownManifests: Map<string, SignedManifest>): ManifestsMessage {
  return { type: 'manifests', items: [...knownManifests.values()] }
}

// Merges verified, in-course manifests from an incoming `manifests` message
// into `knownManifests` (mutated in place — it's the peer's running session
// state, analogous to a small in-memory database), then decides what's
// still missing locally. `courseIds` is a list, not a single value — a node
// can be enrolled in (and gossiping about) several courses at once, and a
// peer's announcement (planManifestsAnnouncement) always includes every
// course it knows about, not just ones we happen to share, so this is what
// narrows an incoming message down to the ones we actually care about.
export function applyManifestsMessage (args: {
  msg: ManifestsMessage
  courseIds: string[]
  publicKeyHex: string
  knownManifests: Map<string, SignedManifest>
  localHashes: Set<string>
}): ApplyManifestsResult {
  const { msg, courseIds, publicKeyHex, knownManifests, localHashes } = args
  const courseIdSet = new Set(courseIds)
  const learned: SignedManifest[] = []
  const rejected: RejectedManifest[] = []

  for (const m of msg.items) {
    if (!courseIdSet.has(m.courseId)) continue
    if (knownManifests.has(m.hash)) continue
    if (!verifyManifest(m, publicKeyHex)) {
      rejected.push({ filename: m.filename, reason: 'invalid-signature' })
      continue
    }
    knownManifests.set(m.hash, m)
    learned.push(m)
  }

  const toRequest: SignedManifest[] = []
  for (const m of knownManifests.values()) {
    if (!localHashes.has(m.hash)) toRequest.push(m)
  }

  return { learned, rejected, toRequest }
}

export function planWantResponse (args: {
  msg: WantMessage
  localHashes: Set<string>
}): { hash: string } | null {
  return args.localHashes.has(args.msg.hash) ? { hash: args.msg.hash } : null
}

// Decides whether to accept received file bytes: hash must match what was
// claimed, and there must be a known verified manifest for that hash.
export function applyDataMessage (args: {
  msg: DataMessage
  knownManifests: Map<string, SignedManifest>
}): ApplyDataResult {
  const { msg, knownManifests } = args
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
