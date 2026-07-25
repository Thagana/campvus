// Thin shim: keeps `npx tsx src/identity.ts generate` working exactly as
// documented in the README. Real logic lives in engine/identity.ts.

import { generateAndSaveKeypair, loadKeypair, loadPublicKeyHex } from './engine/identity'
import { resolvePaths } from './config/paths'

if (require.main === module) {
  const cmd = process.argv[2]
  if (cmd === 'generate') {
    const paths = resolvePaths()
    const record = generateAndSaveKeypair(paths)
    console.log('Institution keypair written to', paths.keyFile)
    console.log('Public key (distribute this to student apps):')
    console.log(record.publicKey)
  } else {
    console.log('Usage: npx tsx src/identity.ts generate')
  }
}

export { generateAndSaveKeypair, loadKeypair, loadPublicKeyHex }
