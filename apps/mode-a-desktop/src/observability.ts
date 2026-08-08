// Owns everything that needs electron/@sentry/electron runtime imports —
// kept separate from main.ts's existing bulk, and from sentry-scrub.ts
// (which stays Electron-free and independently testable).

import { app } from 'electron'
import * as Sentry from '@sentry/electron/main'
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
