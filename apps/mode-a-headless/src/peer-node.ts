// Thin shim: keeps `npx tsx src/peer-node.ts <courseId> --content-dir=... [--pubkey=...]`
// working exactly as documented in the README. Real logic lives in
// @campvus/engine's swarm-node.

import { run } from '@campvus/engine'
import { getPaths } from './paths'

if (require.main === module) {
  run(process.argv.slice(2), getPaths()).catch((err: Error) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}

export { run }
