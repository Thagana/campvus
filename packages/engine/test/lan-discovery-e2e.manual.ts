// Manual smoke test, not part of the automated suite (see README) — mDNS
// needs real multicast UDP, which sandboxed/CI environments often block or
// don't route reliably, the same reason swarm-node.ts's own LAN behavior is
// documented as manually verified on real hardware rather than automated.
// Run directly: npx tsx test/lan-discovery-e2e.manual.ts
import crypto from 'crypto'
import { createLanDiscovery } from '../src/lan-discovery'

async function main (): Promise<void> {
  const topic = crypto.createHash('sha256').update('manual-test-topic').digest()
  let connections = 0

  const a = createLanDiscovery({
    topic,
    onConnection: () => { connections++; console.log('A: got a connection') },
    onError: (err) => console.error('A error:', err.message)
  })
  const b = createLanDiscovery({
    topic,
    onConnection: () => { connections++; console.log('B: got a connection') },
    onError: (err) => console.error('B error:', err.message)
  })

  await a.start()
  await b.start()
  console.log('Both nodes started, waiting up to 10s for mutual discovery...')

  await new Promise((resolve) => setTimeout(resolve, 10000))

  console.log(`Total onConnection calls across both sides: ${connections} (expect 2 — one per side)`)
  await a.stop()
  await b.stop()
  process.exit(connections >= 2 ? 0 : 1)
}

main().catch((err) => { console.error(err); process.exit(1) })
