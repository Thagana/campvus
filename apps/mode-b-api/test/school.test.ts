import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, createSchoolWithOwner, inviteAndAccept, registerUser } from './helpers'

// routes/school.ts exists so mode-b-web can learn its own organizationId
// before calling better-auth's /api/auth/organization/invite-member, which
// requires it in the payload (test/invites.test.ts) — nothing exposed this
// to the browser before, which was the actual gap behind "this account is
// not a member of your School" being unfixable from the portal.
test('GET /school returns the signed-in Teacher\'s own organizationId, name, and role', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })

  const res = await app.inject({ method: 'GET', url: '/school', headers: { cookie: ownerCookie } })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { organizationId, name: 'Riverside High', role: 'owner' })
})

test('GET /school works for a Student too, reporting their student role', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })

  const res = await app.inject({ method: 'GET', url: '/school', headers: { cookie: studentCookie } })

  assert.equal(res.statusCode, 200)
  assert.equal(res.json().role, 'student')
})

test('GET /school is refused for an account with no School membership', async () => {
  const { app, db } = await createTestApp()
  const cookie = await registerUser(app, db, 'schoolless@example.com')

  const res = await app.inject({ method: 'GET', url: '/school', headers: { cookie } })

  assert.equal(res.statusCode, 403)
})
