// I/O shell around the shared swarm protocol (./swarm-protocol.ts):
// Hyperswarm wiring, manifest-store/content-store reads+writes, and the
// console output the spike prints. This is the piece that validates the
// single highest-risk assumption in the architecture: that two devices can
// discover each other and exchange signed, verified content over
// Hyperswarm without any central server in the loop beyond the DHT itself.
//
// Usage:
//   npx tsx src/peer-node.ts <courseId> --content-dir=./content-store --pubkey=<hex>
//   npx tsx src/peer-node.ts <courseId> --content-dir=./incoming --pubkey=<hex>

import path from 'path'
import { Duplex } from 'stream'
import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import { loadRegistry } from './manifest-store'
import { listContentHashes, readContent, writeContent } from './content-store'
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
import { resolvePaths } from '../config/paths'
import { SignedManifest } from './types'

type WireMessage = ManifestsMessage | WantMessage | DataMessage

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

export async function run (argv: string[]): Promise<void> {
  const opts = parseArgs(argv)
  if (!opts.courseId) {
    console.log('Usage: npx tsx src/peer-node.ts <courseId> --content-dir=<path> [--pubkey=<hex>]')
    process.exit(1)
  }
  const courseId = opts.courseId

  const paths = resolvePaths()
  // Deliberately CWD-relative, not repo-root-relative — matches the
  // original spike's behaviour and the README's documented invocations.
  const contentDir = path.resolve(opts['content-dir'] || './content-store')
  const publicKeyHex = opts.pubkey || loadPublicKeyHex(paths)

  console.log(`Course:        ${courseId}`)
  console.log(`Content dir:   ${contentDir}`)
  console.log(`Trusting key:  ${publicKeyHex.slice(0, 16)}...`)

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

  const swarm = new Hyperswarm()
  const topic = topicForCourse(courseId)

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

      // Ask for anything we don't already have on disk.
      for (const m of toRequest) {
        console.log(`[peer ${peerId}] requesting "${m.filename}" (${m.hash.slice(0, 12)}...)`)
        send(conn, { type: 'want', hash: m.hash })
      }
    }

    if (msg.type === 'want') {
      const response = planWantResponse({ msg, localHashes })
      if (response) {
        const content = readContent(contentDir, response.hash).toString('base64')
        send(conn, { type: 'data', hash: response.hash, content })
        console.log(`[peer ${peerId}] sent content for ${response.hash.slice(0, 12)}...`)
      }
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
      writeContent(contentDir, msg.hash, result.bytes)
      localHashes.add(msg.hash)
      console.log(`[peer ${peerId}] downloaded and verified "${result.manifest.filename}" — now seeding it too`)
    }
  }

  const discovery = swarm.join(topic, { server: true, client: true })
  await discovery.flushed()
  console.log(`\nJoined swarm topic for course "${courseId}". Waiting for peers...`)
}
