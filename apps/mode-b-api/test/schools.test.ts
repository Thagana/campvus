import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { createTestApp, registerUser } from './helpers'
import { createSchool } from '../src/auth/create-school'
import { invitation, member, organization } from '../src/db/schema'

test('createSchool creates an Organization and a pending Owner invitation', async () => {
  const { db } = await createTestApp()

  const result = await createSchool(db, { name: 'Riverside High', founderEmail: 'Founder@Riverside.edu' })

  const orgRows = await db.select().from(organization).where(eq(organization.id, result.organizationId))
  assert.equal(orgRows[0]?.name, 'Riverside High')
  assert.equal(orgRows[0]?.slug, 'riverside-high')

  const invitationRows = await db.select().from(invitation).where(eq(invitation.id, result.invitationId))
  assert.equal(invitationRows[0]?.organizationId, result.organizationId)
  assert.equal(invitationRows[0]?.email, 'founder@riverside.edu')
  assert.equal(invitationRows[0]?.role, 'owner')
  assert.equal(invitationRows[0]?.status, 'pending')
})

test('the founding Teacher can sign up and accept their Owner invitation', async () => {
  const { app, db } = await createTestApp()
  const { invitationId } = await createSchool(db, { name: 'Riverside High', founderEmail: 'founder@riverside.edu' })

  const cookie = await registerUser(app, 'founder@riverside.edu')

  const accept = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/accept-invitation',
    headers: { cookie, origin: 'http://localhost:80' },
    payload: { invitationId }
  })
  assert.equal(accept.statusCode, 200)
  assert.equal(accept.json().member.role, 'owner')

  const memberRows = await db.select().from(member)
  assert.equal(memberRows.length, 1)
  assert.equal(memberRows[0]?.role, 'owner')
})

test('self-serve organization creation is refused', async () => {
  const { app } = await createTestApp()
  const cookie = await registerUser(app, 'someone@example.com')

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/create',
    headers: { cookie, origin: 'http://localhost:80' },
    payload: { name: 'My Own School', slug: 'my-own-school' }
  })

  assert.equal(res.statusCode, 403)
})

test('sign-up is unaffected: an account with no School membership can still sign in', async () => {
  const { app } = await createTestApp()
  const cookie = await registerUser(app, 'nobody@example.com')

  const me = await app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { cookie } })
  assert.equal(me.statusCode, 200)
  assert.equal(me.json().user.email, 'nobody@example.com')
})
