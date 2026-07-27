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
import { account, invitation, member, organization, session, user, verification } from '../db/schema'
import { buildOrganizationHooks } from './organization-hooks'
import { buildSchoolRoles } from './roles'

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30

export async function createAuth (db: Db, secret: string) {
  const [{ betterAuth }, { drizzleAdapter }, { fromNodeHeaders }, { organization: organizationPlugin }, roles, organizationHooks] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/drizzle'),
    import('better-auth/node'),
    import('better-auth/plugins/organization'),
    buildSchoolRoles(),
    buildOrganizationHooks(db)
  ])

  const auth = betterAuth({
    secret,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user, session, account, verification, organization, member, invitation }
    }),
    emailAndPassword: {
      enabled: true
    },
    session: {
      expiresIn: THIRTY_DAYS_SECONDS // matches the previous hand-rolled session TTL
    },
    // better-auth's origin-check middleware forces validation on any request
    // carrying Sec-Fetch-Site/Mode/Dest (i.e. every browser fetch()) against
    // this list, regardless of how "same-origin" the deployment actually is
    // (see vite.config.ts) — it has no notion of the dev proxy. Without an
    // entry here every sign-up/sign-in from the Vite dev server 403s
    // (INVALID_ORIGIN). Production's origin is covered automatically:
    // better-auth folds BETTER_AUTH_URL/BETTER_AUTH_TRUSTED_ORIGINS env vars
    // into this list on its own, so set BETTER_AUTH_URL to the deployed
    // origin there instead of hardcoding it here.
    trustedOrigins: ['http://localhost:5173'],
    plugins: [
      organizationPlugin({
        ac: roles.ac,
        roles: { owner: roles.owner, teacher: roles.teacher, student: roles.student },
        // Schools are created only by the internal school-creation script
        // (auth/create-school.ts), never through self-service sign-up.
        allowUserToCreateOrganization: false,
        organizationHooks
      })
    ]
  })

  return { auth, fromNodeHeaders }
}

export type AuthBundle = Awaited<ReturnType<typeof createAuth>>
export type Auth = AuthBundle['auth']
