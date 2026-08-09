import test from 'node:test'
import assert from 'node:assert/strict'
import b4a from 'b4a'
import { verifySessionStart, verifyLiveSegment, hashBuffer } from '@campvus/engine'
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

test('a Teacher gets a valid session-start signature, verifiable against the institution public key', async () => {
  const { app, db, keypair } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-signatures',
    headers: { cookie: ownerCookie },
    payload: { kind: 'session-start', sessionId: 'session-1', startedAt: 1000 }
  })

  assert.equal(res.statusCode, 200)
  const session = res.json()
  assert.equal(session.courseId, 'COMSCI214')
  assert.equal(session.sessionId, 'session-1')
  const publicKeyHex = b4a.toString(keypair.publicKey, 'hex')
  assert.equal(verifySessionStart(session, publicKeyHex), true)
})

test('a Teacher gets a valid segment signature, verifiable against the institution public key', async () => {
  const { app, db, keypair } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie)

  const bytes = Buffer.from('segment-bytes')
  const hash = hashBuffer(bytes)
  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-signatures',
    headers: { cookie: ownerCookie },
    payload: { kind: 'segment', sessionId: 'session-1', seq: 0, hash, size: bytes.length, timestamp: 1000 }
  })

  assert.equal(res.statusCode, 200)
  const segment = res.json()
  assert.equal(segment.courseId, 'COMSCI214')
  assert.equal(segment.hash, hash)
  const publicKeyHex = b4a.toString(keypair.publicKey, 'hex')
  assert.equal(verifyLiveSegment(segment, publicKeyHex), true)
})

test('courseId always comes from the URL, not the body — a client cannot stamp a different course into the signature', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'teacher@riverside.edu' })
  await createCourse(app, ownerCookie)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-signatures',
    headers: { cookie: ownerCookie },
    // Deliberately smuggling an extra courseId field the route never reads —
    // proves the URL param wins, not whatever a client puts in the body.
    payload: { kind: 'session-start', sessionId: 'session-1', startedAt: 1000, courseId: 'MATH101' }
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.json().courseId, 'COMSCI214')
})

test('a Student is denied — signing is teacher-only', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  const { cookie: studentCookie } = await inviteAndAccept(app, db, { organizationId, inviterCookie: ownerCookie, email: 'student@riverside.edu', role: 'student' })
  await createCourse(app, ownerCookie)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-signatures',
    headers: { cookie: studentCookie },
    payload: { kind: 'session-start', sessionId: 'session-1', startedAt: 1000 }
  })

  assert.equal(res.statusCode, 403)
})

test('signing for a course in a different School is denied', async () => {
  const { app, db } = await createTestApp()
  const schoolA = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner-a@example.edu' })
  const schoolB = await createSchoolWithOwner(app, db, { name: 'Lakeside High', founderEmail: 'owner-b@example.edu' })
  await createCourse(app, schoolA.ownerCookie)

  const res = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-signatures',
    headers: { cookie: schoolB.ownerCookie },
    payload: { kind: 'session-start', sessionId: 'session-1', startedAt: 1000 }
  })

  assert.equal(res.statusCode, 403)
})

test('missing fields are rejected with 400', async () => {
  const { app, db } = await createTestApp()
  const { ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })
  await createCourse(app, ownerCookie)

  const badKind = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-signatures',
    headers: { cookie: ownerCookie },
    payload: { kind: 'not-a-real-kind' }
  })
  assert.equal(badKind.statusCode, 400)

  const missingFields = await app.inject({
    method: 'POST',
    url: '/courses/COMSCI214/live-signatures',
    headers: { cookie: ownerCookie },
    payload: { kind: 'segment', sessionId: 'session-1' }
  })
  assert.equal(missingFields.statusCode, 400)
})
