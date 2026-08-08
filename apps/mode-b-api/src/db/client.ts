// Postgres via `postgres` (postgres.js) — a pure-JS driver with no native
// compile step (unlike `pg-native` or `better-sqlite3`, which need Visual
// Studio build tools this machine doesn't have). Wired through Drizzle's
// postgres-js driver so schema.ts stays ORM-idiomatic rather than raw SQL
// everywhere.
//
// No drizzle-kit migrations yet — DDL below is applied idempotently
// (`CREATE TABLE IF NOT EXISTS`) on every open. Fine for a pilot with one
// deployment; real migrations are a before-production concern, not a
// backend-API-first one.

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN NOT NULL,
    image TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    access_token_expires_at TIMESTAMPTZ,
    refresh_token_expires_at TIMESTAMPTZ,
    scope TEXT,
    id_token TEXT,
    password TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
  )`,

  `CREATE TABLE IF NOT EXISTS organization (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    metadata TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS member (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organization(id),
    user_id TEXT NOT NULL REFERENCES "user"(id),
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS invitation (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organization(id),
    email TEXT NOT NULL,
    role TEXT,
    status TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    inviter_id TEXT REFERENCES "user"(id)
  )`,

  `CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES organization(id),
    name TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    course_id TEXT NOT NULL REFERENCES courses(id),
    created_at BIGINT NOT NULL
  )`,

  'CREATE UNIQUE INDEX IF NOT EXISTS enrollments_user_course_unique ON enrollments(user_id, course_id)'
]

export type Db = ReturnType<typeof drizzle>

export interface OpenedDb {
  db: Db
  close: () => Promise<void>
}

export async function openDb (connectionString: string): Promise<OpenedDb> {
  const sql = postgres(connectionString)
  for (const statement of DDL_STATEMENTS) {
    await sql.unsafe(statement)
  }

  const db = drizzle(sql)

  return { db, close: () => sql.end() }
}
