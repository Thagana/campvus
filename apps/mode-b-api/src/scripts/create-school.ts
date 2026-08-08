// CLI entrypoint for the system-admin-only school-creation operation (ADR-0005).
// Thin wrapper around auth/create-school.ts's exported function — kept
// separate so tests can call that function directly without shelling out
// to this script.
import { openDb } from '../db/client'
import { createSchool } from '../auth/create-school'

async function main (): Promise<void> {
  const [name, founderEmail, slug] = process.argv.slice(2)
  if (!name || !founderEmail) {
    console.error('Usage: pnpm create-school "<school name>" <founder-email> [slug]')
    process.exit(1)
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required (Postgres connection string)')

  const { db, close } = await openDb(databaseUrl)
  try {
    const result = await createSchool(db, { name, founderEmail, slug })
    console.log(`School "${name}" created (id: ${result.organizationId}).`)
    console.log(`Founding Owner invitation created for ${founderEmail} (invitation id: ${result.invitationId}).`)
    console.log('They can accept it after signing up or signing in with that email.')
  } finally {
    await close()
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
