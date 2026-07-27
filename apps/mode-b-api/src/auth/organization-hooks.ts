import { and, eq, inArray, ne } from 'drizzle-orm'
import { Db } from '../db/client'
import { member } from '../db/schema'
import { GRANTABLE_ROLES, STAFF_ROLES } from './school-roles'

type MemberSnapshot = { id: string, role: string, organizationId: string }

// Note: for the Owner specifically, better-auth's own creatorRole
// protection already blocks demoting/removing a School's sole Owner before
// this even runs (it's the only member ever assigned 'owner', and that role
// is never grantable elsewhere — see assertGrantableRole below — so the
// Owner can never actually leave through these two actions). This function
// still matters for a plain Teacher: it's what stops a School from being
// left with zero Teacher/Owner members if the Owner were ever removed by
// some future path.
async function schoolWouldLoseItsLastTeacher (db: Db, organizationId: string, excludingMemberId: string): Promise<boolean> {
  const remainingStaff = await db.select().from(member).where(and(
    eq(member.organizationId, organizationId),
    inArray(member.role, STAFF_ROLES),
    ne(member.id, excludingMemberId)
  ))
  return remainingStaff.length === 0
}

// better-auth's own invite-member/update-member-role validation accepts its
// built-in admin/member/owner role strings regardless of the custom `roles`
// we configure (see auth/roles.ts) — it merges the two sets rather than
// replacing them. These hooks close that gap and enforce the ADR-0005
// invariants better-auth has no config option for: Owner is never granted
// through a regular invite or role change, a person belongs to at most one
// School, and a School can never end up with zero Teacher/Owner members.
export async function buildOrganizationHooks (db: Db) {
  const { APIError } = await import('better-auth')

  function assertGrantableRole (roleString: string): string {
    const roles = roleString.split(',').map(r => r.trim()).filter(Boolean)
    if (roles.length !== 1 || !GRANTABLE_ROLES.has(roles[0])) {
      throw new APIError('BAD_REQUEST', { message: 'only the teacher or student role may be granted' })
    }
    return roles[0]
  }

  return {
    async beforeCreateInvitation ({ invitation }: { invitation: { role: string } }) {
      assertGrantableRole(invitation.role)
    },

    async beforeAcceptInvitation ({ user }: { user: { id: string } }) {
      const existing = await db.select().from(member).where(eq(member.userId, user.id)).limit(1)
      if (existing[0]) {
        throw new APIError('BAD_REQUEST', { message: 'this account already belongs to a School' })
      }
    },

    async beforeUpdateMemberRole ({ member: target, newRole }: { member: MemberSnapshot, newRole: string }) {
      const grantedRole = assertGrantableRole(newRole)
      const wasStaff = STAFF_ROLES.includes(target.role)
      const staysStaff = STAFF_ROLES.includes(grantedRole)
      if (wasStaff && !staysStaff && await schoolWouldLoseItsLastTeacher(db, target.organizationId, target.id)) {
        throw new APIError('BAD_REQUEST', { message: "cannot demote the School's last Teacher" })
      }
    },

    async beforeRemoveMember ({ member: target }: { member: MemberSnapshot }) {
      if (STAFF_ROLES.includes(target.role) && await schoolWouldLoseItsLastTeacher(db, target.organizationId, target.id)) {
        throw new APIError('BAD_REQUEST', { message: "cannot remove the School's last Teacher" })
      }
    }
  }
}
