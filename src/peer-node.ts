// Thin shim: keeps `npx tsx src/peer-node.ts <courseId> --content-dir=... [--pubkey=...]`
// working exactly as documented in the README. Real logic lives in
// engine/swarm-node.ts.

import { run } from './engine/swarm-node'

if (require.main === module) {
  run(process.argv.slice(2)).catch((err: Error) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}

export { run }
