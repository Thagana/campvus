import test from 'node:test'
import assert from 'node:assert/strict'
import { FastifyInstance } from 'fastify'
import { hashBuffer, SignedLiveSegment } from '@campvus/engine'
import { Db } from '../src/db/client'
import { createTestApp, createSchoolWithOwner, inviteAndAccept } from './helpers'

async function createCourse (app: FastifyInstance, cookie: string, id = 'COMSCI214', name = 'Intro to CS'): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie },
    payload: { id, name }
  })
  assert.equal(res.statusCode, 201)
}

async function signSegment (
  app: FastifyInstance,
  cookie: string,
  bytes: Buffer,
  overrides: { courseId?: string, sessionId?: string, seq?: number } = {}
): Promise<SignedLiveSegment> {
  const courseId = overrides.courseId ?? 'COMSCI214'
  const hash = hashBuffer(bytes)
  const res = await app.inject({
    method: 'POST',
    url: `/courses/${courseId}/live-signatures`,
    headers: { cookie },
    payload: {
      kind: 'segment',
      sessionId: overrides.sessionId ?? 'session-1',
      seq: overrides.seq ?? 0,
      hash,
      size: bytes.length,
      timestamp: 1000
    }
  })
  assert.equal(res.statusCode, 200)
  return res.json()
}

async function setupCourseWithStudent (app: FastifyInstance, db: Db): Promise<{ teacherCookie: string, studentCookie: string }> {
  const { organizationId, ownerCookie: teacherCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@school.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: teacherCookie, email: 'student@school.edu', role: 'student' })
  await createCourse(app, teacherCookie)
  await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: teacherCookie },
    payload: { email: 'student@school.edu' }
  })
  return { teacherCookie, studentCookie }
}

test('a Teacher uploads a signed segment and it is stored', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie)

  const bytes = Buffer.from('segment-bytes')
  const segment = await signSegment(app, ownerCookie, bytes)

  const upload = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-segments',
    headers: { cookie: ownerCookie },
    payload: { segment, content: bytes.toString('base64') }
  })

  assert.equal(upload.statusCode, 201)
  assert.deepEqual(upload.json(), { stored: true })
})

test('re-uploading the identical signed segment is idempotent', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie)

  const bytes = Buffer.from('segment-bytes')
  const segment = await signSegment(app, ownerCookie, bytes)
  const payload = { segment, content: bytes.toString('base64') }

  const first = await app.inject({ method: 'POST', url: '/courses/COMSCI214/live-segments', headers: { cookie: ownerCookie }, payload })
  assert.equal(first.statusCode, 201)

  const second = await app.inject({ method: 'POST', url: '/courses/COMSCI214/live-segments', headers: { cookie: ownerCookie }, payload })
  assert.equal(second.statusCode, 200)
  assert.deepEqual(second.json(), { stored: true })
})

test('a different segment for the same sessionId+seq is rejected with 409', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie)

  const first = Buffer.from('segment-bytes-a')
  const firstSegment = await signSegment(app, ownerCookie, first)
  await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-segments',
    headers: { cookie: ownerCookie },
    payload: { segment: firstSegment, content: first.toString('base64') }
  })

  const second = Buffer.from('segment-bytes-b')
  const secondSegment = await signSegment(app, ownerCookie, second)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-segments',
    headers: { cookie: ownerCookie },
    payload: { segment: secondSegment, content: second.toString('base64') }
  })
  assert.equal(res.statusCode, 409)
})

test('content that does not hash to segment.hash is rejected with 400', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie)

  const segment = await signSegment(app, ownerCookie, Buffer.from('segment-bytes'))

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-segments',
    headers: { cookie: ownerCookie },
    payload: { segment, content: Buffer.from('not the same bytes').toString('base64') }
  })
  assert.equal(res.statusCode, 400)
})

