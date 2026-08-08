import { Db } from '../db/client'
import { getSchoolMembership, grantedRoleFrom, schoolWouldLoseItsLastTeacher, STAFF_ROLES } from './guards'

type MemberSnapshot = { id: string, role: string, organizationId: string }

// Thin plugin-wiring shim: translates auth/guards.ts's ADR-0005
// School-authorization rules into better-auth's own hook protocol
// (its APIError, at the four points its invite-member/accept-invitation/
// update-member-role/remove-member endpoints call out to). The actual
// rules — what's grantable, what counts as staff, the last-Teacher
// invariant — are owned by guards.ts, not repeated here.
export async function buildOrganizationHooks (db: Db) {
  const { APIError } = await import('better-auth')

  function assertGrantableRole (roleString: string): string {
    const role = grantedRoleFrom(roleString)
    if (!role) {
      throw new APIError('BAD_REQUEST', { message: 'only the teacher or student role may be granted' })
    }
    return role
  }

  return {
    async beforeCreateInvitation ({ invitation }: { invitation: { role: string } }) {
      assertGrantableRole(invitation.role)
    },

    async beforeAcceptInvitation ({ user }: { user: { id: string } }) {
      const existing = await getSchoolMembership(db, user.id)
      if (existing) {
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
