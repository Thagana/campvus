// Thin shim: keeps `node src/peer-node.js <courseId> --content-dir=... [--pubkey=...]`
// working exactly as documented in the README. Real logic lives in
// engine/swarm-node.js.

const { run } = require('./engine/swarm-node')

if (require.main === module) {
  run(process.argv.slice(2)).catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}

module.exports = { run }
