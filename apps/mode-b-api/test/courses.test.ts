import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, registerUser } from './helpers'

test('creating a course makes the creator its teacher', async () => {
  const { app } = await createTestApp()
  const teacherCookie = await registerUser(app, 'teacher@school.edu')

  const create = await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: teacherCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })
  assert.equal(create.statusCode, 201)

  const list = await app.inject({ method: 'GET', url: '/courses', headers: { cookie: teacherCookie } })
  assert.deepEqual(list.json(), [{ id: 'COMSCI214', name: 'Intro to CS', role: 'teacher' }])
})

test('only a teacher can enroll other users in their course', async () => {
  const { app } = await createTestApp()
  const teacherCookie = await registerUser(app, 'teacher@school.edu')
  const studentCookie = await registerUser(app, 'student@school.edu')

  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: teacherCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })

  const deniedEnroll = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: studentCookie },
    payload: { email: 'student@school.edu', role: 'student' }
  })
  assert.equal(deniedEnroll.statusCode, 403)

  const okEnroll = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: teacherCookie },
    payload: { email: 'student@school.edu', role: 'student' }
  })
  assert.equal(okEnroll.statusCode, 201)

  const list = await app.inject({ method: 'GET', url: '/courses', headers: { cookie: studentCookie } })
  assert.deepEqual(list.json(), [{ id: 'COMSCI214', name: 'Intro to CS', role: 'student' }])
})

test('enrolling an email with no account fails', async () => {
  const { app } = await createTestApp()
  const teacherCookie = await registerUser(app, 'teacher@school.edu')
  await app.inject({
    method: 'POST',
    url: '/courses',
    headers: { cookie: teacherCookie },
    payload: { id: 'COMSCI214', name: 'Intro to CS' }
  })

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/enrollments',
    headers: { cookie: teacherCookie },
    payload: { email: 'nobody@school.edu', role: 'student' }
  })
  assert.equal(res.statusCode, 404)
})
