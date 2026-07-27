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

import path from 'path'
import { Duplex } from 'stream'
import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import { loadRegistry } from './manifest-store'
import { listContentHashes, readContent, writeContent, touchContent } from './content-store'
import { loadPublicKeyHex } from './identity'
import { verifyManifest } from './crypto-utils'
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
import { httpOriginFetcher, scheduleOriginFallback, OriginFetcher } from './origin'
import { enforceStorageCap } from './eviction'
import { alwaysAllowSeeding, fixedSeedingPolicy, networkAwareSeedingPolicy, SeedingPolicy } from './seeding-policy'
import { createSyncStateTracker } from './sync-state'
import { Paths } from './paths'
import { SignedManifest } from './types'

type WireMessage = ManifestsMessage | WantMessage | DataMessage

const DEFAULT_ORIGIN_TIMEOUT_MS = 15000
// How long to wait for the peer we already asked before allowing a
// re-request to a different peer. Deliberately decoupled from the origin
// timeout: this is about not getting stuck on one unresponsive peer, not
// about giving up on the swarm entirely.
const PEER_RETRY_TIMEOUT_MS = 10000

export interface SwarmNodeOptions {
  courseId: string
  contentDir: string
  publicKeyHex: string
  paths: Paths
  originFetcher?: OriginFetcher
  originTimeoutMs?: number
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
}

export interface SwarmNode {
  start (): Promise<void>
  stop (): Promise<void>
  onPeerCountChange (handler: (count: number) => void): void
  onSyncStart (handler: () => void): void
  onSyncEnd (handler: () => void): void
  onError (handler: (err: Error) => void): void
}

export function createSwarmNode (options: SwarmNodeOptions): SwarmNode {
  const {
    courseId, contentDir, publicKeyHex, paths,
    originFetcher, maxStoreBytes, region,
    originTimeoutMs = DEFAULT_ORIGIN_TIMEOUT_MS,
    seedingPolicy = alwaysAllowSeeding(),
    log = (line: string) => console.log(line)
  } = options

  const tracker = createSyncStateTracker()
  const errorHandlers: Array<(err: Error) => void> = []
  const emitError = (err: Error): void => { for (const h of errorHandlers) h(err) }

  // Known manifests for this course, keyed by hash. Seeded from any local
  // registry.json (the "origin" machine will have one); other peers start
  // empty and learn manifests from whoever they connect to.
  const knownManifests = new Map<string, SignedManifest>()
  for (const m of loadRegistry(paths)) {
    if (m.courseId === courseId && verifyManifest(m, publicKeyHex)) {
      knownManifests.set(m.hash, m)
    }
  }
  log(`Starting with ${knownManifests.size} locally known, signature-verified manifest(s).`)

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
  let lanDiscovery: LanDiscovery | undefined
  let lanPeerCounter = 0

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

  function send (conn: Duplex, obj: unknown): void {
    conn.write(JSON.stringify(obj) + '\n')
  }

  function handleMessage (msg: WireMessage, conn: Duplex, peerId: string): void {
    if (msg.type === 'manifests') {
      const { rejected, learned, toRequest } = applyManifestsMessage({
        msg,
        courseId,
        publicKeyHex,
        knownManifests,
        localHashes
      })

      for (const r of rejected) {
        log(`[peer ${peerId}] rejected manifest for "${r.filename}" — signature invalid`)
      }
      if (learned.length > 0) {
        log(`[peer ${peerId}] learned ${learned.length} new verified manifest(s)`)
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
  }

  // Shared by both discovery paths (ADR-0006): a Hyperswarm 'connection'
  // event and a lan-discovery.ts TCP socket both end up here, since the
  // wire protocol (handleMessage/send) only needs a Duplex and has no
  // opinion on how the connection was established.
  function attachPeer (conn: Duplex, peerId: string): void {
    log(`\n[peer ${peerId}] connected`)
    tracker.peerConnected()

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
    })

    // Announce every manifest we know of for this course.
    send(conn, planManifestsAnnouncement(knownManifests))
  }

  return {
    onPeerCountChange: tracker.onPeerCountChange,
    onSyncStart: tracker.onSyncStart,
    onSyncEnd: tracker.onSyncEnd,
    onError: (handler) => { errorHandlers.push(handler) },

    async start (): Promise<void> {
      swarm = new Hyperswarm()
      const topic = topicForCourse(courseId)

      // Anything missing at startup should start its origin-fallback clock
      // immediately, not only once a peer happens to mention it.
      for (const m of knownManifests.values()) {
        if (!localHashes.has(m.hash)) considerMissing(m)
      }

      swarm.on('connection', (conn: Duplex, info) => {
        attachPeer(conn, b4a.toString(info.publicKey, 'hex').slice(0, 8))
      })

      // Tier 1 (ADR-0006): same-LAN peers found via mDNS, connected to
      // directly over plain TCP — a parallel path alongside the DHT join
      // below (Tier 3), not a replacement for it.
      lanDiscovery = createLanDiscovery({
        topic,
        onConnection: (socket) => attachPeer(socket, `lan-${++lanPeerCounter}`),
        onError: (err) => log(`[lan-discovery] ${err.message}`)
      })
      await lanDiscovery.start()

      const discovery = swarm.join(topic, { server: true, client: true })
      try {
        await discovery.flushed()
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        emitError(error)
        throw error
      }
      log(`\nJoined swarm topic for course "${courseId}". Waiting for peers...`)

      // Tier 2 (ADR-0006): a second, narrower topic on the same swarm —
      // Hyperswarm's 'connection' event fires per-connection regardless of
      // which joined topic produced it, so the handler above already
      // covers peers found this way too; nothing else to wire up.
      if (region) {
        const regionDiscovery = swarm.join(topicForCourseAndRegion(courseId, region), { server: true, client: true })
        try {
          await regionDiscovery.flushed()
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          emitError(error)
          throw error
        }
        log(`Joined regional swarm topic "${region}" for course "${courseId}".`)
      }
    },

    async stop (): Promise<void> {
      if (lanDiscovery) {
        await lanDiscovery.stop()
        lanDiscovery = undefined
      }
      if (!swarm) return
      await swarm.destroy()
      swarm = undefined
    }
  }
}

