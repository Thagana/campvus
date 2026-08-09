// Pure live-lesson relay protocol logic — the segment-relay counterpart to
// swarm-protocol.ts's manifest gossip. Same discipline: no fs/Hyperswarm
// access here, plain data in, plain decisions out, so it's testable
// without a live swarm connection. swarm-node.ts is the I/O shell that
// wires these decisions to Hyperswarm and the flood-gossip fan-out.
//
// Per ADR-0007 and .scratch/live-lesson-streaming/spec.md: live segments
// relay via flood-gossip (every peer relays to every peer it's connected
// to on the course topic) rather than a want/data pull exchange like
// files — a live session is latency-tolerant only up to a point, so
// pushing segments as they're produced avoids a request round-trip.
// A segment is addressed by (sessionId, seq), not content hash alone —
// unlike a file, no two segments are ever expected to be identical.

import { verifyLiveSegment, verifySessionStart, hashBuffer } from './crypto-utils'
import { SignedLiveSegment, SignedSessionStart } from './types'

export interface SessionStartMessage {
  type: 'session-start'
  session: SignedSessionStart
}

export interface SegmentMessage {
  type: 'segment'
  segment: SignedLiveSegment
  content: string // base64
}

export type LiveMessage = SessionStartMessage | SegmentMessage

export function segmentKey (sessionId: string, seq: number): string {
  return `${sessionId}:${seq}`
}

export interface ApplySessionStartResult {
  accept: boolean
  reason?: 'unknown-course' | 'invalid-signature' | 'duplicate'
}

// Merges a verified, in-course session-start announcement into
// `knownSessions` (mutated in place, mirrors applyManifestsMessage's
// knownManifests). Returns whether it was newly learned.
export function applySessionStartMessage (args: {
  msg: SessionStartMessage
  courseIds: string[]
  publicKeyHex: string
  knownSessions: Map<string, SignedSessionStart>
}): ApplySessionStartResult {
  const { msg, courseIds, publicKeyHex, knownSessions } = args
  const session = msg.session

  if (!courseIds.includes(session.courseId)) {
    return { accept: false, reason: 'unknown-course' }
  }
  if (knownSessions.has(session.sessionId)) {
    return { accept: false, reason: 'duplicate' }
  }
  if (!verifySessionStart(session, publicKeyHex)) {
    return { accept: false, reason: 'invalid-signature' }
  }

  knownSessions.set(session.sessionId, session)
  return { accept: true }
}

export type ApplySegmentResult =
  | { accept: true, segment: SignedLiveSegment, bytes: Buffer }
  | { accept: false, reason: 'unknown-course' | 'invalid-signature' | 'hash-mismatch' | 'duplicate' }

// Decides whether to accept a relayed segment: in a known course, signed
// by the institution key, content hash matches the claim, and not already
// seen (a flood-gossip topology means the same segment arrives from
// multiple peers by design — `seenSegments` is what makes re-relaying
// idempotent rather than an infinite loop).
export function applySegmentMessage (args: {
  msg: SegmentMessage
  courseIds: string[]
  publicKeyHex: string
  seenSegments: Set<string>
}): ApplySegmentResult {
  const { msg, courseIds, publicKeyHex, seenSegments } = args
  const { segment } = msg
  const key = segmentKey(segment.sessionId, segment.seq)

  if (!courseIds.includes(segment.courseId)) {
    return { accept: false, reason: 'unknown-course' }
  }
  if (seenSegments.has(key)) {
    return { accept: false, reason: 'duplicate' }
  }
  if (!verifyLiveSegment(segment, publicKeyHex)) {
    return { accept: false, reason: 'invalid-signature' }
  }

  const bytes = Buffer.from(msg.content, 'base64')
  if (hashBuffer(bytes) !== segment.hash) {
    return { accept: false, reason: 'hash-mismatch' }
  }

  seenSegments.add(key)
  return { accept: true, segment, bytes }
}

// Flood-gossip fan-out: relay to every connected peer on the segment's
// topic except whichever peer it just arrived from. Kept as a pure
// function over opaque peer ids (not real Duplex/Hyperswarm connections)
// so the fan-out decision is unit-testable on its own, the same way
// swarm-protocol.ts's functions are — swarm-node.ts maps the returned ids
// back to real connections and calls `send` on each.
export function planSegmentRelay (args: {
  connectedPeerIds: string[]
  fromPeerId: string
}): string[] {
  return args.connectedPeerIds.filter(id => id !== args.fromPeerId)
}
