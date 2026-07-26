import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, sessionCookieHeader } from './helpers'

test('register creates an account and sets a session cookie', async () => {
  const { app } = await createTestApp()
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'hunter2' } })
  assert.equal(res.statusCode, 201)
  assert.ok(res.cookies.find(c => c.name === 'campvus_session'))
})

test('registering the same email twice fails', async () => {
  const { app } = await createTestApp()
  await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'hunter2' } })
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'other' } })
  assert.equal(res.statusCode, 409)
})

test('login succeeds with the correct password and fails with the wrong one', async () => {
  const { app } = await createTestApp()
  await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'hunter2' } })

  const good = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'a@b.com', password: 'hunter2' } })
  assert.equal(good.statusCode, 200)

  const bad = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'a@b.com', password: 'wrong' } })
  assert.equal(bad.statusCode, 401)
})

test('/auth/me requires a valid session', async () => {
  const { app } = await createTestApp()
  const anon = await app.inject({ method: 'GET', url: '/auth/me' })
  assert.equal(anon.statusCode, 401)

  const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'hunter2' } })
  const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: sessionCookieHeader(reg) } })
  assert.equal(me.statusCode, 200)
  assert.equal(me.json().email, 'a@b.com')
})

test('logout invalidates the session', async () => {
  const { app } = await createTestApp()
  const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@b.com', password: 'hunter2' } })
  const cookie = sessionCookieHeader(reg)

  await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } })
  const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } })
  assert.equal(me.statusCode, 401)
})
