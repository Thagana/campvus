import test from 'node:test'
import assert from 'node:assert/strict'
import { FastifyInstance } from 'fastify'
import { createTestApp, registerUser, multipartBody } from './helpers'

async function setupCourseWithStudent (app: FastifyInstance): Promise<{ teacherCookie: string, studentCookie: string }> {
  const teacherCookie = await registerUser(app, 'teacher@school.edu')
  const studentCookie = await registerUser(app, 'student@school.edu')
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
    payload: { email: 'student@school.edu', role: 'student' }
  })
  return { teacherCookie, studentCookie }
}

test('a teacher can upload a file and it produces a signed manifest', async () => {
  const { app } = await createTestApp()
  const { teacherCookie } = await setupCourseWithStudent(app)

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
  const { app } = await createTestApp()
  const { studentCookie } = await setupCourseWithStudent(app)

  const { body, contentType } = multipartBody('slides.pdf', Buffer.from('week 6 slides'))
  const upload = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/manifests',
    headers: { cookie: studentCookie, 'content-type': contentType },
    payload: body
  })
  assert.equal(upload.statusCode, 403)
})

test('an enrolled student can list manifests and fetch content by hash', async () => {
  const { app } = await createTestApp()
  const { teacherCookie, studentCookie } = await setupCourseWithStudent(app)

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
  const { app } = await createTestApp()
  const { teacherCookie } = await setupCourseWithStudent(app)
  const outsiderCookie = await registerUser(app, 'outsider@school.edu')

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

test('rejects a malformed hash before touching the filesystem (path traversal defense)', async () => {
  const { app } = await createTestApp()
  const teacherCookie = await registerUser(app, 'teacher@school.edu')

  const traversal = await app.inject({
    method: 'GET',
    url: `/content/${encodeURIComponent('../institution-keys.json')}`,
    headers: { cookie: teacherCookie }
  })
  assert.equal(traversal.statusCode, 400)

  const empty = await app.inject({ method: 'GET', url: '/content/', headers: { cookie: teacherCookie } })
  assert.notEqual(empty.statusCode, 200)
})
