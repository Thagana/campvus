import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, createSchoolWithOwner, inviteAndAccept, registerUser } from './helpers'

test('a Teacher can invite another Teacher by email; that person can accept and their role is teacher', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })

  const invite = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/invite-member',
    headers: { cookie: ownerCookie, origin: 'http://localhost:80' },
    payload: { email: 'colleague@riverside.edu', role: 'teacher', organizationId }
  })
  assert.equal(invite.statusCode, 200)

  const cookie = await registerUser(app, 'colleague@riverside.edu')

  // Unlike the founding invitation (create-school.ts — no real inviterId,
  // so get-invitation can't resolve one), a regular Teacher-issued invite
  // has one, so the invited person can look it up before deciding to accept.
  const seen = await app.inject({
    method: 'GET',
    url: `/api/auth/organization/get-invitation?id=${invite.json().id}`,
    headers: { cookie }
  })
  assert.equal(seen.statusCode, 200)
  assert.equal(seen.json().role, 'teacher')
  assert.equal(seen.json().organizationName, 'Riverside High')

  const accept = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/accept-invitation',
    headers: { cookie, origin: 'http://localhost:80' },
    payload: { invitationId: invite.json().id }
  })
  assert.equal(accept.statusCode, 200)
  assert.equal(accept.json().member.role, 'teacher')
})

test('a Teacher can invite a Student by email; that person can accept and their role is student', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })

  const { member } = await inviteAndAccept(app, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })
  assert.equal(member.role, 'student')
})

test('a Student attempting to invite anyone is denied', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })

  const { cookie: studentCookie } = await inviteAndAccept(app, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })

  const deniedInvite = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/invite-member',
    headers: { cookie: studentCookie, origin: 'http://localhost:80' },
    payload: { email: 'someone-else@riverside.edu', role: 'student', organizationId }
  })
  assert.equal(deniedInvite.statusCode, 403)
})

test('an Owner cannot invite someone as owner, admin, or member — only teacher or student are grantable roles', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })

  for (const role of ['owner', 'admin', 'member']) {
    const invite = await app.inject({
      method: 'POST',
      url: '/api/auth/organization/invite-member',
      headers: { cookie: ownerCookie, origin: 'http://localhost:80' },
      payload: { email: `wannabe-${role}@riverside.edu`, role, organizationId }
    })
    assert.equal(invite.statusCode, 400, `inviting as ${role} should be rejected`)
  }
})

test("a person who's already an accepted member of one School has their accept of a second School's invitation rejected", async () => {
  const { app, db } = await createTestApp()
  const schoolA = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner-a@example.edu' })
  const schoolB = await createSchoolWithOwner(app, db, { name: 'Lakeside High', founderEmail: 'owner-b@example.edu' })

  const { cookie: roamerCookie } = await inviteAndAccept(app, {
    organizationId: schoolA.organizationId, inviterCookie: schoolA.ownerCookie, email: 'roamer@example.edu', role: 'teacher'
  })

  const inviteToB = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/invite-member',
    headers: { cookie: schoolB.ownerCookie, origin: 'http://localhost:80' },
    payload: { email: 'roamer@example.edu', role: 'teacher', organizationId: schoolB.organizationId }
  })
  const acceptB = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/accept-invitation',
    headers: { cookie: roamerCookie, origin: 'http://localhost:80' },
    payload: { invitationId: inviteToB.json().id }
  })
  assert.equal(acceptB.statusCode, 400)
})
