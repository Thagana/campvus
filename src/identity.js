// Thin shim: keeps `node src/identity.js generate` working exactly as
// documented in the README. Real logic lives in engine/identity.js.

const { generateAndSaveKeypair, loadKeypair, loadPublicKeyHex } = require('./engine/identity')
const { resolvePaths } = require('./config/paths')

if (require.main === module) {
  const cmd = process.argv[2]
  if (cmd === 'generate') {
    const paths = resolvePaths()
    const record = generateAndSaveKeypair(paths)
    console.log('Institution keypair written to', paths.keyFile)
    console.log('Public key (distribute this to student apps):')
    console.log(record.publicKey)
  } else {
    console.log('Usage: node src/identity.js generate')
  }
}

module.exports = { generateAndSaveKeypair, loadKeypair, loadPublicKeyHex }
