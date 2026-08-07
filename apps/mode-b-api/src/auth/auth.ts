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
import { buildOrganizationHooks } from './organization-hooks'
import { buildSchoolRoles } from './roles'

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30

// No email provider is wired up yet, so an invite's accept link is printed
// to the server console instead of sent — same "no operator setup step"
// reasoning as ensureAuthSecret (paths.ts). The inviter reads it from stdout
// and passes it on to the invitee out-of-band. WEB_URL matches the origin
// entry in trustedOrigins below; the /accept-invite route it points at
// doesn't exist in mode-b-web yet — that's a separate, later piece of work.
const WEB_URL = process.env.WEB_URL || 'http://localhost:5173'

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
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Reset your Campvus password',
          html: `<p>Click the link below to reset your Campvus password:</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, you can ignore this email.</p>`
        })
      }
    },
    // sendOnSignUp fires the verification email right after sign-up, but
    // (unlike emailAndPassword.requireEmailVerification) doesn't gate
    // sign-in on it — this app has no verified-email requirement yet (see
    // create-school.ts's list-user-invitations note), so verification stays
    // informational for now rather than blocking.
    emailVerification: {
      sendOnSignUp: true,
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
    trustedOrigins: ['http://localhost:5173'],
    plugins: [
      organizationPlugin({
        ac: roles.ac,
        roles: { owner: roles.owner, teacher: roles.teacher, student: roles.student },
        // Schools are created only by the internal school-creation script
        // (auth/create-school.ts), never through self-service sign-up.
        allowUserToCreateOrganization: false,
        organizationHooks,
        sendInvitationEmail: async (data) => {
          const url = `${WEB_URL}/accept-invite?id=${data.id}`
          console.log(`Invitation for ${data.email} to join "${data.organization.name}" as ${data.role}:`)
          console.log(`  ${url}`)
        }
      })
    ]
  })

  return { auth, fromNodeHeaders }
}

export type AuthBundle = Awaited<ReturnType<typeof createAuth>>
export type Auth = AuthBundle['auth']
