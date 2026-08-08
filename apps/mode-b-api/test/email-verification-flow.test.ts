import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, createSchoolWithOwner, withBrevoStandIn } from './helpers'

// Every other test exercising email verification (helpers.ts's
// registerUser) shortcuts it by flipping emailVerified directly in the DB
// — none of them drive the real verify-email endpoint or its
// auto-sign-in-after-verification cookie. This replays the actual browser
// journey byte-for-byte instead: sign-up with the same callbackURL
// AcceptInvitePage.tsx sends, extract the real verification link from the
// captured email, hit it for real, and use whatever cookie that response
// sets — the same path a real invited student takes.
test('a real sign-up -> email verification -> accept-invitation -> browse journey works end to end', async () => {
  const { app, db } = await createTestApp()
  const { organizationId, ownerCookie } = await createSchoolWithOwner(app, db, { name: 'Riverside High', founderEmail: 'owner@riverside.edu' })

  const invite = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/invite-member',
    headers: { cookie: ownerCookie, origin: 'http://localhost:80' },
    payload: { email: 'student@riverside.edu', role: 'student', organizationId }
  })
  assert.equal(invite.statusCode, 200)
  const invitationId = invite.json().id

  let verifyUrl = ''
  await withBrevoStandIn(async (received) => {
    // Exactly what AcceptInvitePage.tsx's handleAuthSubmit sends in its
    // default 'register' mode, including callbackURL back to itself.
    const callbackURL = `/accept-invite?id=${encodeURIComponent(invitationId)}`
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: 'student@riverside.edu', password: 'hunter22', name: 'student@riverside.edu', callbackURL }
    })
    assert.equal(signUp.statusCode, 200)
    assert.equal(signUp.json().token, null, 'sign-up should not grant a session before verification')

    const emails = received()
    assert.equal(emails.length, 1)
    const match = emails[0].html.match(/href="([^"]+verify-email[^"]+)"/)
    assert.ok(match, 'no verify-email link found in the invitation email')
    verifyUrl = match![1]
  })

  const parsed = new URL(verifyUrl)
  const verify = await app.inject({ method: 'GET', url: parsed.pathname + parsed.search })
  const sessionCookie = verify.cookies.find(c => c.name.endsWith('session_token'))
  assert.ok(sessionCookie, 'verify-email response did not set a session cookie (auto-sign-in-after-verification)')
  const cookie = `${sessionCookie!.name}=${sessionCookie!.value}`

  const accept = await app.inject({
    method: 'POST',
    url: '/api/auth/organization/accept-invitation',
    headers: { cookie, origin: 'http://localhost:80' },
    payload: { invitationId }
  })
  assert.equal(accept.statusCode, 200, `accept-invitation failed: ${accept.body}`)
  assert.equal(accept.json().member.role, 'student')

  const courses = await app.inject({ method: 'GET', url: '/courses', headers: { cookie } })
  assert.equal(courses.statusCode, 200)

  const school = await app.inject({ method: 'GET', url: '/school', headers: { cookie } })
  assert.equal(school.statusCode, 200)
  assert.equal(school.json().role, 'student')
})