// CLI-shaped wrapper — keeps `npx tsx src/peer-node.ts <courseId>
// --content-dir=./content-store --pubkey=<hex> [--origin=<baseUrl>]
// [--origin-timeout-ms=<n>] [--max-store-bytes=<n>] [--seed=on|off|auto]`
// working exactly as documented in apps/mode-a-headless's README. All real
// logic lives in createSwarmNode above; this only parses argv, prints the
// setup banner, and starts the engine.
interface Opts {
  courseId?: string
  [key: string]: string | undefined
}

function parseArgs (argv: string[]): Opts {
  const [courseId, ...rest] = argv
  const opts: Opts = { courseId }
  for (const arg of rest) {
    const m = arg.match(/^--([^=]+)=(.*)$/)
    if (m) opts[m[1]] = m[2]
  }
  return opts
}

export async function run (argv: string[], paths: Paths): Promise<void> {
  const opts = parseArgs(argv)
  if (!opts.courseId) {
    console.log('Usage: peer-node <courseId> --content-dir=<path> [--pubkey=<hex>] [--origin=<baseUrl>] [--max-store-bytes=<n>] [--seed=on|off|auto] [--region=<tag>]')
    process.exit(1)
  }
  const courseId = opts.courseId

  // Deliberately CWD-relative, not tied to `paths.rootDir` — matches the
  // original spike's behaviour and the README's documented invocations.
  const contentDir = path.resolve(opts['content-dir'] || './content-store')
  const publicKeyHex = opts.pubkey || loadPublicKeyHex(paths)

  const originFetcher = opts.origin ? httpOriginFetcher(opts.origin) : undefined
  const originTimeoutMs = opts['origin-timeout-ms'] ? Number(opts['origin-timeout-ms']) : DEFAULT_ORIGIN_TIMEOUT_MS
  const maxStoreBytes = opts['max-store-bytes'] ? Number(opts['max-store-bytes']) : undefined
  const seedingPolicy: SeedingPolicy =
    opts.seed === 'off' ? fixedSeedingPolicy(false)
      : opts.seed === 'auto' ? networkAwareSeedingPolicy()
        : alwaysAllowSeeding()

  console.log(`Course:        ${courseId}`)
  console.log(`Content dir:   ${contentDir}`)
  console.log(`Trusting key:  ${publicKeyHex.slice(0, 16)}...`)
  console.log(`Origin:        ${opts.origin ? `${opts.origin} (timeout ${originTimeoutMs}ms)` : 'none configured'}`)
  console.log(`Storage cap:   ${maxStoreBytes ? `${maxStoreBytes} bytes` : 'unlimited'}`)
  console.log(`Seeding:       ${opts.seed === 'off' ? 'disabled (--seed=off)' : opts.seed === 'auto' ? 'auto (network-type detection, Windows only today)' : 'enabled'}`)
  console.log(`Region (Tier 2): ${opts.region || 'none configured'}`)

  const node = createSwarmNode({
    courseId, contentDir, publicKeyHex, paths,
    originFetcher, originTimeoutMs, maxStoreBytes, seedingPolicy, region: opts.region
  })
  node.onError((err) => console.error('Engine error:', err.message))
  await node.start()
}
