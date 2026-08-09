import { openDb } from './src/db/client'
async function main() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) throw new Error('DATABASE_URL not set')
  const { close } = await openDb(dbUrl)
  console.log('Migrations applied successfully.')
  await close()
}
main().catch((err) => { console.error(err); process.exit(1) })
