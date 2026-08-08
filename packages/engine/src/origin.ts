// Origin fallback (§5.6): when no peer has a file within a time budget,
// fetch it from a configured origin instead of leaving the student
// waiting forever. This is what closes the architecture's core delivery
// guarantee — "the system never fails to deliver a file just because P2P
// didn't have it yet" — which the engine did not previously implement at
// all.
//
// In Mode A the real origin is the LMS's own file storage; since there's
// no real LMS integration yet, `httpOriginFetcher` is a generic stand-in
// (GET `<baseUrl>/<hash>`) that a real adapter would point at the LMS's
// file endpoint.

import { hashBuffer } from './crypto-utils'
import { SignedManifest } from './types'

export type OriginFetcher = (manifest: SignedManifest) => Promise<Buffer | null>

// headers is optional: an LMS origin (Mode A) is typically unauthenticated,
// but a real apps/mode-b-api origin gates /content/:hash behind a session —
// callers pointing this at Mode B pass an `Authorization: Bearer <token>`
// header here (see Open Question #9(a), docs/ARCHITECTURE.md).
export function httpOriginFetcher (baseUrl: string, headers?: Record<string, string>): OriginFetcher {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
  return async (manifest: SignedManifest): Promise<Buffer | null> => {
    const res = await fetch(new URL(manifest.hash, base), { headers })
    if (!res.ok) return null
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}

export type OriginFallbackFailureReason = 'origin-miss' | 'origin-hash-mismatch' | 'origin-error'

export interface OriginFallbackDeps {
  hasLocally: (hash: string) => boolean
  fetchFromOrigin: OriginFetcher
  onSuccess: (manifest: SignedManifest, bytes: Buffer) => void
  onFailure: (manifest: SignedManifest, reason: OriginFallbackFailureReason) => void
  timeoutMs: number
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout
}

// Schedules (at most once per hash — `scheduled` dedups across repeated
// manifest announcements) a single attempt to fetch from origin after
// `timeoutMs` of not having the content locally. If a peer delivers it
// first, `deps.hasLocally` short-circuits the attempt.
export function scheduleOriginFallback (
  manifest: SignedManifest,
  deps: OriginFallbackDeps,
  scheduled: Set<string>
): void {
  if (scheduled.has(manifest.hash)) return
  scheduled.add(manifest.hash)

  const setTimer = deps.setTimer || setTimeout
  const timer = setTimer(() => {
    void attempt()
  }, deps.timeoutMs)
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref()
  }

  async function attempt (): Promise<void> {
    if (deps.hasLocally(manifest.hash)) return

    let bytes: Buffer | null
    try {
      bytes = await deps.fetchFromOrigin(manifest)
    } catch (err) {
      deps.onFailure(manifest, 'origin-error')
      return
    }

    if (!bytes) {
      deps.onFailure(manifest, 'origin-miss')
      return
    }
    if (hashBuffer(bytes) !== manifest.hash) {
      deps.onFailure(manifest, 'origin-hash-mismatch')
      return
    }
    deps.onSuccess(manifest, bytes)
  }
}
