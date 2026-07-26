// better-auth instance for Mode B. Owns account creation, password
// hashing, and session issuance/verification — replaces the hand-rolled
// auth/session.ts + auth/password.ts this file supersedes.
//
// This package is CommonJS (see package.json — no "type": "module"), but
// better-auth ships ESM-only. A dynamic `import()` — rather than a static
// `import` — sidesteps that mismatch (Node's CJS loader supports it
// natively), and lets TypeScript infer `AuthBundle`/`Auth` below straight
// from the dynamically-imported types instead of needing an ESM-only
// static type import (which itself would require a `resolution-mode`
// attribute here).

import { Db } from '../db/client'
import { account, session, user, verification } from '../db/schema'

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30

export async function createAuth (db: Db, secret: string) {
  const [{ betterAuth }, { drizzleAdapter }, { fromNodeHeaders }] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/drizzle'),
    import('better-auth/node')
  ])

  const auth = betterAuth({
    secret,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user, session, account, verification }
    }),
    emailAndPassword: {
      enabled: true
    },
    session: {
      expiresIn: THIRTY_DAYS_SECONDS // matches the previous hand-rolled session TTL
    }
  })

  return { auth, fromNodeHeaders }
}

export type AuthBundle = Awaited<ReturnType<typeof createAuth>>
export type Auth = AuthBundle['auth']
