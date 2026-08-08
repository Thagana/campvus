// SQLite via Node's built-in `node:sqlite` module (experimental, but ships
// with Node itself — zero native-dependency footprint). better-sqlite3, the
// usual Drizzle SQLite driver, requires a native compile that fails on this
// machine (no Visual Studio build tools, no matching prebuilt binary).
// Wired through Drizzle's sqlite-proxy driver so schema.ts stays
// ORM-idiomatic rather than raw SQL everywhere.
//
// No drizzle-kit migrations yet — DDL below is applied idempotently
// (`CREATE TABLE IF NOT EXISTS`) on every open. Fine for a pilot with one
// deployment; real migrations are a before-production concern, not a
// backend-API-first one.

import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'

const DDL = `
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  id_token TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo TEXT,
  created_at INTEGER NOT NULL,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id),
  user_id TEXT NOT NULL REFERENCES user(id),
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invitation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id),
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  inviter_id TEXT REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES organization(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_user_course_unique ON enrollments(user_id, course_id);
`

export type Db = ReturnType<typeof drizzle>

export interface OpenedDb {
  db: Db
  close: () => void
}

export function openDb (dbPath: string): OpenedDb {
  const sqlite = new DatabaseSync(dbPath)
  sqlite.exec(DDL)

  const db = drizzle(async (sql, params, method) => {
    const stmt = sqlite.prepare(sql)
    if (method === 'run') {
      stmt.run(...params)
      return { rows: [] }
    }
    const rows = stmt.all(...params) as Record<string, unknown>[]
    if (method === 'get') {
      return { rows: rows[0] ? Object.values(rows[0]) : [] }
    }
    return { rows: rows.map(row => Object.values(row)) }
  })

  return { db, close: () => sqlite.close() }
}
