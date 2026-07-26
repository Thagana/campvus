// Thin shim: keeps `npx tsx src/identity.ts generate` working exactly as
// documented in the README. Real logic lives in @campvus/engine.

import { generateAndSaveKeypair, loadKeypair, loadPublicKeyHex } from '@campvus/engine'
import { getPaths } from './paths'

if (require.main === module) {
  const cmd = process.argv[2]
  if (cmd === 'generate') {
    const paths = getPaths()
    const record = generateAndSaveKeypair(paths)
    console.log('Institution keypair written to', paths.keyFile)
    console.log('Public key (distribute this to student apps):')
    console.log(record.publicKey)
  } else {
    console.log('Usage: npx tsx src/identity.ts generate')
  }
}

export { generateAndSaveKeypair, loadKeypair, loadPublicKeyHex }
