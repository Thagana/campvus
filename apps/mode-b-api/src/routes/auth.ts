import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { FastifyInstance } from 'fastify'
import { Db } from '../db/client'
import { users } from '../db/schema'
import { hashPassword, verifyPassword } from '../auth/password'
import { createSession, destroySession, SESSION_COOKIE_NAME } from '../auth/session'
import { requireAuth } from '../auth/guards'

// No institution-controlled account provisioning yet — anyone can
// register. Fine for a pilot with a small, trusted user set; invite-only
// or SSO provisioning is a before-real-deployment concern (open question
// #6), not a backend-API-first one.
export function registerAuthRoutes (app: FastifyInstance, db: Db): void {
  app.post<{ Body: { email?: string, password?: string } }>('/auth/register', async (request, reply) => {
    const { email, password } = request.body || {}
    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password are required' })
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (existing[0]) {
      return reply.code(409).send({ error: 'an account with this email already exists' })
    }

    const id = crypto.randomUUID()
    const passwordHash = await hashPassword(password)
    await db.insert(users).values({ id, email, passwordHash, createdAt: Date.now() })

    const session = await createSession(db, id)
    reply.setCookie(SESSION_COOKIE_NAME, session.id, { httpOnly: true, sameSite: 'lax', path: '/' })
    return reply.code(201).send({ id, email })
  })

  app.post<{ Body: { email?: string, password?: string } }>('/auth/login', async (request, reply) => {
    const { email, password } = request.body || {}
    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password are required' })
    }

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
    const user = rows[0]
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      return reply.code(401).send({ error: 'invalid email or password' })
    }

    const session = await createSession(db, user.id)
    reply.setCookie(SESSION_COOKIE_NAME, session.id, { httpOnly: true, sameSite: 'lax', path: '/' })
    return reply.send({ id: user.id, email: user.email })
  })

  app.post('/auth/logout', async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE_NAME]
    if (sessionId) await destroySession(db, sessionId)
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' })
    return reply.send({ ok: true })
  })

  app.get('/auth/me', async (request, reply) => {
    const user = requireAuth(request, reply)
    if (!user) return
    return reply.send(user)
  })
}
