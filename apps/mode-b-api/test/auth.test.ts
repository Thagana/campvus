import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, sessionCookieHeader } from './helpers'

test('sign-up creates an account and sets a session cookie', async () => {
  const { app } = await createTestApp()
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: 'a@b.com', password: 'hunter22', name: 'a@b.com' }
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().user.email, 'a@b.com')
  assert.ok(res.cookies.some(c => c.name.endsWith('session_token')))
})

test('signing up with the same email twice fails', async () => {
  const { app } = await createTestApp()
  await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: 'a@b.com', password: 'hunter22', name: 'a@b.com' }
  })
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: 'a@b.com', password: 'otherpass', name: 'a@b.com' }
  })
  assert.equal(res.statusCode, 422)
})

test('sign-in succeeds with the correct password and fails with the wrong one', async () => {
  const { app } = await createTestApp()
  await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: 'a@b.com', password: 'hunter22', name: 'a@b.com' }
  })

  const good = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email: 'a@b.com', password: 'hunter22' }
  })
  assert.equal(good.statusCode, 200)

  const bad = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email: 'a@b.com', password: 'wrong' }
  })
  assert.equal(bad.statusCode, 401)
})

test('a protected route requires a valid session', async () => {
  const { app } = await createTestApp()
  const anon = await app.inject({ method: 'GET', url: '/courses' })
  assert.equal(anon.statusCode, 401)

  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: 'a@b.com', password: 'hunter22', name: 'a@b.com' }
  })
  const cookie = sessionCookieHeader(reg)
  // 403, not 401: authentication now passes (proving the session-cookie
  // check above works), but /courses also requires School membership
  // (ADR-0005) — this account has none. See courses.test.ts for the
  // School-membership-specific behavior.
  const courses = await app.inject({ method: 'GET', url: '/courses', headers: { cookie } })
  assert.equal(courses.statusCode, 403)
})

test('get-session reflects the signed-in user', async () => {
  const { app } = await createTestApp()
  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: 'a@b.com', password: 'hunter22', name: 'a@b.com' }
  })
  const cookie = sessionCookieHeader(reg)

  const me = await app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { cookie } })
  assert.equal(me.statusCode, 200)
  assert.equal(me.json().user.email, 'a@b.com')
})

test('sign-out invalidates the session', async () => {
  const { app } = await createTestApp()
  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: 'a@b.com', password: 'hunter22', name: 'a@b.com' }
  })
  const cookie = sessionCookieHeader(reg)

  // better-auth's origin-check middleware requires an Origin header on any
  // cookie-bearing state-changing request — real browsers set this
  // automatically on fetch(), but app.inject() doesn't, so it's set here.
  await app.inject({
    method: 'POST',
    url: '/api/auth/sign-out',
    headers: { cookie, origin: 'http://localhost:80' }
  })
  const courses = await app.inject({ method: 'GET', url: '/courses', headers: { cookie } })
  assert.equal(courses.statusCode, 401)
})
