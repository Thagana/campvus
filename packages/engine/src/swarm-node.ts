// I/O shell around the shared swarm protocol (./swarm-protocol.ts):
// Hyperswarm wiring, manifest-store/content-store reads+writes, and peer
// count / sync-state tracking (./sync-state.ts). This is the piece that
// validates the single highest-risk assumption in the architecture: that
// two devices can discover each other and exchange signed, verified content
// over Hyperswarm without any central server in the loop beyond the DHT
// itself — confirmed on two physical laptops on the same Wi-Fi (see
// apps/mode-a-headless's README).
//
// `paths` (where the local manifest registry / institution public key live)
// is supplied by the caller — the engine has no opinion on where an app's
// state lives, only on how to use it once given.
//
// createSwarmNode() is the live engine: start()/stop() plus event
// subscriptions, driven identically by the CLI shim (run(), below — used by
// apps/mode-a-headless's peer-node.ts) and by apps/mode-a-desktop's tray
// agent (whose AgentEngineEvents interface this satisfies structurally).

import crypto from 'crypto'
import path from 'path'
import { Duplex } from 'stream'
import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import { loadRegistry, saveRegistry } from './manifest-store'
import { listContentHashes, readContent, writeContent, touchContent } from './content-store'
import { loadPublicKeyHex } from './identity'
import { verifyManifest, signSessionStart, signLiveSegment, hashBuffer } from './crypto-utils'
import { topicForCourse, topicForCourseAndRegion } from './topics'
import { createLanDiscovery, LanDiscovery } from './lan-discovery'
import {
  planManifestsAnnouncement,
  applyManifestsMessage,
  planWantResponse,
  applyDataMessage,
  ManifestsMessage,
  WantMessage,
  DataMessage
} from './swarm-protocol'
import {
  applySessionStartMessage,
  applySegmentMessage,
  planSegmentRelay,
  SessionStartMessage,
  SegmentMessage
} from './live-segment-protocol'
import { httpOriginFetcher, scheduleOriginFallback, OriginFetcher } from './origin'
import { scheduleSegmentOriginFallback, SegmentOriginFetcher } from './live-segment-origin'
import { httpManifestListFetcher, syncManifestsFromOrigin, FetchManifestList } from './manifest-sync'
import { enforceStorageCap } from './eviction'
import { alwaysAllowSeeding, fixedSeedingPolicy, networkAwareSeedingPolicy, SeedingPolicy } from './seeding-policy'
import { createSyncStateTracker } from './sync-state'
import { ingestBuffer, IngestResult } from './ingest'
import { Paths } from './paths'
import { Keypair, SignedLiveSegment, SignedManifest, SignedSessionStart } from './types'

type WireMessage = ManifestsMessage | WantMessage | DataMessage | SessionStartMessage | SegmentMessage

const DEFAULT_ORIGIN_TIMEOUT_MS = 15000
// How long to wait for the peer we already asked before allowing a
// re-request to a different peer. Deliberately decoupled from the origin
// timeout: this is about not getting stuck on one unresponsive peer, not
// about giving up on the swarm entirely.
const PEER_RETRY_TIMEOUT_MS = 10000

