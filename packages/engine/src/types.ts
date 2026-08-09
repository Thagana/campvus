// Shared shapes for the manifest/signing engine.

export interface ManifestFields {
  courseId: string
  filename: string
  hash: string
  size: number
  timestamp: number
}

export interface SignedManifest extends ManifestFields {
  signature: string
}

// What verifyManifest actually receives: untrusted wire data that may be
// missing or have tampered with its signature — never assume it's a valid
// SignedManifest before checking.
export type ManifestInput = ManifestFields & { signature?: string }

export interface Keypair {
  publicKey: Uint8Array
  secretKey: Uint8Array
}

// A scheduled/live session announcement — distinct from a manifest because
// there's no file hash to address it by until the session has actually
// produced content (see LiveSegmentFields below).
export interface SessionStartFields {
  sessionId: string
  courseId: string
  startedAt: number
}

export interface SignedSessionStart extends SessionStartFields {
  signature: string
}

export type SessionStartInput = SessionStartFields & { signature?: string }

// One relayable chunk of a live session's audio/video, addressed by
// (sessionId, seq) rather than by content hash alone — unlike a file,
// there's no expectation any two segments are ever identical, so
// content-hash dedup (as manifests get) doesn't apply the same way.
export interface LiveSegmentFields {
  sessionId: string
  courseId: string
  seq: number
  hash: string
  size: number
  timestamp: number
}

export interface SignedLiveSegment extends LiveSegmentFields {
  signature: string
}

export type LiveSegmentInput = LiveSegmentFields & { signature?: string }
