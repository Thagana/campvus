import test from 'node:test'
import assert from 'node:assert/strict'
import { FastifyInstance } from 'fastify'
import { createTestApp, createSchoolWithOwner, inviteAndAccept, multipartBody } from './helpers'

// The bearer plugin (auth/auth.ts) is what closes Open Question #9(a),
// docs/ARCHITECTURE.md — a non-browser client (apps/mode-a-desktop) has no
// cookie jar, so it authenticates every request with
// `Authorization: Bearer <token>` instead. Sign-in hands that token back in
// a `set-auth-token` response header rather than a cookie.
async function bearerTokenFor (app: FastifyInstance, email: string, password = 'hunter22'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email, password }
  })
  const token = res.headers['set-auth-token']
  if (!token || typeof token !== 'string') throw new Error('no set-auth-token header in sign-in response')
  return token
}

test('sign-in returns a set-auth-token header once the account is verified', async () => {
  const { app, db } = await createTestApp()
  const { founderEmail } = { founderEmail: 'teacher@school.edu' }
  await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail })

  const token = await bearerTokenFor(app, founderEmail)
  assert.ok(token.length > 0)
})

test('a course-scoped route accepts Authorization: Bearer in place of a session cookie', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie: teacherCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@school.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: teacherCookie, email: 'student@school.edu', role: 'student' })
  void studentCookie

  await app.inject({ method: 'POST', url: '/courses', headers: { cookie: teacherCookie }, payload: { id: 'COMSCI214', name: 'Intro to CS' } })
  await app.inject({ method: 'POST', url: '/courses/COMSCI214/enrollments', headers: { cookie: teacherCookie }, payload: { email: 'student@school.edu' } })

  const { body, contentType } = multipartBody('slides.pdf', Buffer.from('week 6 slides'))
  const upload = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/manifests',
    headers: { cookie: teacherCookie, 'content-type': contentType },
    payload: body
  })
  const { manifest } = upload.json()

  const studentToken = await bearerTokenFor(app, 'student@school.edu')

  const list = await app.inject({
    method: 'GET',
    url: '/courses/COMSCI214/manifests',
    headers: { authorization: `Bearer ${studentToken}` }
  })
  assert.equal(list.statusCode, 200)
  assert.equal(list.json().length, 1)

  const content = await app.inject({
    method: 'GET',
    url: `/content/${manifest.hash}`,
    headers: { authorization: `Bearer ${studentToken}` }
  })
  assert.equal(content.statusCode, 200)
  assert.equal(content.body, 'week 6 slides')
})

test('a garbage bearer token is rejected, not silently treated as anonymous-but-valid', async () => {
  const { app } = await createTestApp()

  const res = await app.inject({
    method: 'GET',
    url: '/courses',
    headers: { authorization: 'Bearer not-a-real-token' }
  })
  assert.equal(res.statusCode, 401)
})