export interface SwarmNodeOptions {
  // A student is normally enrolled in several courses at once — one node
  // joins one swarm topic per course (plus one region topic each, if
  // configured) and gossips/stores manifests for all of them together, not
  // a separate node per course.
  courseIds: string[]
  contentDir: string
  publicKeyHex: string
  paths: Paths
  originFetcher?: OriginFetcher
  originTimeoutMs?: number
  // §9 / Open Question #9(b) manifest-sync bridge: without this, a node
  // with zero reachable peers has no way to learn a course's manifests
  // exist at all — origin-fetched content bytes are useless if nothing
  // ever asks for them. Optional and independent of originFetcher (a real
  // Mode B origin serves manifests and content bytes from different
  // routes, so these are two separate base URLs/fetchers in practice).
  manifestListFetcher?: FetchManifestList
  // Unset means "sync once, on start() only" (the §5.5 "on app open"
  // check-in) — set this for the "opportunistic periodic" half of §5.5 too.
  manifestSyncIntervalMs?: number
  maxStoreBytes?: number
  seedingPolicy?: SeedingPolicy
  // Tier 2 (ADR-0006): an admin-configured tag ("nearby but not same LAN,
  // same suburb" per §8, approximated by whoever runs the node setting the
  // same tag). Unset means no Tier 2 topic is joined — Tier 1 (LAN) and
  // Tier 3 (wide DHT) still apply on their own.
  region?: string
  // Defaults to console.log. The CLI shim relies on that default to print
  // its documented per-peer trace; callers that already have their own
  // logging (or want it silenced, e.g. tests) can override it.
  log?: (line: string) => void
  // ADR-0007: only a teacher's client supplies this — the institution
  // secret key needed to sign an outgoing session-start/segment before
  // flooding it to connected peers. A student node has no use for it and
  // leaves it unset; calling startLiveSession/publishSegment without one
  // configured is a programming error (throws), the same way calling them
  // at all only makes sense for whichever client is the segment source.
  keypair?: Keypair
  // Origin fallback for live segments (§5.6 applied to segments, see
  // live-segment-origin.ts) — analogous to originFetcher/originTimeoutMs
  // above but keyed by (sessionId, seq) instead of content hash, since a
  // segment isn't announced in advance the way a manifest is. Optional and
  // independent of originFetcher: a real Mode B origin would serve
  // segments from a different route than file content.
  segmentOriginFetcher?: SegmentOriginFetcher
  segmentOriginTimeoutMs?: number
}

export interface SwarmNode {
  start (): Promise<void>
  stop (): Promise<void>
  onPeerCountChange (handler: (count: number) => void): void
  onSyncStart (handler: () => void): void
  onSyncEnd (handler: () => void): void
  onError (handler: (err: Error) => void): void
  // Manual trigger for the manifest-sync bridge (§9) — exposed mainly for
  // tests and an eventual "sync now" UI action; start() already calls this
  // once on its own, and again on manifestSyncIntervalMs if configured.
  checkOriginForManifests (): Promise<void>
  // Every manifest this node has learned and trusts — course-scoped and
  // signature-verified before ever entering the underlying map (both at
  // startup, above, and via applyManifestsMessage), so callers don't need
  // to re-verify. Manifests learned at runtime are also persisted back to
  // this node's own registry.json (persistKnownManifests, below) as they
  // arrive, so this in-memory map and that file converge — but while the
  // node is running, this getter reflects the current moment; a file read
  // could be a write behind it.
  getKnownManifests (): SignedManifest[]

  // Live-session support (ADR-0007). See SwarmNodeOptions.keypair for who
  // can actually call the two "publish" methods below.
  //
  // Signs and floods a session-start announcement to every currently
  // connected peer on courseId's topic — the swarm-topic announcement
  // .scratch/live-lesson-streaming/spec.md describes in place of a push
  // notification backend. Throws if this node has no keypair configured.
  startLiveSession (courseId: string): SignedSessionStart
  // Signs and floods one segment of an already-started session to every
  // currently connected peer (flood-gossip, ticket 07's fan-out design).
  // The caller (the teacher's client) is responsible for producing bytes
  // at the ~6-10s cadence the spec settled on and for numbering `seq`
  // sequentially per session — gap detection for origin fallback relies on
  // that. Throws if this node has no keypair configured.
  publishSegment (sessionId: string, courseId: string, seq: number, bytes: Buffer): SignedLiveSegment
  // Ticket 04 (.scratch/live-lesson-streaming/): the teacher's client is
  // already the segment source, so it's also where the recording lives —
  // concatenates every segment this node published for `sessionId` (in the
  // order publishSegment was called, per its own sequential-seq contract)
  // and runs the result through the exact same hash-sign-publish pipeline
  // (ingestBuffer) any other course file goes through, no separate
  // rewatch mechanism. Throws if this node has no keypair configured, or
  // if it never published any segment for this session (nothing to
  // publish, or this node was never the source).
  finishLiveSession (sessionId: string, filename: string): IngestResult
  onSessionStart (handler: (session: SignedSessionStart) => void): void
  onSegment (handler: (segment: SignedLiveSegment, bytes: Buffer) => void): void
}

