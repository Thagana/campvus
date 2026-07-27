import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { FastifyInstance } from 'fastify'
import { resolvePaths, Paths, generateAndSaveKeypair, loadKeypair } from '@campvus/engine'
import { openDb, Db } from '../src/db/client'
import { buildServer } from '../src/server'
import { createSchool } from '../src/auth/create-school'

export function tmpPaths (): Paths {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mode-b-api-test-'))
  return resolvePaths(rootDir)
}

export async function createTestApp (): Promise<{ app: FastifyInstance, db: Db }> {
  const paths = tmpPaths()
  generateAndSaveKeypair(paths)
  const keypair = loadKeypair(paths)
  const { db } = openDb(':memory:')
  // A random per-test secret, not paths.ts's ensureAuthSecret() — that
  // persists to this app's real data/ dir, which tests (unlike tmpPaths()
  // above) shouldn't touch.
  const authSecret = crypto.randomBytes(32).toString('hex')
  const app = await buildServer({ db, paths, keypair, authSecret })
  return { app, db }
}

interface InjectResponseLike {
  cookies: { name: string, value: string }[]
}

export function sessionCookieHeader (res: InjectResponseLike): string {
  const cookie = res.cookies.find(c => c.name.endsWith('session_token'))
  if (!cookie) throw new Error('no session cookie in response')
  return `${cookie.name}=${cookie.value}`
}

export async function registerUser (app: FastifyInstance, email: string, password = 'hunter22'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email, password, name: email }
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
  const ownerCookie = await registerUser(app, founderEmail)
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
  { organizationId, inviterCookie, email, role }: { organizationId: string, inviterCookie: string, email: string, role: string }
): Promise<{ invitationId: string, cookie: string, member: { id: string, role: string } }> {
  const invite = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/invite-member',
    headers: { cookie: inviterCookie, origin: 'http://localhost:80' },
    payload: { email, role, organizationId }
  })
  if (invite.statusCode !== 200) throw new Error(`invite to ${email} as ${role} failed: ${invite.body}`)

  const cookie = await registerUser(app, email)
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
