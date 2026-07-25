// Thin shim: keeps `node src/watcher.js <courseId> <path>` working exactly
// as documented in the README. Real logic lives in adapters/mode-a-watcher.js
// (argv/console handling) and engine/ingest.js (the shared pipeline).

const { run } = require('./adapters/mode-a-watcher')

if (require.main === module) {
  run(process.argv.slice(2))
}

module.exports = { run }
