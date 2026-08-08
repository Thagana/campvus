import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { createTestApp, registerUser } from './helpers'
import { user } from '../src/db/schema'

test('sign-up creates an account but does not set a session cookie until email is verified', async () => {
  const { app } = await createTestApp()
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: 'a@b.com', password: 'hunter22', name: 'a@b.com' }
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().user.email, 'a@b.com')
  assert.equal(res.json().token, null)
  assert.ok(!res.cookies.some(c => c.name.endsWith('session_token')))
})

// better-auth disguises a duplicate-email sign-up as an ordinary success
// (anti-enumeration) once requireEmailVerification is on, rather than the
// 422 it returns without that option — so this only proves the original
// account survives untouched, not that the second attempt was rejected.
test('signing up with an already-registered email does not disturb the original account', async () => {
  const { app, db } = await createTestApp()
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
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().token, null)

  await db.update(user).set({ emailVerified: true }).where(eq(user.email, 'a@b.com'))
  const signIn = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email: 'a@b.com', password: 'hunter22' }
  })
  assert.equal(signIn.statusCode, 200)
})

test('sign-in fails until the email is verified, then succeeds with the correct password and fails with the wrong one', async () => {
  const { app, db } = await createTestApp()
  await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: 'a@b.com', password: 'hunter22', name: 'a@b.com' }
  })

  const unverified = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email: 'a@b.com', password: 'hunter22' }
  })
  assert.equal(unverified.statusCode, 403)

  await db.update(user).set({ emailVerified: true }).where(eq(user.email, 'a@b.com'))

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
  const { app, db } = await createTestApp()
  const anon = await app.inject({ method: 'GET', url: '/courses' })
  assert.equal(anon.statusCode, 401)

  const cookie = await registerUser(app, db, 'a@b.com')
  // 403, not 401: authentication now passes (proving the session-cookie
  // check above works), but /courses also requires School membership
  // (ADR-0005) — this account has none. See courses.test.ts for the
  // School-membership-specific behavior.
  const courses = await app.inject({ method: 'GET', url: '/courses', headers: { cookie } })
  assert.equal(courses.statusCode, 403)
})

test('get-session reflects the signed-in user', async () => {
  const { app, db } = await createTestApp()
  const cookie = await registerUser(app, db, 'a@b.com')

  const me = await app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { cookie } })
  assert.equal(me.statusCode, 200)
  assert.equal(me.json().user.email, 'a@b.com')
})

test('sign-out invalidates the session', async () => {
  const { app, db } = await createTestApp()
  const cookie = await registerUser(app, db, 'a@b.com')

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
