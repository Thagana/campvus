// DB-backed sessions (not stateless JWTs) — a session can be revoked by
// deleting its row, which matters for a "logout everywhere" story later.
// The cookie only carries the opaque session id; nothing else is trusted
// client-side.

import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { Db } from '../db/client'
import { sessions, users } from '../db/schema'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export const SESSION_COOKIE_NAME = 'campvus_session'

export interface SessionUser {
  id: string
  email: string
}

export async function createSession (db: Db, userId: string): Promise<{ id: string, expiresAt: number }> {
  const id = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  const expiresAt = now + SESSION_TTL_MS
  await db.insert(sessions).values({ id, userId, createdAt: now, expiresAt })
  return { id, expiresAt }
}

export async function getSessionUser (db: Db, sessionId: string): Promise<SessionUser | null> {
  const rows = await db.select({ id: users.id, email: users.email, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  if (row.expiresAt < Date.now()) return null
  return { id: row.id, email: row.email }
}

export async function destroySession (db: Db, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}
