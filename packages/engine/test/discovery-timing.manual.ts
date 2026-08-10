// Manual smoke test / sandbox for measuring peer-discovery timing — not
// part of the automated suite, same reason as lan-discovery-e2e.manual.ts:
// mDNS needs real multicast UDP and the wide DHT needs a real bootstrap
// network, neither of which sandboxed/CI environments reliably provide.
//
// Runs several independent two-node discovery attempts in this one process
// and reports, per discovery tier (see swarm-node.ts's DiscoveryTier), how
// many milliseconds elapsed between start() and the first connection
// tagged with that tier — read from the onPeerConnected hook, not scraped
// from logs.
//
// IMPORTANT: this only exercises same-machine conditions (LAN mDNS +
// whatever DHT bootstrap looks like from one machine talking to itself) —
// it CANNOT simulate "WiFi laptop vs mobile-data laptop" cross-network
// conditions, since that needs two genuinely separate network paths. For
// that, run two separate instances of the existing CLI on two real
// machines/networks (see apps/mode-a-headless/README.md's "LAN peer
// discovery" walkthrough, or `npx tsx src/peer-node.ts <courseId>
// --content-dir=...` from this package directly) — the
// "[peer ...] connected via <tier> (+Nms since start)" log line
// swarm-node.ts's default logger now prints already reports exactly this
// number in that scenario, no separate script needed.
//
// Run directly: npx tsx test/discovery-timing.manual.ts [trials]
// (defaults to 5 trials if omitted)

import fs from 'fs'
import path from 'path'
import os from 'os'
import nacl from 'tweetnacl'
import b4a from 'b4a'
import { resolvePaths, Paths } from '../src/paths'
import { createSwarmNode, DiscoveryTier } from '../src/swarm-node'

const COURSE_ID = 'DISCOVERY-TIMING-DEMO'
const PER_TRIAL_TIMEOUT_MS = 15000

function tmpPaths (label: string): Paths {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `campvus-discovery-timing-${label}-`))
  return resolvePaths(rootDir)
}

function sleep (ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface TrialResult {
  tier: DiscoveryTier | 'timeout'
  elapsedMs: number
}

async function runTrial (index: number): Promise<TrialResult> {
  const nacKeypair = nacl.sign.keyPair()
  const publicKeyHex = b4a.toString(nacKeypair.publicKey, 'hex')

  const aPaths = tmpPaths(`${index}-a`)
  const bPaths = tmpPaths(`${index}-b`)

  let settled = false
  let resolveFirst!: (r: TrialResult) => void
  const firstConnection = new Promise<TrialResult>((resolve) => { resolveFirst = resolve })
  const record = (info: { tier: DiscoveryTier, elapsedMs: number }): void => {
    if (settled) return
    settled = true
    resolveFirst({ tier: info.tier, elapsedMs: info.elapsedMs })
  }

  const a = createSwarmNode({
    courseIds: [COURSE_ID],
    contentDir: path.join(aPaths.rootDir, 'content'),
    publicKeyHex,
    paths: aPaths,
    log: () => {}
  })
  const b = createSwarmNode({
    courseIds: [COURSE_ID],
    contentDir: path.join(bPaths.rootDir, 'content'),
    publicKeyHex,
    paths: bPaths,
    log: () => {}
  })
  a.onPeerConnected(record)
  b.onPeerConnected(record)

  await a.start()
  await b.start()

  const result = await Promise.race([
    firstConnection,
    sleep(PER_TRIAL_TIMEOUT_MS).then((): TrialResult => ({ tier: 'timeout', elapsedMs: PER_TRIAL_TIMEOUT_MS }))
  ])

  await a.stop()
  await b.stop()
  fs.rmSync(aPaths.rootDir, { recursive: true, force: true })
  fs.rmSync(bPaths.rootDir, { recursive: true, force: true })

  return result
}

async function main (): Promise<void> {
  const trials = Number(process.argv[2]) || 5
  console.log(`Running ${trials} discovery trial(s), one fresh pair of nodes per trial (course "${COURSE_ID}")...\n`)

  const results: TrialResult[] = []
  for (let i = 0; i < trials; i++) {
    const result = await runTrial(i)
    console.log(`trial ${i + 1}/${trials}: ${result.tier} in ${result.elapsedMs}ms`)
    results.push(result)
  }

  const byTier = new Map<string, number[]>()
  for (const r of results) {
    const list = byTier.get(r.tier) || []
    list.push(r.elapsedMs)
    byTier.set(r.tier, list)
  }

  console.log('\n=== Summary ===')
  for (const [tier, times] of byTier) {
    const avg = times.reduce((sum, t) => sum + t, 0) / times.length
    console.log(`${tier}: ${times.length} trial(s), avg ${avg.toFixed(0)}ms, min ${Math.min(...times)}ms, max ${Math.max(...times)}ms`)
  }

  const timeouts = byTier.get('timeout')?.length || 0
  process.exit(timeouts === results.length ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
