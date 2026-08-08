import { STAFF_ROLES } from './guards'

// ADR-0005: Schools are better-auth Organizations with three roles —
// owner/teacher/student — replacing the plugin's default owner/admin/member.
// Owner and Teacher carry identical permissions; Owner is distinguished only
// by how it's assigned (see auth/create-school.ts), never by what it can do.
// Student gets no organization/member/invitation permissions at all, so
// better-auth's own permission checks already refuse a Student who tries to
// invite or manage members — no extra guard code needed for that part.
// Which of the three gets which permission set is derived from guards.ts's
// STAFF_ROLES rather than hand-picked here a second time.
export async function buildSchoolRoles () {
  const [{ createAccessControl }, { defaultStatements }] = await Promise.all([
    import('better-auth/plugins/access'),
    import('better-auth/plugins/organization/access')
  ])

  const ac = createAccessControl(defaultStatements)
  const staffPermissions = {
    organization: ['update'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel']
  } as const
  const studentPermissions = { organization: [], member: [], invitation: [] } as const

  const permissionsFor = (role: string) => STAFF_ROLES.includes(role) ? staffPermissions : studentPermissions

  return {
    ac,
    owner: ac.newRole(permissionsFor('owner')),
    teacher: ac.newRole(permissionsFor('teacher')),
    student: ac.newRole(permissionsFor('student'))
  }
}