export function createSwarmNode (options: SwarmNodeOptions): SwarmNode {
  const {
    courseIds, contentDir, publicKeyHex, paths,
    originFetcher, maxStoreBytes, region,
    manifestListFetcher, manifestSyncIntervalMs,
    originTimeoutMs = DEFAULT_ORIGIN_TIMEOUT_MS,
    seedingPolicy = alwaysAllowSeeding(),
    log = (line: string) => console.log(line),
    keypair,
    segmentOriginFetcher,
    segmentOriginTimeoutMs = DEFAULT_ORIGIN_TIMEOUT_MS
  } = options

  const courseIdSet = new Set(courseIds)

  const tracker = createSyncStateTracker()
  const errorHandlers: Array<(err: Error) => void> = []
  const emitError = (err: Error): void => { for (const h of errorHandlers) h(err) }

  // Known manifests across all enrolled courses, keyed by hash — one shared
  // map/content-store, not one per course (content is already deduped by
  // hash regardless of which course(s) reference it). Seeded from any local
  // registry.json (the "origin" machine will have one); other peers start
  // empty and learn manifests from whoever they connect to.
  const knownManifests = new Map<string, SignedManifest>()
  for (const m of loadRegistry(paths)) {
    if (courseIdSet.has(m.courseId) && verifyManifest(m, publicKeyHex)) {
      knownManifests.set(m.hash, m)
    }
  }
  log(`Starting with ${knownManifests.size} locally known, signature-verified manifest(s).`)

  // Writes the node's full current knowledge back to its own local
  // registry.json — called whenever a peer or origin teaches it manifests
  // it didn't already have (below), so a restart re-seeds knownManifests
  // (above) from what this node has already learned instead of starting
  // over and re-discovering it from the network again. Each device has its
  // own paths.registryFile, so this never collides with a teacher/origin's
  // own registry.json on a different machine — see manifest-store.ts.
  function persistKnownManifests (): void {
    saveRegistry(Array.from(knownManifests.values()), paths)
  }

  const localHashes = listContentHashes(contentDir)
  log(`Starting with ${localHashes.size} content file(s) already on disk.`)

  // Hashes we've already sent a 'want' for to some peer — avoids asking
  // every connected peer redundantly for the same file. Cleared once the
  // content arrives, or after PEER_RETRY_TIMEOUT_MS if it never does, so a
  // later manifest announcement can retry with a different peer.
  const requestedHashes = new Set<string>()
  const retryScheduled = new Set<string>()
  const originScheduled = new Set<string>()

  let swarm: Hyperswarm | undefined
  // One LanDiscovery per course (each advertises/browses that course's own
  // mDNS topic, mirroring the one-DHT-topic-per-course join below) rather
  // than a single shared LAN topic — keeps course-scoping consistent
  // across all three discovery tiers.
  let lanDiscoveries: LanDiscovery[] = []
  let lanPeerCounter = 0

  // Live-session state (ADR-0007) — deliberately not persisted anywhere
  // the way knownManifests/registry.json is: a live session is inherently
  // ephemeral, there's nothing to re-seed on restart.
  const knownSessions = new Map<string, SignedSessionStart>()
  const seenSegments = new Set<string>()
  // Highest accepted seq per session — how a gap (a missing segment) is
  // detected: no separate "announce" phase exists for segments (they're
  // pushed with content included, see live-segment-protocol.ts), so a peer
  // only learns a segment should exist once a *later* one arrives.
  const lastSeqBySession = new Map<string, number>()
  const segmentOriginScheduled = new Set<string>()
  // Every currently connected peer this node could flood-relay to, keyed
  // by the same peerId attachPeer already uses for logging. Nothing before
  // this feature needed to reach a peer other than the one that just sent
  // a message — flood-gossip relay is what requires tracking the full set.
  const connectedPeers = new Map<string, Duplex>()
  // Segments this node has itself published, buffered for finishLiveSession
  // — only ever populated by publishSegment below (a node relaying/
  // receiving someone else's segments doesn't record them; per ticket 04,
  // only the source records).
  const sessionRecordings = new Map<string, { courseId: string, chunks: Buffer[] }>()
  const sessionStartHandlers: Array<(session: SignedSessionStart) => void> = []
  const segmentHandlers: Array<(segment: SignedLiveSegment, bytes: Buffer) => void> = []

  function relayToOthers (fromPeerId: string, msg: SessionStartMessage | SegmentMessage): void {
    const targets = planSegmentRelay({ connectedPeerIds: [...connectedPeers.keys()], fromPeerId })
    for (const id of targets) {
      const conn = connectedPeers.get(id)
      if (conn) send(conn, msg)
    }
  }

  function considerMissingSegment (sessionId: string, seq: number): void {
    if (!segmentOriginFetcher) return
    scheduleSegmentOriginFallback(sessionId, seq, {
      hasLocally: (sid, s) => seenSegments.has(`${sid}:${s}`),
      fetchFromOrigin: segmentOriginFetcher,
      timeoutMs: segmentOriginTimeoutMs,
      onSuccess: (segment, bytes) => {
        seenSegments.add(`${segment.sessionId}:${segment.seq}`)
        for (const h of segmentHandlers) h(segment, bytes)
        log(`[origin] fetched missing segment ${segment.sessionId}:${segment.seq}`)
      },
      onFailure: (sid, s, reason) => {
        log(`[origin] failed to fetch segment ${sid}:${s} (${reason}) — still waiting on peers`)
      }
    }, segmentOriginScheduled)
  }

  function scheduleRetryClear (hash: string): void {
    if (retryScheduled.has(hash)) return
    retryScheduled.add(hash)
    const timer = setTimeout(() => {
      retryScheduled.delete(hash)
      requestedHashes.delete(hash)
    }, PEER_RETRY_TIMEOUT_MS)
    if (typeof timer.unref === 'function') timer.unref()
  }

  function onContentObtained (manifest: SignedManifest, bytes: Buffer, source: string): void {
    requestedHashes.delete(manifest.hash)
    writeContent(contentDir, manifest.hash, bytes)
    localHashes.add(manifest.hash)
    if (maxStoreBytes) enforceStorageCap(contentDir, maxStoreBytes)
    tracker.markObtained(manifest.hash)
    log(`[${source}] downloaded and verified "${manifest.filename}" — now seeding it too`)
  }

  function considerMissing (manifest: SignedManifest): void {
    tracker.markMissing(manifest.hash)
    scheduleRetryClear(manifest.hash)
    if (originFetcher) {
      scheduleOriginFallback(manifest, {
        hasLocally: (hash) => localHashes.has(hash),
        fetchFromOrigin: originFetcher,
        timeoutMs: originTimeoutMs,
        onSuccess: (m, bytes) => onContentObtained(m, bytes, 'origin'),
        onFailure: (m, reason) => {
          log(`[origin] failed to fetch "${m.filename}" (${reason}) — still waiting on peers`)
        }
      }, originScheduled)
    }
  }

  let manifestSyncTimer: NodeJS.Timeout | undefined

  // §9 manifest-sync bridge: same verified diff peer gossip already runs
  // (applyManifestsMessage, via syncManifestsFromOrigin), just fed from the
  // origin's manifest list instead of a peer's. Missing content discovered
  // this way flows through the exact same considerMissing → origin-fallback
  // path as a peer-announced manifest would. syncManifestsFromOrigin is
  // single-course (the real origin API is scoped that way), so a
  // multi-course node calls it once per enrolled course.
  async function checkOriginForManifests (): Promise<void> {
    if (!manifestListFetcher) return
    for (const id of courseIds) {
      try {
        const result = await syncManifestsFromOrigin({
          courseId: id, publicKeyHex, knownManifests, localHashes,
          fetchManifestList: manifestListFetcher
        })
        for (const r of result.rejected) {
          log(`[origin-sync] rejected manifest for "${r.filename}" — signature invalid`)
        }
        if (result.learned.length > 0) {
          log(`[origin-sync] learned ${result.learned.length} new verified manifest(s) from origin for course "${id}"`)
          persistKnownManifests()
        }
        for (const m of result.toRequest) {
          considerMissing(m)
        }
      } catch (err) {
        log(`[origin-sync] failed to fetch manifest list for course "${id}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  function send (conn: Duplex, obj: unknown): void {
    conn.write(JSON.stringify(obj) + '\n')
  }

  function handleMessage (msg: WireMessage, conn: Duplex, peerId: string): void {
    if (msg.type === 'manifests') {
      const { rejected, learned, toRequest } = applyManifestsMessage({
        msg,
        courseIds,
        publicKeyHex,
        knownManifests,
        localHashes
      })

      for (const r of rejected) {
        log(`[peer ${peerId}] rejected manifest for "${r.filename}" — signature invalid`)
      }
      if (learned.length > 0) {
        log(`[peer ${peerId}] learned ${learned.length} new verified manifest(s)`)
        persistKnownManifests()
      }

      // Ask for anything we don't already have — but only once per hash at
      // a time (prefer whichever peer we already asked, rather than
      // requesting the same file from every connected peer in parallel).
      for (const m of toRequest) {
        considerMissing(m)
        if (requestedHashes.has(m.hash)) continue
        requestedHashes.add(m.hash)
        log(`[peer ${peerId}] requesting "${m.filename}" (${m.hash.slice(0, 12)}...)`)
        send(conn, { type: 'want', hash: m.hash })
      }
    }

    if (msg.type === 'want') {
      const response = planWantResponse({ msg, localHashes })
      if (!response) return
      if (!seedingPolicy.isSeedingAllowed()) {
        log(`[peer ${peerId}] not seeding ${response.hash.slice(0, 12)}... — seeding disabled`)
        return
      }
      touchContent(contentDir, response.hash)
      const content = readContent(contentDir, response.hash).toString('base64')
      send(conn, { type: 'data', hash: response.hash, content })
      log(`[peer ${peerId}] sent content for ${response.hash.slice(0, 12)}...`)
    }

    if (msg.type === 'data') {
      const result = applyDataMessage({ msg, knownManifests })
      if (!result.accept) {
        if (result.reason === 'hash-mismatch') {
          log(`[peer ${peerId}] REJECTED content — hash mismatch (expected ${result.expectedHash.slice(0, 12)}, got ${result.actualHash.slice(0, 12)})`)
        } else {
          log(`[peer ${peerId}] REJECTED content — no verified manifest for this hash`)
        }
        return
      }
      onContentObtained(result.manifest, result.bytes, `peer ${peerId}`)
    }

    if (msg.type === 'session-start') {
      const result = applySessionStartMessage({ msg, courseIds, publicKeyHex, knownSessions })
      if (!result.accept) {
        // 'duplicate' is the expected steady state under flood-gossip (the
        // same announcement arrives from more than one peer) — only a
        // genuine rejection is worth logging.
        if (result.reason !== 'duplicate') {
          log(`[peer ${peerId}] rejected session-start for "${msg.session.sessionId}" — ${result.reason}`)
        }
        return
      }
      log(`[peer ${peerId}] live session "${msg.session.sessionId}" started for course "${msg.session.courseId}"`)
      relayToOthers(peerId, msg)
      for (const h of sessionStartHandlers) h(msg.session)
    }

    if (msg.type === 'segment') {
      const result = applySegmentMessage({ msg, courseIds, publicKeyHex, seenSegments })
      if (!result.accept) {
        if (result.reason !== 'duplicate') {
          log(`[peer ${peerId}] rejected segment ${msg.segment.sessionId}:${msg.segment.seq} — ${result.reason}`)
        }
        return
      }

      relayToOthers(peerId, msg)

      // Gap detection: if this segment's seq is ahead of what we'd
      // consecutively seen for this session, everything in between was
      // never delivered by the swarm — fall back to origin for exactly
      // those, the same "time budget, then origin" shape files use.
      const { sessionId, seq } = result.segment
      const lastSeq = lastSeqBySession.get(sessionId)
      if (lastSeq !== undefined && seq > lastSeq + 1) {
        for (let missing = lastSeq + 1; missing < seq; missing++) {
          considerMissingSegment(sessionId, missing)
        }
      }
      if (lastSeq === undefined || seq > lastSeq) {
        lastSeqBySession.set(sessionId, seq)
      }

      for (const h of segmentHandlers) h(result.segment, result.bytes)
    }
  }

  // Shared by both discovery paths (ADR-0006): a Hyperswarm 'connection'
  // event and a lan-discovery.ts TCP socket both end up here, since the
  // wire protocol (handleMessage/send) only needs a Duplex and has no
  // opinion on how the connection was established.
  function attachPeer (conn: Duplex, peerId: string): void {
    log(`\n[peer ${peerId}] connected`)
    tracker.peerConnected()
    connectedPeers.set(peerId, conn)

    let buffer = ''
    conn.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      let idx
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        if (line.trim().length === 0) continue
        try {
          handleMessage(JSON.parse(line) as WireMessage, conn, peerId)
        } catch (err) {
          // A malformed line from one peer must not take down a
          // long-running desktop process — surface it and move on,
          // instead of letting the exception escape this event handler.
          emitError(err instanceof Error ? err : new Error(String(err)))
        }
      }
    })

    // Per-peer connection errors are transient (one flaky peer) and
    // already recoverable — logged, not routed to onError, so the tray
    // doesn't flip to a global error state over one peer's hiccup.
    conn.on('error', (err: Error) => log(`[peer ${peerId}] connection error: ${err.message}`))
    conn.on('close', () => {
      log(`[peer ${peerId}] disconnected`)
      tracker.peerDisconnected()
      connectedPeers.delete(peerId)
    })

    // Announce every manifest we know of across all our enrolled courses —
    // the peer on the other end filters down to whichever of those (if any)
    // it's also enrolled in (applyManifestsMessage, above).
    send(conn, planManifestsAnnouncement(knownManifests))

    // Catch up a newly connected peer on any session already in progress —
    // without this, a peer joining after the initial flood wave (the only
    // point relayToOthers fires from) would never learn a live session
    // exists at all, since nothing else re-announces it once every
    // already-connected peer has already accepted and stopped relaying it.
    for (const session of knownSessions.values()) {
      send(conn, { type: 'session-start', session } satisfies SessionStartMessage)
    }
  }

  return {
    onPeerCountChange: tracker.onPeerCountChange,
    onSyncStart: tracker.onSyncStart,
    onSyncEnd: tracker.onSyncEnd,
    onError: (handler) => { errorHandlers.push(handler) },
    checkOriginForManifests,
    getKnownManifests: () => Array.from(knownManifests.values()),

    onSessionStart: (handler) => { sessionStartHandlers.push(handler) },
    onSegment: (handler) => { segmentHandlers.push(handler) },

    startLiveSession (courseId: string): SignedSessionStart {
      if (!keypair) throw new Error('startLiveSession requires a keypair (this node was not configured with one)')
      const session = signSessionStart({
        sessionId: crypto.randomUUID(),
        courseId,
        startedAt: Date.now()
      }, keypair.secretKey)
      knownSessions.set(session.sessionId, session)
      const msg: SessionStartMessage = { type: 'session-start', session }
      for (const conn of connectedPeers.values()) send(conn, msg)
      log(`live session "${session.sessionId}" started for course "${courseId}"`)
      return session
    },

    publishSegment (sessionId: string, courseId: string, seq: number, bytes: Buffer): SignedLiveSegment {
      if (!keypair) throw new Error('publishSegment requires a keypair (this node was not configured with one)')
      const segment = signLiveSegment({
        sessionId, courseId, seq,
        hash: hashBuffer(bytes),
        size: bytes.length,
        timestamp: Date.now()
      }, keypair.secretKey)
      seenSegments.add(`${sessionId}:${seq}`)
      const existing = lastSeqBySession.get(sessionId)
      if (existing === undefined || seq > existing) lastSeqBySession.set(sessionId, seq)
      const msg: SegmentMessage = { type: 'segment', segment, content: bytes.toString('base64') }
      for (const conn of connectedPeers.values()) send(conn, msg)

      const recording = sessionRecordings.get(sessionId) || { courseId, chunks: [] }
      recording.chunks.push(bytes)
      sessionRecordings.set(sessionId, recording)

      return segment
    },

    finishLiveSession (sessionId: string, filename: string): IngestResult {
      if (!keypair) throw new Error('finishLiveSession requires a keypair (this node was not configured with one)')
      const recording = sessionRecordings.get(sessionId)
      if (!recording || recording.chunks.length === 0) {
        throw new Error(`no published segments to finish for session "${sessionId}" — this node never published to it`)
      }

      const buf = Buffer.concat(recording.chunks)
      const result = ingestBuffer({ courseId: recording.courseId, filename, buf, keypair, paths })
      sessionRecordings.delete(sessionId)
      log(`live session "${sessionId}" recording published as "${filename}" (${result.deduped ? 'deduped' : 'new'})`)
      return result
    },

    async start (): Promise<void> {
      swarm = new Hyperswarm()

      // Anything missing at startup should start its origin-fallback clock
      // immediately, not only once a peer happens to mention it.
      for (const m of knownManifests.values()) {
        if (!localHashes.has(m.hash)) considerMissing(m)
      }

      // §5.5 "on app open" check-in — runs once here regardless of interval
      // config; manifestSyncIntervalMs (below) only controls whether it
      // repeats after this.
      void checkOriginForManifests()
      if (manifestListFetcher && manifestSyncIntervalMs) {
        manifestSyncTimer = setInterval(() => { void checkOriginForManifests() }, manifestSyncIntervalMs)
        if (typeof manifestSyncTimer.unref === 'function') manifestSyncTimer.unref()
      }

      swarm.on('connection', (conn: Duplex, info) => {
        attachPeer(conn, b4a.toString(info.publicKey, 'hex').slice(0, 8))
      })

      // One DHT topic join (Tier 3) + one LanDiscovery (Tier 1) + one
      // region topic join (Tier 2, if configured) per enrolled course —
      // Hyperswarm's 'connection' event fires per-connection regardless of
      // which joined topic produced it, so attachPeer above already covers
      // every course's peers without per-topic handling.
      for (const id of courseIds) {
        const topic = topicForCourse(id)

        const lanDiscovery = createLanDiscovery({
          topic,
          onConnection: (socket) => attachPeer(socket, `lan-${++lanPeerCounter}`),
          onError: (err) => log(`[lan-discovery] ${err.message}`)
        })
        await lanDiscovery.start()
        lanDiscoveries.push(lanDiscovery)

        const discovery = swarm.join(topic, { server: true, client: true })
        try {
          await discovery.flushed()
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          emitError(error)
          throw error
        }
        log(`\nJoined swarm topic for course "${id}". Waiting for peers...`)

        if (region) {
          const regionDiscovery = swarm.join(topicForCourseAndRegion(id, region), { server: true, client: true })
          try {
            await regionDiscovery.flushed()
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            emitError(error)
            throw error
          }
          log(`Joined regional swarm topic "${region}" for course "${id}".`)
        }
      }
    },

    async stop (): Promise<void> {
      if (manifestSyncTimer) {
        clearInterval(manifestSyncTimer)
        manifestSyncTimer = undefined
      }
      await Promise.all(lanDiscoveries.map((d) => d.stop()))
      lanDiscoveries = []
      if (!swarm) return
      await swarm.destroy()
      swarm = undefined
    }
  }
}

// CLI-shaped wrapper — keeps `npx tsx src/peer-node.ts <courseIds>
// --content-dir=./content-store --pubkey=<hex> [--origin=<baseUrl>]
// [--origin-timeout-ms=<n>] [--max-store-bytes=<n>] [--seed=on|off|auto]`
// working exactly as documented in apps/mode-a-headless's README.
// <courseIds> is comma-separated (e.g. `COMSCI214,MATH101`) — a student is
// normally enrolled in more than one course. All real logic lives in
// createSwarmNode above; this only parses argv, prints the setup banner,
// and starts the engine.
interface Opts {
  courseIds?: string
  [key: string]: string | undefined
}

function parseArgs (argv: string[]): Opts {
  const [courseIds, ...rest] = argv
  const opts: Opts = { courseIds }
  for (const arg of rest) {
    const m = arg.match(/^--([^=]+)=(.*)$/)
    if (m) opts[m[1]] = m[2]
  }
  return opts
}

export async function run (argv: string[], paths: Paths): Promise<void> {
  const opts = parseArgs(argv)
  if (!opts.courseIds) {
    console.log('Usage: peer-node <courseIds> --content-dir=<path> [--pubkey=<hex>] [--origin=<baseUrl>] [--manifest-origin=<baseUrl>] [--bearer-token=<token>] [--manifest-sync-interval-ms=<n>] [--max-store-bytes=<n>] [--seed=on|off|auto] [--region=<tag>]\n  <courseIds> is comma-separated, e.g. COMSCI214,MATH101\n  --bearer-token is required when --origin/--manifest-origin point at a live apps/mode-b-api (session-gated routes)')
    process.exit(1)
  }
  const courseIds = opts.courseIds.split(',').map((id) => id.trim()).filter((id) => id.length > 0)

  // Deliberately CWD-relative, not tied to `paths.rootDir` — matches the
  // original spike's behaviour and the README's documented invocations.
  const contentDir = path.resolve(opts['content-dir'] || './content-store')
  const publicKeyHex = opts.pubkey || loadPublicKeyHex(paths)

  // Both origin.ts's httpOriginFetcher and manifest-sync.ts's
  // httpManifestListFetcher take the same optional Authorization header — a
  // real apps/mode-b-api origin gates both routes behind a session, unlike
  // an LMS origin. --bearer-token is the Mode A CLI's own credential story
  // for that (Open Question #9(a)); apps/mode-a-desktop's Settings-panel
  // login flow is the other caller of the same header option.
  const authHeaders = opts['bearer-token'] ? { Authorization: `Bearer ${opts['bearer-token']}` } : undefined

  const originFetcher = opts.origin ? httpOriginFetcher(opts.origin, authHeaders) : undefined
  const originTimeoutMs = opts['origin-timeout-ms'] ? Number(opts['origin-timeout-ms']) : DEFAULT_ORIGIN_TIMEOUT_MS
  // Separate from --origin: a real origin (e.g. apps/mode-b-api) serves the
  // manifest list and file bytes from different routes, so this is its own
  // base URL rather than derived from --origin (see manifest-sync.ts).
  const manifestListFetcher = opts['manifest-origin'] ? httpManifestListFetcher(opts['manifest-origin'], authHeaders) : undefined
  const manifestSyncIntervalMs = opts['manifest-sync-interval-ms'] ? Number(opts['manifest-sync-interval-ms']) : undefined
  const maxStoreBytes = opts['max-store-bytes'] ? Number(opts['max-store-bytes']) : undefined
  const seedingPolicy: SeedingPolicy =
    opts.seed === 'off' ? fixedSeedingPolicy(false)
      : opts.seed === 'auto' ? networkAwareSeedingPolicy()
        : alwaysAllowSeeding()

  console.log(`Course(s):     ${courseIds.join(', ')}`)
  console.log(`Content dir:   ${contentDir}`)
  console.log(`Trusting key:  ${publicKeyHex.slice(0, 16)}...`)
  console.log(`Origin:        ${opts.origin ? `${opts.origin} (timeout ${originTimeoutMs}ms)` : 'none configured'}`)
  console.log(`Manifest origin: ${opts['manifest-origin'] ? `${opts['manifest-origin']}${manifestSyncIntervalMs ? ` (every ${manifestSyncIntervalMs}ms)` : ' (on start only)'}` : 'none configured'}`)
  console.log(`Storage cap:   ${maxStoreBytes ? `${maxStoreBytes} bytes` : 'unlimited'}`)
  console.log(`Seeding:       ${opts.seed === 'off' ? 'disabled (--seed=off)' : opts.seed === 'auto' ? 'auto (network-type detection, Windows only today)' : 'enabled'}`)
  console.log(`Region (Tier 2): ${opts.region || 'none configured'}`)

  const node = createSwarmNode({
    courseIds, contentDir, publicKeyHex, paths,
    originFetcher, originTimeoutMs, manifestListFetcher, manifestSyncIntervalMs,
    maxStoreBytes, seedingPolicy, region: opts.region
  })
  node.onError((err) => console.error('Engine error:', err.message))
  await node.start()
}
