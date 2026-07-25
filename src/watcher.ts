// Thin shim: keeps `npx tsx src/watcher.ts <courseId> <path>` working exactly
// as documented in the README. Real logic lives in adapters/mode-a-watcher.ts
// (argv/console handling) and engine/ingest.ts (the shared pipeline).

import { run } from './adapters/mode-a-watcher'

if (require.main === module) {
  run(process.argv.slice(2))
}

export { run }
