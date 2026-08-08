import test from 'node:test'
import assert from 'node:assert/strict'
import { FastifyInstance } from 'fastify'
import { Db } from '../src/db/client'
import { createTestApp, createSchoolWithOwner, inviteAndAccept, registerUser, multipartBody } from './helpers'

async function setupCourseWithStudent (app: FastifyInstance, db: Db): Promise<{ teacherCookie: string, studentCookie: string }> {
  const { organizationId, ownerCookie: teacherCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@school.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: teacherCookie, email: 'student@school.edu', role: 'student' })
  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: teacherCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })
  await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: teacherCookie },
    payload: { email: 'student@school.edu' }
  })
  return { teacherCookie, studentCookie }
}

test('a teacher can upload a file and it produces a signed manifest', async () => {
  const { app, db } = await createTestApp()
  const { teacherCookie } = await setupCourseWithStudent(app, db)

  const { body, contentType } = multipartBody('slides.pdf', Buffer.from('week 6 slides'))
  const upload = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/manifests',
    headers: { cookie: teacherCookie, 'content-type': contentType },
    payload: body
  })

  assert.equal(upload.statusCode, 201)
  const { manifest, deduped } = upload.json()
  assert.equal(deduped, false)
  assert.equal(manifest.filename, 'slides.pdf')
  assert.ok(manifest.signature)
})

test('a non-teacher cannot upload', async () => {
  const { app, db } = await createTestApp()
  const { studentCookie } = await setupCourseWithStudent(app, db)

  const { body, contentType } = multipartBody('slides.pdf', Buffer.from('week 6 slides'))
  const upload = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/manifests',
    headers: { cookie: studentCookie, 'content-type': contentType },
    payload: body
  })
  assert.equal(upload.statusCode, 403)
})

test('an account with no School membership is denied on both manifest routes', async () => {
  const { app, db } = await createTestApp()
  await setupCourseWithStudent(app, db)
  const schoollessCookie = await registerUser(app, db, 'schoolless@example.com')

  const { body, contentType } = multipartBody('slides.pdf', Buffer.from('week 6 slides'))
  const upload = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/manifests',
    headers: { cookie: schoollessCookie, 'content-type': contentType },
    payload: body
  })
  assert.equal(upload.statusCode, 403)

  const list = await app.inject({ method: 'GET', url: '/courses/COMSCI214/manifests', headers: { cookie: schoollessCookie } })
  assert.equal(list.statusCode, 403)
})

test('an enrolled student can list manifests and fetch content by hash', async () => {
  const { app, db } = await createTestApp()
  const { teacherCookie, studentCookie } = await setupCourseWithStudent(app, db)

  const { body, contentType } = multipartBody('slides.pdf', Buffer.from('week 6 slides'))
  const upload = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/manifests',
    headers: { cookie: teacherCookie, 'content-type': contentType },
    payload: body
  })
  const { manifest } = upload.json()

  const list = await app.inject({ method: 'GET', url: '/courses/COMSCI214/manifests', headers: { cookie: studentCookie } })
  assert.equal(list.statusCode, 200)
  assert.equal(list.json().length, 1)

  const content = await app.inject({ method: 'GET', url: `/content/${manifest.hash}`, headers: { cookie: studentCookie } })
  assert.equal(content.statusCode, 200)
  assert.equal(content.body, 'week 6 slides')
})

test('a user not enrolled in the course cannot fetch its content by hash', async () => {
  const { app, db } = await createTestApp()
  const { teacherCookie } = await setupCourseWithStudent(app, db)
  const outsiderCookie = await registerUser(app, db, 'outsider@school.edu')

  const { body, contentType } = multipartBody('slides.pdf', Buffer.from('week 6 slides'))
  const upload = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/manifests',
    headers: { cookie: teacherCookie, 'content-type': contentType },
    payload: body
  })
  const { manifest } = upload.json()

  const content = await app.inject({ method: 'GET', url: `/content/${manifest.hash}`, headers: { cookie: outsiderCookie } })
  assert.equal(content.statusCode, 403)
})

test("a colleague Teacher who didn't create the course can still list its manifests and fetch its content", async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie: teacherCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@school.edu' })
  const { cookie: colleagueCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: teacherCookie, email: 'colleague@school.edu', role: 'teacher' })
  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: teacherCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })

  const { body, contentType } = multipartBody('slides.pdf', Buffer.from('week 6 slides'))
  const upload = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/manifests',
    headers: { cookie: teacherCookie, 'content-type': contentType },
    payload: body
  })
  const { manifest } = upload.json()

  // The colleague has no per-course Enrollment row at all — School
  // membership as a Teacher is enough.
  const list = await app.inject({ method: 'GET', url: '/courses/COMSCI214/manifests', headers: { cookie: colleagueCookie } })
  assert.equal(list.statusCode, 200)

  const content = await app.inject({ method: 'GET', url: `/content/${manifest.hash}`, headers: { cookie: colleagueCookie } })
  assert.equal(content.statusCode, 200)
})

test('rejects a malformed hash before touching the filesystem (path traversal defense)', async () => {
  const { app, db } = await createTestApp()
  const teacherCookie = await registerUser(app, db, 'teacher@school.edu')

  const traversal = await app.inject({
    method: 'GET',
    url: `/content/${encodeURIComponent('../institution-keys.json')}`,
    headers: { cookie: teacherCookie }
  })
  assert.equal(traversal.statusCode, 400)

  const empty = await app.inject({ method: 'GET', url: '/content/', headers: { cookie: teacherCookie } })
  assert.notEqual(empty.statusCode, 200)
})
