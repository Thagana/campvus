import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import http from 'http'
import type { AddressInfo } from 'net'
import { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { resolvePaths, Paths, generateAndSaveKeypair, loadKeypair } from '@campvus/engine'
import { openDb, Db } from '../src/db/client'
import { buildServer } from '../src/server'
import { createSchool } from '../src/auth/create-school'
import { user } from '../src/db/schema'

export function tmpPaths (): Paths {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mode-b-api-test-'))
  return resolvePaths(rootDir)
}

export async function createTestApp (): Promise<{ app: FastifyInstance, db: Db, paths: Paths, keypair: ReturnType<typeof loadKeypair> }> {
  const paths = tmpPaths()
  generateAndSaveKeypair(paths)
  const keypair = loadKeypair(paths)
  const { db } = openDb(':memory:')
  // A random per-test secret, not paths.ts's ensureAuthSecret() — that
  // persists to this app's real data/ dir, which tests (unlike tmpPaths()
  // above) shouldn't touch.
  const authSecret = crypto.randomBytes(32).toString('hex')
  const app = await buildServer({ db, paths, keypair, authSecret })
  return { app, db, paths, keypair }
}

interface InjectResponseLike {
  cookies: { name: string, value: string }[]
}

export function sessionCookieHeader (res: InjectResponseLike): string {
  const cookie = res.cookies.find(c => c.name.endsWith('session_token'))
  if (!cookie) throw new Error('no session cookie in response')
  return `${cookie.name}=${cookie.value}`
}

// Sign-up alone no longer grants a session (auth.ts's
// requireEmailVerification) — this stands in for "the user clicked the
// emailed verification link" by flipping emailVerified directly in the DB,
// then signs in for real to get a session cookie back.
export async function registerUser (app: FastifyInstance, db: Db, email: string, password = 'hunter22'): Promise<string> {
  await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email, password, name: email }
  })
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, email))
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email, password }
  })
  return sessionCookieHeader(res)
}

// Every School-scoped test needs a School with a signed-in Owner before it
// can exercise anything else, so this is shared setup rather than per-file.
export async function createSchoolWithOwner (
  app: FastifyInstance,
  db: Db,
  { name, founderEmail }: { name: string, founderEmail: string }
): Promise<{ organizationId: string, ownerCookie: string, ownerMemberId: string }> {
  const { organizationId, invitationId } = await createSchool(db, { name, founderEmail })
  const ownerCookie = await registerUser(app, db, founderEmail)
  const accept = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/accept-invitation',
    headers: { cookie: ownerCookie, origin: 'http://localhost:80' },
    payload: { invitationId }
  })
  if (accept.statusCode !== 200) throw new Error(`founding Owner failed to accept invitation: ${accept.body}`)
  return { organizationId, ownerCookie, ownerMemberId: accept.json().member.id }
}

// The invite-member -> sign-up -> accept-invitation triad, for tests that
// just need a member of a given role in place and don't care about the
// invite/accept mechanics themselves (those get their own dedicated tests).
export async function inviteAndAccept (
  app: FastifyInstance,
  db: Db,
  { organizationId, inviterCookie, email, role }: { organizationId: string, inviterCookie: string, email: string, role: string }
): Promise<{ invitationId: string, cookie: string, member: { id: string, role: string } }> {
  const invite = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/invite-member',
    headers: { cookie: inviterCookie, origin: 'http://localhost:80' },
    payload: { email, role, organizationId }
  })
  if (invite.statusCode !== 200) throw new Error(`invite to ${email} as ${role} failed: ${invite.body}`)

  const cookie = await registerUser(app, db, email)
  const invitationId = invite.json().id
  const accept = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/accept-invitation',
    headers: { cookie, origin: 'http://localhost:80' },
    payload: { invitationId }
  })
  if (accept.statusCode !== 200) throw new Error(`${email} failed to accept invitation: ${accept.body}`)
  return { invitationId, cookie, member: accept.json().member }
}

export interface ReceivedEmail { to: string, subject: string, html: string }

// Stands in for Brevo's real send-email endpoint so tests can assert an
// invitation/reset/verification email was actually sent, without ever
// calling the real Brevo API — same "spin up a real local server" seam
// origin.test.ts (packages/engine) uses for httpOriginFetcher, rather than
// mocking fetch itself. BREVO_API_URL is a test-only override (src/email/brevo.ts).
export async function withBrevoStandIn (
  fn: (received: () => ReceivedEmail[]) => Promise<void>
): Promise<void> {
  const received: ReceivedEmail[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      received.push({ to: body.to[0].email, subject: body.subject, html: body.htmlContent })
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ messageId: 'test' }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as AddressInfo).port
  const prevUrl = process.env.BREVO_API_URL
  const prevKey = process.env.BREVO_API_KEY
  process.env.BREVO_API_URL = `http://127.0.0.1:${port}`
  process.env.BREVO_API_KEY = 'test-key'
  try {
    await fn(() => received)
  } finally {
    // `process.env.X = undefined` coerces to the *string* "undefined"
    // (env vars are always strings) rather than actually unsetting it —
    // that string is truthy, so a later test reading it back would wrongly
    // conclude Brevo is configured. delete when there was no prior value.
    if (prevUrl === undefined) delete process.env.BREVO_API_URL
    else process.env.BREVO_API_URL = prevUrl
    if (prevKey === undefined) delete process.env.BREVO_API_KEY
    else process.env.BREVO_API_KEY = prevKey
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

export function multipartBody (
  filename: string,
  content: Buffer,
  boundary = 'testboundary123'
): { body: Buffer, contentType: string } {
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n'
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return { body: Buffer.concat([head, content, tail]), contentType: `multipart/form-data; boundary=${boundary}` }
}
