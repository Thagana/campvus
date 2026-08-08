import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { createTestApp, registerUser, createSchoolWithOwner, inviteAndAccept, withBrevoStandIn } from './helpers'
import { organization, invitation } from '../src/db/schema'
import { WEB_URL } from '../src/config'

// Set once at module scope rather than per-test with a try/finally
// save-and-restore: node:test runs this file's top-level tests
// concurrently, so per-test mutation of a shared process.env value races
// (one test's restore-to-undefined can land mid-flight of another test's
// admin-gated request). Every test below either uses this exact email as
// the admin, or deliberately uses a different email to prove non-admin
// access is refused — none of them need the value to change.
process.env.CAMPVUS_ADMIN_EMAILS = 'admin@campvus.example'

test('a non-admin is refused on both admin routes', async () => {
  const { app, db } = await createTestApp()
  const cookie = await registerUser(app, db, 'someone@example.com')

  const create = await app.inject({
    method: 'POST',
    url: '/admin/schools',
    headers: { cookie, origin: 'http://localhost:80' },
    payload: { name: 'Riverside High', founderEmail: 'founder@riverside.edu' }
  })
  assert.equal(create.statusCode, 403)

  const list = await app.inject({ method: 'GET', url: '/admin/schools', headers: { cookie } })
  assert.equal(list.statusCode, 403)
})

test('an unauthenticated caller is refused, not just a non-admin one', async () => {
  const { app } = await createTestApp()
  const res = await app.inject({ method: 'GET', url: '/admin/schools' })
  assert.equal(res.statusCode, 401)
})

test('a platform admin can create a School, which sends the founding invitation email', async () => {
  const { app, db } = await createTestApp()
  // Registering (sign-up) sends its own verification email — done before
  // entering withBrevoStandIn so only the invitation email below lands in
  // its capture, not both.
  const adminCookie = await registerUser(app, db, 'admin@campvus.example')

  await withBrevoStandIn(async (received) => {
    const create = await app.inject({
      method: 'POST',
      url: '/admin/schools',
      headers: { cookie: adminCookie, origin: 'http://localhost:80' },
      payload: { name: 'Riverside High', founderEmail: 'founder@riverside.edu' }
    })
    assert.equal(create.statusCode, 201)
    const { organizationId, invitationId } = create.json()

    const orgRows = await db.select().from(organization).where(eq(organization.id, organizationId))
    assert.equal(orgRows[0]?.name, 'Riverside High')

    const invitationRows = await db.select().from(invitation).where(eq(invitation.id, invitationId))
    assert.equal(invitationRows[0]?.role, 'owner')
    assert.equal(invitationRows[0]?.email, 'founder@riverside.edu')

    const emails = received()
    assert.equal(emails.length, 1)
    assert.equal(emails[0].to, 'founder@riverside.edu')
    assert.match(emails[0].html, new RegExp(`${WEB_URL}/accept-invite\\?id=${invitationId}`))
  })
})

test('creating a School with a name that collides on slug is refused with 409, not a raw 500', async () => {
  const { app, db } = await createTestApp()
  const adminCookie = await registerUser(app, db, 'admin@campvus.example')

  const first = await app.inject({
    method: 'POST',
    url: '/admin/schools',
    headers: { cookie: adminCookie, origin: 'http://localhost:80' },
    payload: { name: 'Riverside High', founderEmail: 'founder-a@riverside.edu' }
  })
  assert.equal(first.statusCode, 201)

  const second = await app.inject({
    method: 'POST',
    url: '/admin/schools',
    headers: { cookie: adminCookie, origin: 'http://localhost:80' },
    payload: { name: 'Riverside High', founderEmail: 'founder-b@riverside.edu' }
  })
  assert.equal(second.statusCode, 409)
})

test('a platform admin can list Schools they created', async () => {
  const { app, db } = await createTestApp()
  const adminCookie = await registerUser(app, db, 'admin@campvus.example')

  await app.inject({
    method: 'POST',
    url: '/admin/schools',
    headers: { cookie: adminCookie, origin: 'http://localhost:80' },
    payload: { name: 'Riverside High', founderEmail: 'founder@riverside.edu' }
  })

  const list = await app.inject({ method: 'GET', url: '/admin/schools', headers: { cookie: adminCookie } })
  assert.equal(list.statusCode, 200)
  const schools = list.json()
  assert.equal(schools.length, 1)
  assert.equal(schools[0].name, 'Riverside High')
})

test('end to end: admin creates a School, founding Teacher registers and accepts, unaffected by CAMPVUS_ADMIN_EMAILS not matching them', async () => {
  const { app, db } = await createTestApp()
  const adminCookie = await registerUser(app, db, 'admin@campvus.example')

  const create = await app.inject({
    method: 'POST',
    url: '/admin/schools',
    headers: { cookie: adminCookie, origin: 'http://localhost:80' },
    payload: { name: 'Riverside High', founderEmail: 'founder@riverside.edu' }
  })
  assert.equal(create.statusCode, 201)
  const { invitationId } = create.json()

  const founderCookie = await registerUser(app, db, 'founder@riverside.edu')
  const accept = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/accept-invitation',
    headers: { cookie: founderCookie, origin: 'http://localhost:80' },
    payload: { invitationId }
  })
  assert.equal(accept.statusCode, 200)
  assert.equal(accept.json().member.role, 'owner')

  // The founding Teacher themselves has no admin access, unless their
  // email also happens to be in CAMPVUS_ADMIN_EMAILS — the two are
  // independent axes (auth/platform-admin.ts vs. School role).
  const list = await app.inject({ method: 'GET', url: '/admin/schools', headers: { cookie: founderCookie } })
  assert.equal(list.statusCode, 403)
})

test('a platform admin can see every member of a School and who is enrolled in each Course', async () => {
  const { app, db } = await createTestApp()
  const adminCookie = await registerUser(app, db, 'admin@campvus.example')

  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'colleague@riverside.edu', role: 'teacher' })
  const { cookie: studentCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })
  void studentCookie

  await app.inject({ method: 'POST', url: '/courses', headers: { cookie: ownerCookie }, payload: { id: 'COMSCI214', name: 'Intro to CS' } })
  await app.inject({ method: 'POST', url: '/courses/COMSCI214/enrollments', headers: { cookie: ownerCookie }, payload: { email: 'student@riverside.edu' } })

  const res = await app.inject({ method: 'GET', url: `/admin/schools/${organizationId}/roster`, headers: { cookie: adminCookie } })
  assert.equal(res.statusCode, 200)
  const { members, courses } = res.json()

  const emails = members.map((m: { email: string }) => m.email).sort()
  assert.deepEqual(emails, ['colleague@riverside.edu', 'owner@riverside.edu', 'student@riverside.edu'])
  assert.equal(members.find((m: { email: string }) => m.email === 'owner@riverside.edu').role, 'owner')
  assert.equal(members.find((m: { email: string }) => m.email === 'colleague@riverside.edu').role, 'teacher')
  assert.equal(members.find((m: { email: string }) => m.email === 'student@riverside.edu').role, 'student')

  assert.equal(courses.length, 1)
  assert.equal(courses[0].id, 'COMSCI214')
  assert.deepEqual(courses[0].students, ['student@riverside.edu'])
})

test('a non-admin cannot view a School roster', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })

  const res = await app.inject({ method: 'GET', url: `/admin/schools/${organizationId}/roster`, headers: { cookie: ownerCookie } })
  assert.equal(res.statusCode, 403)
})
