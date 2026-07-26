// I/O shell around the shared swarm protocol (./swarm-protocol.ts):
// Hyperswarm wiring, manifest-store/content-store reads+writes, and the
// console output the spike prints. This is the piece that validates the
// single highest-risk assumption in the architecture: that two devices can
// discover each other and exchange signed, verified content over
// Hyperswarm without any central server in the loop beyond the DHT itself
// — confirmed on two physical laptops on the same Wi-Fi (see README).
//
// `paths` (where the local manifest registry / institution public key live)
// is supplied by the caller — the engine has no opinion on where an app's
// state lives, only on how to use it once given.
//
// Usage (via the app's CLI shim):
//   npx tsx src/peer-node.ts <courseId> --content-dir=./content-store --pubkey=<hex>
//   npx tsx src/peer-node.ts <courseId> --content-dir=./incoming --pubkey=<hex>
//     [--origin=<baseUrl>] [--origin-timeout-ms=<n>] [--max-store-bytes=<n>] [--seed=on|off|auto]

import path from 'path'
import { Duplex } from 'stream'
import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import { loadRegistry } from './manifest-store'
import { listContentHashes, readContent, writeContent, touchContent } from './content-store'
import { loadPublicKeyHex } from './identity'
import { verifyManifest } from './crypto-utils'
import { topicForCourse } from './topics'
import {
  planManifestsAnnouncement,
  applyManifestsMessage,
  planWantResponse,
  applyDataMessage,
  ManifestsMessage,
  WantMessage,
  DataMessage
} from './swarm-protocol'
import { httpOriginFetcher, scheduleOriginFallback } from './origin'
import { enforceStorageCap } from './eviction'
import { alwaysAllowSeeding, fixedSeedingPolicy, networkAwareSeedingPolicy, SeedingPolicy } from './seeding-policy'
import { Paths } from './paths'
import { SignedManifest } from './types'

type WireMessage = ManifestsMessage | WantMessage | DataMessage

const DEFAULT_ORIGIN_TIMEOUT_MS = 15000
// How long to wait for the peer we already asked before allowing a
// re-request to a different peer. Deliberately decoupled from the origin
// timeout: this is about not getting stuck on one unresponsive peer, not
// about giving up on the swarm entirely.
const PEER_RETRY_TIMEOUT_MS = 10000

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
    console.log('Usage: peer-node <courseId> --content-dir=<path> [--pubkey=<hex>] [--origin=<baseUrl>] [--max-store-bytes=<n>] [--seed=on|off|auto]')
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

  // Known manifests for this course, keyed by hash. Seeded from any local
  // registry.json (the "origin" machine will have one); other peers start
  // empty and learn manifests from whoever they connect to.
  const knownManifests = new Map<string, SignedManifest>()
  for (const m of loadRegistry(paths)) {
    if (m.courseId === courseId && verifyManifest(m, publicKeyHex)) {
      knownManifests.set(m.hash, m)
    }
  }
  console.log(`Starting with ${knownManifests.size} locally known, signature-verified manifest(s).`)

  const localHashes = listContentHashes(contentDir)
  console.log(`Starting with ${localHashes.size} content file(s) already on disk.`)

  // Hashes we've already sent a 'want' for to some peer — avoids asking
  // every connected peer redundantly for the same file. Cleared once the
  // content arrives, or after PEER_RETRY_TIMEOUT_MS if it never does, so a
  // later manifest announcement can retry with a different peer.
  const requestedHashes = new Set<string>()
  const retryScheduled = new Set<string>()
  const originScheduled = new Set<string>()

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
    console.log(`[${source}] downloaded and verified "${manifest.filename}" — now seeding it too`)
  }

  function considerMissing (manifest: SignedManifest): void {
    scheduleRetryClear(manifest.hash)
    if (originFetcher) {
      scheduleOriginFallback(manifest, {
        hasLocally: (hash) => localHashes.has(hash),
        fetchFromOrigin: originFetcher,
        timeoutMs: originTimeoutMs,
        onSuccess: (m, bytes) => onContentObtained(m, bytes, 'origin'),
        onFailure: (m, reason) => {
          console.log(`[origin] failed to fetch "${m.filename}" (${reason}) — still waiting on peers`)
        }
      }, originScheduled)
    }
  }

  const swarm = new Hyperswarm()
  const topic = topicForCourse(courseId)

  // Anything missing at startup should start its origin-fallback clock
  // immediately, not only once a peer happens to mention it.
  for (const m of knownManifests.values()) {
    if (!localHashes.has(m.hash)) considerMissing(m)
  }

  swarm.on('connection', (conn: Duplex, info) => {
    const peerId = b4a.toString(info.publicKey, 'hex').slice(0, 8)
    console.log(`\n[peer ${peerId}] connected`)

    let buffer = ''
    conn.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      let idx
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        if (line.trim().length > 0) handleMessage(JSON.parse(line) as WireMessage, conn, peerId)
      }
    })

    conn.on('error', (err: Error) => console.log(`[peer ${peerId}] connection error:`, err.message))
    conn.on('close', () => console.log(`[peer ${peerId}] disconnected`))

    // Announce every manifest we know of for this course.
    send(conn, planManifestsAnnouncement(knownManifests))
  })

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
        console.log(`[peer ${peerId}] rejected manifest for "${r.filename}" — signature invalid`)
      }
      if (learned.length > 0) {
        console.log(`[peer ${peerId}] learned ${learned.length} new verified manifest(s)`)
      }

      // Ask for anything we don't already have — but only once per hash at
      // a time (prefer whichever peer we already asked, rather than
      // requesting the same file from every connected peer in parallel).
      for (const m of toRequest) {
        considerMissing(m)
        if (requestedHashes.has(m.hash)) continue
        requestedHashes.add(m.hash)
        console.log(`[peer ${peerId}] requesting "${m.filename}" (${m.hash.slice(0, 12)}...)`)
        send(conn, { type: 'want', hash: m.hash })
      }
    }

    if (msg.type === 'want') {
      const response = planWantResponse({ msg, localHashes })
      if (!response) return
      if (!seedingPolicy.isSeedingAllowed()) {
        console.log(`[peer ${peerId}] not seeding ${response.hash.slice(0, 12)}... — seeding disabled`)
        return
      }
      touchContent(contentDir, response.hash)
      const content = readContent(contentDir, response.hash).toString('base64')
      send(conn, { type: 'data', hash: response.hash, content })
      console.log(`[peer ${peerId}] sent content for ${response.hash.slice(0, 12)}...`)
    }

    if (msg.type === 'data') {
      const result = applyDataMessage({ msg, knownManifests })
      if (!result.accept) {
        if (result.reason === 'hash-mismatch') {
          console.log(`[peer ${peerId}] REJECTED content — hash mismatch (expected ${result.expectedHash.slice(0, 12)}, got ${result.actualHash.slice(0, 12)})`)
        } else {
          console.log(`[peer ${peerId}] REJECTED content — no verified manifest for this hash`)
        }
        return
      }
      onContentObtained(result.manifest, result.bytes, `peer ${peerId}`)
    }
  }

  const discovery = swarm.join(topic, { server: true, client: true })
  await discovery.flushed()
  console.log(`\nJoined swarm topic for course "${courseId}". Waiting for peers...`)
}
