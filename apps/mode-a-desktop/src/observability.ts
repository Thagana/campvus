// Owns everything that needs electron/@sentry/electron runtime imports —
// kept separate from main.ts's existing bulk, and from sentry-scrub.ts
// (which stays Electron-free and independently testable).

import { app } from 'electron'
import * as Sentry from '@sentry/electron/main'
import type { ILogger } from 'update-electron-app'
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub'

// process.env.SENTRY_DSN is a build-time constant by the time this runs —
// vite.main.config.ts's `define` bakes it into the bundled main.js, since a
// packaged app has no shell-inherited env and no .env file inside the asar.
export function initMainObservability (): void {
  const dsn = process.env.SENTRY_DSN
  // Sentry.init() installs its default integrations (including uncaught
  // exception/unhandled rejection handlers) regardless of whether a DSN is
  // set — an explicit early return here, rather than calling init with an
  // empty dsn, guarantees zero behavioral change when SENTRY_DSN is unset
  // (local dev without a .env, CI on forked PRs with no exposed secrets).
  if (!dsn) return

  Sentry.init({
    dsn,
    release: `campvus-p2p@${app.getVersion()}`,
    environment: app.isPackaged ? 'production' : 'development',
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    // Backstop is scrubEvent/scrubBreadcrumb above — this just narrows what
    // the SDK's http/net integrations collect in the first place, since
    // nodeRequest.ts's calls (login-mode-b, course fetches) carry bearer
    // tokens and, for login, an email/password JSON body.
    dataCollection: {
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      cookies: false,
      urlQueryParams: false,
    },
  })
}

function formatArgs (args: unknown[]): string {
  return args
    .map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')
}

function record (level: Sentry.SeverityLevel, args: unknown[]): void {
  const message = formatArgs(args)
  const consoleFn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log
  consoleFn(message)
  // Update lifecycle events (feed URL, checking/available/downloaded/error)
  // aren't worth their own Sentry issue, but as breadcrumbs they show up in
  // the trail leading up to whatever crash report follows — same
  // beforeBreadcrumb scrubbing as every other breadcrumb this app produces.
  Sentry.addBreadcrumb({ category: 'updater', message, level })
}

// update-electron-app's ILogger methods are typed as single-string-arg, but
// it actually calls them with multiple args (e.g. log('feedURL', feedURL))
// — a rest-arg function is structurally assignable to that narrower type.
export const updateLogger: ILogger = {
  log: (...args: unknown[]) => record('info', args),
  info: (...args: unknown[]) => record('info', args),
  warn: (...args: unknown[]) => record('warning', args),
  error: (...args: unknown[]) => record('error', args),
}
