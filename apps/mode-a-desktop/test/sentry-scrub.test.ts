import test from 'node:test'
import assert from 'node:assert/strict'
import { scrubBreadcrumb, scrubEvent, scrubHeaders, scrubObjectDeep, scrubText, stripQueryString } from '../src/sentry-scrub'
import type { Breadcrumb, ErrorEvent } from '@sentry/electron/main'

test('stripQueryString removes everything from the first ? onward', () => {
  assert.equal(stripQueryString('https://example.com/path?token=abc'), 'https://example.com/path')
  assert.equal(stripQueryString('https://example.com/path'), 'https://example.com/path')
})

test('scrubText redacts a Bearer token', () => {
  assert.equal(scrubText('Authorization: Bearer abc123.def456'), 'Authorization: Bearer [redacted]')
})

test('scrubText redacts an email address', () => {
  assert.equal(scrubText('signing in as student@example.edu now'), 'signing in as [redacted-email] now')
})

test('scrubText leaves clean text unchanged', () => {
  assert.equal(scrubText('sync completed, 3 peers connected'), 'sync completed, 3 peers connected')
})

test('scrubHeaders redacts the Authorization header, case-insensitively, leaves others alone', () => {
  const result = scrubHeaders({ Authorization: 'Bearer secret-token', 'content-type': 'application/json' })
  assert.equal(result?.Authorization, '[redacted]')
  assert.equal(result?.['content-type'], 'application/json')
})

test('scrubHeaders passes through undefined', () => {
  assert.equal(scrubHeaders(undefined), undefined)
})

test('scrubObjectDeep redacts password/token/email keys at any depth', () => {
  const result = scrubObjectDeep({
    email: 'student@example.edu',
    nested: { password: 'hunter2', modeBToken: 'abc', safe: 'fine' }
  }) as Record<string, unknown>

  assert.equal(result.email, '[redacted]')
  const nested = result.nested as Record<string, unknown>
  assert.equal(nested.password, '[redacted]')
  assert.equal(nested.modeBToken, '[redacted]')
  assert.equal(nested.safe, 'fine')
})

test('scrubObjectDeep does not throw on cyclic objects', () => {
  const cyclic: Record<string, unknown> = { safe: 'fine' }
  cyclic.self = cyclic
  assert.doesNotThrow(() => scrubObjectDeep(cyclic))
})

test('scrubObjectDeep passes through primitives and null unchanged', () => {
  assert.equal(scrubObjectDeep(42), 42)
  assert.equal(scrubObjectDeep(null), null)
  assert.equal(scrubObjectDeep(undefined), undefined)
})

test('scrubBreadcrumb redacts Authorization headers, redacts an email embedded in a free-text body, and strips the URL query string', () => {
  const breadcrumb = {
    category: 'http',
    data: {
      url: 'https://example.com/api/auth/sign-in/email?foo=bar',
      headers: { Authorization: 'Bearer abc123' },
      // dataCollection.httpBodies is set to [] in observability.ts, so the
      // SDK shouldn't normally populate this — this is the defense-in-depth
      // backstop for the case where it (or a manual breadcrumb) does.
      body: '{"email":"student@example.edu","password":"hunter2"}'
    }
  } as unknown as Breadcrumb

  const result = scrubBreadcrumb(breadcrumb)

  assert.ok(result)
  const data = result?.data as Record<string, unknown>
  assert.equal(data.url, 'https://example.com/api/auth/sign-in/email')
  assert.equal((data.headers as Record<string, string>).Authorization, '[redacted]')
  assert.equal(data.body, '{"email":"[redacted-email]","password":"hunter2"}')
})

test('scrubBreadcrumb never throws on a breadcrumb with no data', () => {
  const breadcrumb = { category: 'ui.click', message: 'clicked settings' } as Breadcrumb
  assert.doesNotThrow(() => scrubBreadcrumb(breadcrumb))
})

test('scrubEvent strips headers/cookies/query_string from event.request and scrubs extra/contexts/breadcrumbs', () => {
  const event = {
    request: {
      url: 'https://example.com/courses?token=abc',
      headers: { Authorization: 'Bearer abc123' },
      cookies: { session: 'abc' },
      query_string: 'token=abc'
    },
    extra: { modeBUrl: 'https://school.example.edu', password: 'hunter2' },
    contexts: { app: { email: 'student@example.edu' } },
    breadcrumbs: [{ category: 'ui.click', data: { authorization: 'Bearer xyz' } }]
  } as unknown as ErrorEvent

  const result = scrubEvent(event)

  assert.equal(result.request?.url, 'https://example.com/courses')
  assert.equal(result.request?.headers?.Authorization, '[redacted]')
  assert.equal(result.request?.cookies, undefined)
  assert.equal(result.request?.query_string, undefined)
  assert.equal((result.extra as Record<string, unknown>).password, '[redacted]')
  assert.equal((result.extra as Record<string, unknown>).modeBUrl, 'https://school.example.edu')
  const appContext = (result.contexts as Record<string, Record<string, unknown>>).app
  assert.equal(appContext.email, '[redacted]')
  const crumbData = result.breadcrumbs?.[0]?.data as Record<string, unknown>
  assert.equal(crumbData.authorization, '[redacted]')
})

test('scrubEvent never throws on an event with no request/extra/contexts/breadcrumbs', () => {
  assert.doesNotThrow(() => scrubEvent({} as ErrorEvent))
})
