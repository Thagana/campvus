// Offline/sync catch-up (§9): peer gossip (swarm-protocol.ts's
// applyManifestsMessage) already diffs against a peer's *full* known-manifest
// list, not just live events — so a client that's been offline catches up
// fine once *some* peer is reachable. The gap is the origin: today's origin
// fallback (origin.ts) only fetches file bytes by hash, never the manifest
// *list* itself, so a client with zero reachable peers has no way to learn
// what it's missing. This module closes that gap by fetching the origin's
// current manifest list and running it through the same verified diff.

import { SignedManifest } from './types'
import { applyManifestsMessage, ApplyManifestsResult } from './swarm-protocol'

export type FetchManifestList = (courseId: string) => Promise<SignedManifest[]>

// Mirrors origin.ts's httpOriginFetcher: a generic stand-in matching
// apps/mode-b-api's real `GET /courses/:courseId/manifests` shape. A Mode A
// adapter would point this at whatever the LMS's equivalent endpoint turns
// out to be (Open Question #9 — no such endpoint exists for Mode A yet).
export function httpManifestListFetcher (baseUrl: string): FetchManifestList {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
  return async (courseId: string): Promise<SignedManifest[]> => {
    const res = await fetch(new URL(`courses/${courseId}/manifests`, base))
    if (!res.ok) return []
    return await res.json() as SignedManifest[]
  }
}

export async function syncManifestsFromOrigin (args: {
  courseId: string
  publicKeyHex: string
  knownManifests: Map<string, SignedManifest>
  localHashes: Set<string>
  fetchManifestList: FetchManifestList
}): Promise<ApplyManifestsResult> {
  const items = await args.fetchManifestList(args.courseId)
  return applyManifestsMessage({
    msg: { type: 'manifests', items },
    courseId: args.courseId,
    publicKeyHex: args.publicKeyHex,
    knownManifests: args.knownManifests,
    localHashes: args.localHashes
  })
}