test('a tampered signature is rejected with 400', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie)

  const bytes = Buffer.from('segment-bytes')
  const segment = await signSegment(app, ownerCookie, bytes)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-segments',
    headers: { cookie: ownerCookie },
    payload: { segment: { ...segment, signature: 'not-a-real-signature' }, content: bytes.toString('base64') }
  })
  assert.equal(res.statusCode, 400)
})

test('segment.courseId not matching the URL course is rejected with 400', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie, 'COMSCI214')
  await createCourse(app, ownerCookie, 'MATH101', 'Calculus')

  const bytes = Buffer.from('segment-bytes')
  const segment = await signSegment(app, ownerCookie, bytes, { courseId: 'MATH101' })

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-segments',
    headers: { cookie: ownerCookie },
    payload: { segment, content: bytes.toString('base64') }
  })
  assert.equal(res.statusCode, 400)
})

test('a Student is denied uploading a segment', async () => {
  const { app, db } = await createTestApp()
  const { teacherCookie, studentCookie } = await setupCourseWithStudent(app, db)

  const bytes = Buffer.from('segment-bytes')
  const segment = await signSegment(app, teacherCookie, bytes)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-segments',
    headers: { cookie: studentCookie },
    payload: { segment, content: bytes.toString('base64') }
  })
  assert.equal(res.statusCode, 403)
})

test('an enrolled Student can fetch a stored segment by sessionId/seq', async () => {
  const { app, db } = await createTestApp()
  const { teacherCookie, studentCookie } = await setupCourseWithStudent(app, db)

  const bytes = Buffer.from('segment-bytes')
  const segment = await signSegment(app, teacherCookie, bytes)
  await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-segments',
    headers: { cookie: teacherCookie },
    payload: { segment, content: bytes.toString('base64') }
  })

  const res = await app.inject({ method: 'GET', url: '/live-segments/session-1/0', headers: { cookie: studentCookie } })
  assert.equal(res.statusCode, 200)
  const body = res.json()
  assert.equal(body.segment.hash, segment.hash)
  assert.equal(Buffer.from(body.content, 'base64').toString(), 'segment-bytes')
})

test("a colleague Teacher who didn't create the course can still fetch its segments", async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie: teacherCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@school.edu' })
  const { cookie: colleagueCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: teacherCookie, email: 'colleague@school.edu', role: 'teacher' })
  await createCourse(app, teacherCookie)

  const bytes = Buffer.from('segment-bytes')
  const segment = await signSegment(app, teacherCookie, bytes)
  await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-segments',
    headers: { cookie: teacherCookie },
    payload: { segment, content: bytes.toString('base64') }
  })

  const res = await app.inject({ method: 'GET', url: '/live-segments/session-1/0', headers: { cookie: colleagueCookie } })
  assert.equal(res.statusCode, 200)
})

test('a user not enrolled/not staff at that School cannot fetch its segments', async () => {
  const { app, db } = await createTestApp()
  const { teacherCookie } = await setupCourseWithStudent(app, db)
  const outsider = await createSchoolWithOwner(app, db, { name: 'Lakeside High', founderEmail: 'outsider@lakeside.edu' })

  const bytes = Buffer.from('segment-bytes')
  const segment = await signSegment(app, teacherCookie, bytes)
  await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-segments',
    headers: { cookie: teacherCookie },
    payload: { segment, content: bytes.toString('base64') }
  })

  const res = await app.inject({ method: 'GET', url: '/live-segments/session-1/0', headers: { cookie: outsider.ownerCookie } })
  assert.equal(res.statusCode, 403)
})

test('fetching an unknown sessionId/seq returns 404', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie)

  const res = await app.inject({ method: 'GET', url: '/live-segments/no-such-session/0', headers: { cookie: ownerCookie } })
  assert.equal(res.statusCode, 404)
})

test('fetching with a non-integer seq returns 400', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie)

  const res = await app.inject({ method: 'GET', url: '/live-segments/session-1/not-a-number', headers: { cookie: ownerCookie } })
  assert.equal(res.statusCode, 400)
})
