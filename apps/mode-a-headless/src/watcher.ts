// Thin shim: keeps `npx tsx src/watcher.ts <courseId> <path>` working exactly
// as documented in the README. Real logic lives in ingest-adapter.ts
// (argv/console handling) and @campvus/engine's ingest (the shared pipeline).

import { run } from './ingest-adapter'

if (require.main === module) {
  run(process.argv.slice(2))
}

export { run }
