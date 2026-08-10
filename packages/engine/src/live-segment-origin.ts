// Segment-level counterpart to origin.ts's scheduleOriginFallback (§5.6),
// applied to live segments (ADR-0007) instead of files: when a
// sequence-number gap in a session's segments suggests the swarm didn't
// deliver one, fetch it from the origin instead of leaving a downstream
// peer stuck for the rest of the class. Kept as its own small module
// rather than folded into origin.ts because a segment is identified by
// (sessionId, seq), not a content hash known in advance the way a
// manifest's is — the shapes don't line up closely enough to share code
// without forcing an awkward abstraction.

import { hashBuffer } from './crypto-utils'
import { SignedLiveSegment } from './types'

export type SegmentOriginFetcher =
  (sessionId: string, seq: number) => Promise<{ segment: SignedLiveSegment, bytes: Buffer } | null>

// Mirrors origin.ts's httpOriginFetcher: a real apps/mode-b-api origin
// serves this from routes/live-segments.ts's GET, which returns the same
// { segment, content: base64 } shape swarm-node.ts's own SegmentMessage
// uses over the wire — no bespoke decoding needed here. Deliberately
// doesn't re-check hashBuffer(bytes) === segment.hash itself;
// scheduleSegmentOriginFallback's attempt() below already does that on
// whatever this returns, same division of labor as httpOriginFetcher vs.
// scheduleOriginFallback.
export function httpSegmentOriginFetcher (baseUrl: string, headers?: Record<string, string>): SegmentOriginFetcher {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
  return async (sessionId: string, seq: number) => {
    const res = await fetch(new URL(`live-segments/${encodeURIComponent(sessionId)}/${seq}`, base), { headers })
    if (!res.ok) return null
    const body = await res.json() as { segment: SignedLiveSegment, content: string }
    return { segment: body.segment, bytes: Buffer.from(body.content, 'base64') }
  }
}

export type SegmentOriginFallbackFailureReason = 'origin-miss' | 'origin-hash-mismatch' | 'origin-error'

export interface SegmentOriginFallbackDeps {
  hasLocally: (sessionId: string, seq: number) => boolean
  fetchFromOrigin: SegmentOriginFetcher
  onSuccess: (segment: SignedLiveSegment, bytes: Buffer) => void
  onFailure: (sessionId: string, seq: number, reason: SegmentOriginFallbackFailureReason) => void
  timeoutMs: number
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout
}

// Schedules (at most once per sessionId+seq — `scheduled` dedups repeated
// gap detections) a single attempt to fetch a specific segment from origin
// after `timeoutMs`. If a peer delivers it first, `deps.hasLocally`
// short-circuits the attempt — same shape as scheduleOriginFallback.
export function scheduleSegmentOriginFallback (
  sessionId: string,
  seq: number,
  deps: SegmentOriginFallbackDeps,
  scheduled: Set<string>
): void {
  const key = `${sessionId}:${seq}`
  if (scheduled.has(key)) return
  scheduled.add(key)

  const setTimer = deps.setTimer || setTimeout
  const timer = setTimer(() => {
    void attempt()
  }, deps.timeoutMs)
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref()
  }

  async function attempt (): Promise<void> {
    if (deps.hasLocally(sessionId, seq)) return

    let result: { segment: SignedLiveSegment, bytes: Buffer } | null
    try {
      result = await deps.fetchFromOrigin(sessionId, seq)
    } catch (err) {
      deps.onFailure(sessionId, seq, 'origin-error')
      return
    }

    if (!result) {
      deps.onFailure(sessionId, seq, 'origin-miss')
      return
    }
    if (hashBuffer(result.bytes) !== result.segment.hash) {
      deps.onFailure(sessionId, seq, 'origin-hash-mismatch')
      return
    }
    deps.onSuccess(result.segment, result.bytes)
  }
}
