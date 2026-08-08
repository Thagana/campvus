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
import { sendEmail } from '../email/brevo'
import { sendInvitationEmail } from '../email/invitation-email'
import { WEB_URL } from '../config'
import { buildOrganizationHooks } from './organization-hooks'
import { buildSchoolRoles } from './roles'

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30

export async function createAuth (db: Db, secret: string) {
  const [{ betterAuth }, { drizzleAdapter }, { fromNodeHeaders }, { organization: organizationPlugin }, { bearer }, roles, organizationHooks] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/drizzle'),
    import('better-auth/node'),
    import('better-auth/plugins/organization'),
    import('better-auth/plugins/bearer'),
    buildSchoolRoles(),
    buildOrganizationHooks(db)
  ])

  const auth = betterAuth({
    secret,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification, organization, member, invitation }
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Reset your Campvus password',
          html: `<p>Click the link below to reset your Campvus password:</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, you can ignore this email.</p>`
        })
      }
    },
    // requireEmailVerification means sign-up no longer returns a session —
    // it creates the user, sends this verification email, and the client
    // has to wait for it. autoSignInAfterVerification signs the user in the
    // moment they click the emailed link (that GET lands on this API
    // server's own origin, same-origin with the web app per vite.config.ts,
    // so the session cookie it sets is usable immediately after).
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Verify your Campvus email',
          html: `<p>Welcome to Campvus! Confirm your email address:</p><p><a href="${url}">${url}</a></p>`
        })
      }
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
    trustedOrigins: [WEB_URL],
    plugins: [
      // Lets a non-browser client (apps/mode-a-desktop's Electron main
      // process — no cookie jar, and Hyperswarm can't run in a browser
      // anyway) authenticate with `Authorization: Bearer <session-token>`
      // instead of a cookie. auth/guards.ts's installRequestUser already
      // calls auth.api.getSession() on every request; this plugin makes
      // that call transparently recognize the header too, so no guard code
      // changes — closes Open Question #9(a) (docs/ARCHITECTURE.md), the
      // Mode A <-> Mode B origin-auth gap. Sign-in responses carry the
      // token back in a `set-auth-token` response header (better-auth's own
      // convention) instead of a cookie for callers that send this header.
      bearer(),
      organizationPlugin({
        ac: roles.ac,
        roles: { owner: roles.owner, teacher: roles.teacher, student: roles.student },
        // Schools are created only by the internal school-creation script
        // (auth/create-school.ts), never through self-service sign-up.
        allowUserToCreateOrganization: false,
        organizationHooks,
        sendInvitationEmail: async (data) => {
          await sendInvitationEmail({
            to: data.email,
            schoolName: data.organization.name,
            role: data.role,
            invitationId: data.id
          })
        }
      })
    ]
  })

  return { auth, fromNodeHeaders }
}

export type AuthBundle = Awaited<ReturnType<typeof createAuth>>
export type Auth = AuthBundle['auth']
