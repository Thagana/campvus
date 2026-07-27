import { eq } from 'drizzle-orm'
import { Db } from '../db/client'
import { member } from '../db/schema'

const INVITABLE_ROLES = new Set(['teacher', 'student'])

// better-auth's own invite-member/update-member-role validation accepts its
// built-in admin/member/owner role strings regardless of the custom `roles`
// we configure (see auth/roles.ts) — it merges the two sets rather than
// replacing them. These hooks close that gap and enforce the ADR-0005
// invariants better-auth has no config option for: Owner is never granted
// through a regular invite, and a person belongs to at most one School.
export async function buildOrganizationHooks (db: Db) {
  const { APIError } = await import('better-auth')

  return {
    async beforeCreateInvitation ({ invitation }: { invitation: { role: string } }) {
      const roles = invitation.role.split(',').map(r => r.trim()).filter(Boolean)
      if (roles.length !== 1 || !INVITABLE_ROLES.has(roles[0])) {
        throw new APIError('BAD_REQUEST', { message: 'invitations may only grant the teacher or student role' })
      }
    },

    async beforeAcceptInvitation ({ user }: { user: { id: string } }) {
      const existing = await db.select().from(member).where(eq(member.userId, user.id)).limit(1)
      if (existing[0]) {
        throw new APIError('BAD_REQUEST', { message: 'this account already belongs to a School' })
      }
    }
  }
}
