// Postgres via `postgres` (postgres.js) — a pure-JS driver with no native
// compile step (unlike `pg-native` or `better-sqlite3`, which need Visual
// Studio build tools this machine doesn't have). Wired through Drizzle's
// postgres-js driver so schema.ts stays ORM-idiomatic rather than raw SQL
// everywhere.
//
// Real drizzle-kit migrations (see drizzle.config.ts + the drizzle/ folder,
// generated via `pnpm db:generate`) replace the hand-written idempotent DDL
// this used to run on every boot. The generated SQL matches schema.ts
// exactly, including the fact that schema.ts's better-auth tables use plain
// `timestamp` (no tz) rather than the old DDL's `TIMESTAMPTZ` — that was
// already a latent mismatch between schema.ts and the ad hoc DDL, not
// something this change introduces; schema.ts is now the actual source of
// truth for both the app and the DB.

import path from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

const MIGRATIONS_FOLDER = path.join(__dirname, '../../drizzle')

export type Db = ReturnType<typeof drizzle>

export interface OpenedDb {
  db: Db
  close: () => Promise<void>
}

export async function openDb (connectionString: string): Promise<OpenedDb> {
  const sql = postgres(connectionString)
  const db = drizzle(sql)
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })

  return { db, close: () => sql.end() }
}
