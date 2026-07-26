import { loadKeypair } from '@campvus/engine'
import { openDb } from './db/client'
import { getPaths, getDbPath, ensureInstitutionKeypair, ensureAuthSecret } from './paths'
import { buildServer } from './server'

async function main (): Promise<void> {
  const paths = getPaths()
  ensureInstitutionKeypair(paths)
  const keypair = loadKeypair(paths)
  const authSecret = ensureAuthSecret()

  const { db } = openDb(getDbPath())

  const app = await buildServer({ db, paths, keypair, authSecret })

  const port = process.env.PORT ? Number(process.env.PORT) : 3000
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`Mode B API listening on http://localhost:${port}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
