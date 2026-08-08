// PII scrubbing for Sentry's beforeSend/beforeBreadcrumb hooks. Only
// `import type` from @sentry/electron here — erased at compile time, so
// this stays free of any Electron/@sentry runtime dependency and testable
// under `tsx --test` with no Electron runtime, same convention as agent.ts.
// This is the primary defense against PII (Mode B login email/password,
// bearer tokens) leaking into Sentry via automatic HTTP breadcrumbs of
// nodeRequest.ts's calls — dataCollection options on Sentry.init narrow
// what's collected up front, but this scrubber is the backstop that must
// never let a sensitive key or pattern through, in event data or
// breadcrumbs alike.

import type { Breadcrumb, ErrorEvent } from '@sentry/electron/main'

const SENSITIVE_KEY_PATTERN = /password|token|authorization|secret|email/i
const BEARER_PATTERN = /Bearer\s+\S+/gi
// Deliberately conservative character classes (not the permissive
// `[^\s@]+@[^\s@]+\.[^\s@]+`) — that greedily spans quotes/braces/colons in
// JSON-like text (e.g. a login body), matching far more than the email
// itself. Restricting to standard email-safe characters keeps the match
// tight to just the address.
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

export function stripQueryString (url: string): string {
  const index = url.indexOf('?')
  return index === -1 ? url : url.slice(0, index)
}

export function scrubText (value: string): string {
  return value.replace(BEARER_PATTERN, 'Bearer [redacted]').replace(EMAIL_PATTERN, '[redacted-email]')
}

export function scrubHeaders (
  headers: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!headers) return headers
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    result[key] = /authorization/i.test(key) ? '[redacted]' : scrubText(value)
  }
  return result
}

export function scrubObjectDeep (value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') return scrubText(value)
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return value
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => scrubObjectDeep(item, seen))

  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : scrubObjectDeep(val, seen)
  }
  return result
}

// Applied to a single breadcrumb's `data` — the field that matters most,
// since the SDK's http/net integrations report request/response details as
// breadcrumbs (e.g. nodeRequest.ts's calls through authHeaders()), not as
// separate captured events.
export function scrubBreadcrumb (breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message)

  const data = breadcrumb.data
  if (data) {
    if (typeof data.headers === 'object' && data.headers !== null) {
      data.headers = scrubHeaders(data.headers as Record<string, string>)
    }
    if (typeof data.url === 'string') data.url = stripQueryString(data.url)
    breadcrumb.data = scrubObjectDeep(data) as Breadcrumb['data']
  }

  return breadcrumb
}

export function scrubEvent (event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request.headers = scrubHeaders(event.request.headers)
    if (event.request.data !== undefined) event.request.data = scrubObjectDeep(event.request.data)
    if (event.request.url) event.request.url = stripQueryString(event.request.url)
    delete event.request.query_string
    delete event.request.cookies
  }

  if (event.extra) event.extra = scrubObjectDeep(event.extra) as typeof event.extra
  if (event.contexts) event.contexts = scrubObjectDeep(event.contexts) as typeof event.contexts
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b) ?? b)

  return event
}
