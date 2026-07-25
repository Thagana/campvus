// I/O shell around the shared swarm protocol (./swarm-protocol.js):
// Hyperswarm wiring, manifest-store/content-store reads+writes, and the
// console output the spike prints. This is the piece that validates the
// single highest-risk assumption in the architecture: that two devices can
// discover each other and exchange signed, verified content over
// Hyperswarm without any central server in the loop beyond the DHT itself.
//
// Usage:
//   node src/peer-node.js <courseId> --content-dir=./content-store --pubkey=<hex>
//   node src/peer-node.js <courseId> --content-dir=./incoming --pubkey=<hex>

const path = require('path')
const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')
const { loadRegistry } = require('./manifest-store')
const { listContentHashes, readContent, writeContent } = require('./content-store')
const { loadPublicKeyHex } = require('./identity')
const { verifyManifest } = require('./crypto-utils')
const { topicForCourse } = require('./topics')
const {
  planManifestsAnnouncement,
  applyManifestsMessage,
  planWantResponse,
  applyDataMessage
} = require('./swarm-protocol')
const { resolvePaths } = require('../config/paths')

function parseArgs (argv) {
  const [courseId, ...rest] = argv
  const opts = { courseId }
  for (const arg of rest) {
    const m = arg.match(/^--([^=]+)=(.*)$/)
    if (m) opts[m[1]] = m[2]
  }
  return opts
}

async function run (argv) {
  const opts = parseArgs(argv)
  if (!opts.courseId) {
    console.log('Usage: node src/peer-node.js <courseId> --content-dir=<path> [--pubkey=<hex>]')
    process.exit(1)
  }

  const paths = resolvePaths()
  // Deliberately CWD-relative, not repo-root-relative — matches the
  // original spike's behaviour and the README's documented invocations.
  const contentDir = path.resolve(opts['content-dir'] || './content-store')
  const publicKeyHex = opts.pubkey || loadPublicKeyHex(paths)

  console.log(`Course:        ${opts.courseId}`)
  console.log(`Content dir:   ${contentDir}`)
  console.log(`Trusting key:  ${publicKeyHex.slice(0, 16)}...`)

  // Known manifests for this course, keyed by hash. Seeded from any local
  // registry.json (the "origin" machine will have one); other peers start
  // empty and learn manifests from whoever they connect to.
  const knownManifests = new Map()
  for (const m of loadRegistry(paths)) {
    if (m.courseId === opts.courseId && verifyManifest(m, publicKeyHex)) {
      knownManifests.set(m.hash, m)
    }
  }
  console.log(`Starting with ${knownManifests.size} locally known, signature-verified manifest(s).`)

  const localHashes = listContentHashes(contentDir)
  console.log(`Starting with ${localHashes.size} content file(s) already on disk.`)

  const swarm = new Hyperswarm()
  const topic = topicForCourse(opts.courseId)

  swarm.on('connection', (conn, info) => {
    const peerId = b4a.toString(info.publicKey, 'hex').slice(0, 8)
    console.log(`\n[peer ${peerId}] connected`)

    let buffer = ''
    conn.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let idx
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        if (line.trim().length > 0) handleMessage(JSON.parse(line), conn, peerId)
      }
    })

    conn.on('error', (err) => console.log(`[peer ${peerId}] connection error:`, err.message))
    conn.on('close', () => console.log(`[peer ${peerId}] disconnected`))

    // Announce every manifest we know of for this course.
    send(conn, planManifestsAnnouncement(knownManifests))
  })

  function send (conn, obj) {
    conn.write(JSON.stringify(obj) + '\n')
  }

  function handleMessage (msg, conn, peerId) {
    if (msg.type === 'manifests') {
      const { rejected, learned, toRequest } = applyManifestsMessage({
        msg,
        courseId: opts.courseId,
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
  console.log(`\nJoined swarm topic for course "${opts.courseId}". Waiting for peers...`)
}

module.exports = { run, parseArgs }
