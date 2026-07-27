import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, createSchoolWithOwner, inviteAndAccept, registerUser } from './helpers'

test('a Teacher creates a course; it is automatically scoped to their School and lists with role teacher', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })

  const create = await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: ownerCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })
  assert.equal(create.statusCode, 201)

  const list = await app.inject({ method: 'GET', url: '/courses', headers: { cookie: ownerCookie } })
  assert.deepEqual(list.json(), [{ id: 'COMSCI214', name: 'Intro to CS', role: 'teacher' }])
})

test('a Teacher sees and can manage every Course in their School, including ones a colleague created', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: colleagueCookie } = await inviteAndAccept(app, { organizationId, inviterCookie: ownerCookie, email: 'colleague@riverside.edu', role: 'teacher' })

  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: colleagueCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })

  // The Owner never created this course, and has no per-course Enrollment
  // row for it — School membership alone is enough to see and manage it.
  const list = await app.inject({ method: 'GET', url: '/courses', headers: { cookie: ownerCookie } })
  assert.deepEqual(list.json(), [{ id: 'COMSCI214', name: 'Intro to CS', role: 'teacher' }])
})

test('a Teacher can enroll a student into a colleague\'s course, not just their own', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: colleagueCookie } = await inviteAndAccept(app, { organizationId, inviterCookie: ownerCookie, email: 'colleague@riverside.edu', role: 'teacher' })
  const { cookie: studentCookie } = await inviteAndAccept(app, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })

  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: ownerCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })

  const enroll = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: colleagueCookie },
    payload: { email: 'student@riverside.edu' }
  })
  assert.equal(enroll.statusCode, 201)

  const list = await app.inject({ method: 'GET', url: '/courses', headers: { cookie: studentCookie } })
  assert.deepEqual(list.json(), [{ id: 'COMSCI214', name: 'Intro to CS', role: 'student' }])
})

test('a Student sees and can access only the Courses they hold an Enrollment in, not every Course in the School', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })

  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: ownerCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })
  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: ownerCookie },
    payload: { id: 'MATH101', name: 'Calculus I' }
  })
  await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: ownerCookie },
    payload: { email: 'student@riverside.edu' }
  })

  const list = await app.inject({ method: 'GET', url: '/courses', headers: { cookie: studentCookie } })
  assert.deepEqual(list.json(), [{ id: 'COMSCI214', name: 'Intro to CS', role: 'student' }])
})

test('a Student attempting to create a Course is denied', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })

  const create = await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: studentCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })
  assert.equal(create.statusCode, 403)
})

test('only a Teacher can enroll School members in their School\'s Courses', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })

  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: ownerCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })

  const deniedEnroll = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: studentCookie },
    payload: { email: 'student@riverside.edu' }
  })
  assert.equal(deniedEnroll.statusCode, 403)

  const okEnroll = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: ownerCookie },
    payload: { email: 'student@riverside.edu' }
  })
  assert.equal(okEnroll.statusCode, 201)

  const list = await app.inject({ method: 'GET', url: '/courses', headers: { cookie: studentCookie } })
  assert.deepEqual(list.json(), [{ id: 'COMSCI214', name: 'Intro to CS', role: 'student' }])
})

test('enrolling an email with no account at all fails', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: ownerCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: ownerCookie },
    payload: { email: 'nobody@riverside.edu' }
  })
  assert.equal(res.statusCode, 404)
})

test('enrolling an email that has an account but is not a member of the School fails, distinctly from no account at all', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: ownerCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })
  await registerUser(app, 'outsider@example.com')

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: ownerCookie },
    payload: { email: 'outsider@example.com' }
  })
  assert.equal(res.statusCode, 403)
})

test('a Teacher cannot enroll someone into a course belonging to a different School', async () => {
  const { app, db } = await createTestApp()
  const schoolA = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner-a@example.edu' })
  const schoolB = await createSchoolWithOwner(app, db, { name: 'Lakeside High', founderEmail: 'owner-b@example.edu' })
  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: schoolA.ownerCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: schoolB.ownerCookie },
    payload: { email: 'owner-b@example.edu' }
  })
  assert.equal(res.statusCode, 404)
})

test('an authenticated account with no School membership is denied on every School/Course-scoped route', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: ownerCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })
  const schoollessCookie = await registerUser(app, 'schoolless@example.com')

  const create = await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: schoollessCookie },
    payload: { id: 'MATH101', name: 'Calculus I' }
  })
  assert.equal(create.statusCode, 403)

  const list = await app.inject({ method: 'GET', url: '/courses', headers: { cookie: schoollessCookie } })
  assert.equal(list.statusCode, 403)

  const enroll = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: schoollessCookie },
    payload: { email: 'owner@riverside.edu' }
  })
  assert.equal(enroll.statusCode, 403)
})
