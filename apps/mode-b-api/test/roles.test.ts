import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { createTestApp, createSchoolWithOwner, inviteAndAccept } from './helpers'
import { member } from '../src/db/schema'

// These three use a plain Teacher (not the Owner) as the acting party,
// since the ticket says "a Teacher" and Owner/Teacher share permissions —
// using the Owner throughout would only prove the Owner can do this, not
// that a plain Teacher genuinely can too.

test('a Teacher can promote a Student to Teacher', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: teacherCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'teacher@riverside.edu', role: 'teacher' })
  const { member: studentMember } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })

  const promote = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/update-member-role',
    headers: { cookie: teacherCookie, origin: 'http://localhost:80' },
    payload: { memberId: studentMember.id, role: 'teacher', organizationId }
  })
  assert.equal(promote.statusCode, 200)
  assert.equal(promote.json().role, 'teacher')
})

test('a Teacher can demote another Teacher to Student', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: actingTeacherCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'acting-teacher@riverside.edu', role: 'teacher' })
  const { member: colleague } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'colleague@riverside.edu', role: 'teacher' })

  const demote = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/update-member-role',
    headers: { cookie: actingTeacherCookie, origin: 'http://localhost:80' },
    payload: { memberId: colleague.id, role: 'student', organizationId }
  })
  assert.equal(demote.statusCode, 200)
  assert.equal(demote.json().role, 'student')
})

test('a Teacher can remove another member from the School entirely', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: teacherCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'teacher@riverside.edu', role: 'teacher' })
  await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'leaving@riverside.edu', role: 'student' })

  const remove = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/remove-member',
    headers: { cookie: teacherCookie, origin: 'http://localhost:80' },
    payload: { memberIdOrEmail: 'leaving@riverside.edu', organizationId }
  })
  assert.equal(remove.statusCode, 200)

  // Proof of removal over the same HTTP seam: invite-member refuses to
  // invite a current member, so succeeding here means they're gone.
  const reinvite = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/invite-member',
    headers: { cookie: teacherCookie, origin: 'http://localhost:80' },
    payload: { email: 'leaving@riverside.edu', role: 'student', organizationId }
  })
  assert.equal(reinvite.statusCode, 200)
})

test('update-member-role cannot grant the owner role either', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { member: teacherMember } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'teacher@riverside.edu', role: 'teacher' })

  const promoteToOwner = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/update-member-role',
    headers: { cookie: ownerCookie, origin: 'http://localhost:80' },
    payload: { memberId: teacherMember.id, role: 'owner', organizationId }
  })
  assert.equal(promoteToOwner.statusCode, 400)
})

test("attempting to demote or remove the School's sole Owner (its only Teacher) is rejected", async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie, ownerMemberId } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })

  const demote = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/update-member-role',
    headers: { cookie: ownerCookie, origin: 'http://localhost:80' },
    payload: { memberId: ownerMemberId, role: 'student', organizationId }
  })
  assert.equal(demote.statusCode, 400)

  const remove = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/remove-member',
    headers: { cookie: ownerCookie, origin: 'http://localhost:80' },
    payload: { memberIdOrEmail: ownerMemberId, organizationId }
  })
  assert.equal(remove.statusCode, 400)
})

test('the last-Teacher guard also protects a lone plain Teacher, not just the Owner', async () => {
  // The Owner can never actually be demoted/removed through these two
  // endpoints — better-auth's own creatorRole protection blocks that
  // before our hook even runs (see previous test). To prove our own guard
  // (which counts teacher-or-owner, not just owner) does something on its
  // own, this simulates a School that's down to one plain Teacher by
  // deleting the Owner's membership row directly — a state the public API
  // can't reach today, but the guard should hold regardless.
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie, ownerMemberId } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: soleTeacherCookie, member: soleTeacher } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'sole-teacher@riverside.edu', role: 'teacher' })

  await db.delete(member).where(eq(member.id, ownerMemberId))

  const demote = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/update-member-role',
    headers: { cookie: soleTeacherCookie, origin: 'http://localhost:80' },
    payload: { memberId: soleTeacher.id, role: 'student', organizationId }
  })
  assert.equal(demote.statusCode, 400)

  const remove = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/remove-member',
    headers: { cookie: soleTeacherCookie, origin: 'http://localhost:80' },
    payload: { memberIdOrEmail: soleTeacher.id, organizationId }
  })
  assert.equal(remove.statusCode, 400)
})

test('a demoted Teacher immediately loses Teacher-level access (inviting, role changes) on their very next request', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: colleagueCookie, member: colleague } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'colleague@riverside.edu', role: 'teacher' })
  const { member: bystander } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'bystander@riverside.edu', role: 'student' })

  const demote = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/update-member-role',
    headers: { cookie: ownerCookie, origin: 'http://localhost:80' },
    payload: { memberId: colleague.id, role: 'student', organizationId }
  })
  assert.equal(demote.statusCode, 200)

  const deniedInvite = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/invite-member',
    headers: { cookie: colleagueCookie, origin: 'http://localhost:80' },
    payload: { email: 'someone@riverside.edu', role: 'student', organizationId }
  })
  assert.equal(deniedInvite.statusCode, 403)

  const deniedRoleChange = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/update-member-role',
    headers: { cookie: colleagueCookie, origin: 'http://localhost:80' },
    payload: { memberId: bystander.id, role: 'teacher', organizationId }
  })
  assert.equal(deniedRoleChange.statusCode, 403)
})
