import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, createSchoolWithOwner, inviteAndAccept } from './helpers'

async function createCourse (app: import('fastify').FastifyInstance, cookie: string, id = 'COMSCI214', name = 'Intro to CS'): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie },
    payload: { id, name }
  })
  assert.equal(res.statusCode, 201)
}

test('a Teacher schedules a live session for their own course', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie)

  const startTime = Date.now() + 60_000
  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie },
    payload: { startTime }
  })

  assert.equal(res.statusCode, 201)
  assert.equal(res.json().courseId, 'COMSCI214')
  assert.equal(res.json().startTime, startTime)
})

test('a Teacher schedules a live session for a colleague\'s course, matching School-wide access', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: colleagueCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'colleague@riverside.edu', role: 'teacher' })
  await createCourse(app, colleagueCookie)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie },
    payload: { startTime: Date.now() + 60_000 }
  })

  assert.equal(res.statusCode, 201)
})

test('a Student is denied scheduling a live session', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })
  await createCourse(app, ownerCookie)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: studentCookie },
    payload: { startTime: Date.now() + 60_000 }
  })

  assert.equal(res.statusCode, 403)
})

test('scheduling without a startTime is rejected', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await createCourse(app, ownerCookie)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie },
    payload: {}
  })

  assert.equal(res.statusCode, 400)
})

test('an enrolled Student can list a course\'s scheduled sessions', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })
  await createCourse(app, ownerCookie)
  await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: ownerCookie },
    payload: { email: 'student@riverside.edu' }
  })
  const startTime = Date.now() + 60_000
  await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie },
    payload: { startTime }
  })

  const list = await app.inject({
    method: 'GET',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: studentCookie }
  })

  assert.equal(list.statusCode, 200)
  assert.equal(list.json().length, 1)
  assert.equal(list.json()[0].startTime, startTime)
})

test('a Student not enrolled in the course is denied listing its sessions, matching file-access rules', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })
  await createCourse(app, ownerCookie)
  await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie },
    payload: { startTime: Date.now() + 60_000 }
  })

  const list = await app.inject({
    method: 'GET',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: studentCookie }
  })

  assert.equal(list.statusCode, 403)
})

test('scheduling for a course in a different School is denied, matching course-access rules', async () => {
  const { app, db } = await createTestApp()
  const schoolA = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner-a@example.edu' })
  const schoolB = await createSchoolWithOwner(app, db, { name: 'Lakeside High', founderEmail: 'owner-b@example.edu' })
  await createCourse(app, schoolA.ownerCookie)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: schoolB.ownerCookie },
    payload: { startTime: Date.now() + 60_000 }
  })

  assert.equal(res.statusCode, 403)
})

test('scheduling a session in the past is rejected (ticket 08)', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await createCourse(app, ownerCookie)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie },
    payload: { startTime: Date.now() - 60_000 }
  })

  assert.equal(res.statusCode, 400)
})

test('a Teacher reschedules a session to a new future start time', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await createCourse(app, ownerCookie)
  const created = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie },
    payload: { startTime: Date.now() + 60_000 }
  })
  const sessionId = created.json().id

  const newStartTime = Date.now() + 120_000
  const res = await app.inject({
    method: 'PATCH',
    url: `/courses/COMSCI214/sessions/${sessionId}`,
    headers: { cookie: ownerCookie },
    payload: { startTime: newStartTime }
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.json().startTime, newStartTime)
})

test('rescheduling to a past start time is rejected', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await createCourse(app, ownerCookie)
  const created = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie },
    payload: { startTime: Date.now() + 60_000 }
  })

  const res = await app.inject({
    method: 'PATCH',
    url: `/courses/COMSCI214/sessions/${created.json().id}`,
    headers: { cookie: ownerCookie },
    payload: { startTime: Date.now() - 60_000 }
  })

  assert.equal(res.statusCode, 400)
})

test('rescheduling a nonexistent session returns 404', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await createCourse(app, ownerCookie)

  const res = await app.inject({
    method: 'PATCH',
    url: '/courses/COMSCI214/sessions/does-not-exist',
    headers: { cookie: ownerCookie },
    payload: { startTime: Date.now() + 60_000 }
  })

  assert.equal(res.statusCode, 404)
})

test('a Student is denied rescheduling a session', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })
  await createCourse(app, ownerCookie)
  const created = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie },
    payload: { startTime: Date.now() + 60_000 }
  })

  const res = await app.inject({
    method: 'PATCH',
    url: `/courses/COMSCI214/sessions/${created.json().id}`,
    headers: { cookie: studentCookie },
    payload: { startTime: Date.now() + 120_000 }
  })

  assert.equal(res.statusCode, 403)
})

test('a Teacher cancels a scheduled session and it no longer appears in the list', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await createCourse(app, ownerCookie)
  const created = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie },
    payload: { startTime: Date.now() + 60_000 }
  })
  const sessionId = created.json().id

  const cancelRes = await app.inject({
    method: 'DELETE',
    url: `/courses/COMSCI214/sessions/${sessionId}`,
    headers: { cookie: ownerCookie }
  })
  assert.equal(cancelRes.statusCode, 200)
  assert.equal(cancelRes.json().id, sessionId)

  const list = await app.inject({
    method: 'GET',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie }
  })
  assert.equal(list.json().length, 0)
})

test('cancelling a nonexistent session returns 404', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await createCourse(app, ownerCookie)

  const res = await app.inject({
    method: 'DELETE',
    url: '/courses/COMSCI214/sessions/does-not-exist',
    headers: { cookie: ownerCookie }
  })

  assert.equal(res.statusCode, 404)
})

test('a Student is denied cancelling a session', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })
  await createCourse(app, ownerCookie)
  const created = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/sessions',
    headers: { cookie: ownerCookie },
    payload: { startTime: Date.now() + 60_000 }
  })

  const res = await app.inject({
    method: 'DELETE',
    url: `/courses/COMSCI214/sessions/${created.json().id}`,
    headers: { cookie: studentCookie }
  })

  assert.equal(res.statusCode, 403)
})
