// Everything answering "who can do what in a School" (ADR-0005) — the
// single module both enforcement boundaries read from: the Fastify route
// boundary (requireSchoolRole/requireCourseRole/accessibleCourseIds below)
// and the better-auth plugin boundary (auth/organization-hooks.ts's thin
// wrapper around grantedRoleFrom/schoolWouldLoseItsLastTeacher, and
// auth/roles.ts's access-control role definitions). Previously split across
// four independently-maintained files; consolidated here so a change to
// "what counts as staff" or "what's grantable" has exactly one place to
// make it. `installRequestUser` wires better-auth's session lookup ->
// `request.user` on every request. `requireAuth` enforces "is anyone
// logged in"; `requireSchoolRole` enforces "is this user a Teacher/Student
// of *some* School"; `requireCourseRole`/`accessibleCourseIds` enforce
// course-level access — a Teacher's access is School-wide (their School
// membership alone, no per-course row needed), a Student's is per-course
// (an `enrollments` row).

import { and, eq, inArray, ne } from 'drizzle-orm'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Db } from '../db/client'
import { courses, enrollments, member } from '../db/schema'
import { isPlatformAdmin } from './platform-admin'
import type { AuthBundle } from './auth'

// Owner and Teacher share every permission (auth/roles.ts) and both count
// as "staff" for School-wide Course access; Owner is distinguished only by
// how it's assigned (auth/create-school.ts), never by what it can do.
export const STAFF_ROLES = ['teacher', 'owner']

// The only roles a regular invite or role change may grant — Owner is
// seeded once per School (auth/create-school.ts) and never granted through
// these paths.
export const GRANTABLE_ROLES = new Set(['teacher', 'student'])

export interface SessionUser {
  id: string
  email: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null
  }
}

export function installRequestUser (app: FastifyInstance, { auth, fromNodeHeaders }: AuthBundle): void {
  app.decorateRequest('user', null)
  app.addHook('onRequest', async (request) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
    request.user = session ? { id: session.user.id, email: session.user.email } : null
  })
}

export function requireAuth (request: FastifyRequest, reply: FastifyReply): SessionUser | null {
  if (!request.user) {
    reply.code(401).send({ error: 'authentication required' })
    return null
  }
  return request.user
}

// Platform-admin (routes/admin.ts) is a separate axis from School
// membership entirely — an admin doesn't need to belong to any School.
export function requirePlatformAdmin (request: FastifyRequest, reply: FastifyReply): SessionUser | null {
  const user = requireAuth(request, reply)
  if (!user) return null
  if (!isPlatformAdmin(user.email)) {
    reply.code(403).send({ error: 'platform admin access required' })
    return null
  }
  return user
}

export interface SchoolMembership {
  userId: string
  organizationId: string
  role: string
}

// A person belongs to at most one School (ADR-0005), so this is a single
// lookup rather than "which School" — there's no active-organization
// switching concept to worry about.
export async function getSchoolMembership (db: Db, userId: string): Promise<{ organizationId: string, role: string } | null> {
  const rows = await db.select().from(member).where(eq(member.userId, userId)).limit(1)
  return rows[0] ? { organizationId: rows[0].organizationId, role: rows[0].role } : null
}

export async function requireSchoolRole (
  db: Db,
  request: FastifyRequest,
  reply: FastifyReply,
  allowedRoles: string[]
): Promise<SchoolMembership | null> {
  const user = requireAuth(request, reply)
  if (!user) return null

  const membership = await getSchoolMembership(db, user.id)
  if (!membership || !allowedRoles.includes(membership.role)) {
    reply.code(403).send({ error: 'not a member of a School with sufficient permissions' })
    return null
  }
  return { userId: user.id, organizationId: membership.organizationId, role: membership.role }
}

export interface CourseMembership {
  userId: string
  role: string
}

// A Teacher's course role is derived, not stored: any Teacher/Owner in the
// Course's own School has access, with no per-course row. A Student's
// requires an actual `enrollments` row for that specific Course.
async function courseRoleFor (db: Db, userId: string, courseId: string): Promise<'teacher' | 'student' | null> {
  const courseRows = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1)
  const course = courseRows[0]
  if (!course) return null

  const membership = await getSchoolMembership(db, userId)
  if (membership && membership.organizationId === course.schoolId && STAFF_ROLES.includes(membership.role)) {
    return 'teacher'
  }

  const enrolled = await db.select().from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
    .limit(1)
  return enrolled[0] ? 'student' : null
}

export async function requireCourseRole (
  db: Db,
  request: FastifyRequest,
  reply: FastifyReply,
  courseId: string,
  allowedRoles: string[]
): Promise<CourseMembership | null> {
  const user = requireAuth(request, reply)
  if (!user) return null

  const role = await courseRoleFor(db, user.id, courseId)
  if (!role || !allowedRoles.includes(role)) {
    reply.code(403).send({ error: 'not enrolled with sufficient permissions for this course' })
    return null
  }
  return { userId: user.id, role }
}

// Every Course id a user can reach: for a Teacher/Owner, every Course in
// their School; for a Student, only Courses they hold an Enrollment in.
export async function accessibleCourseIds (db: Db, userId: string): Promise<string[]> {
  const membership = await getSchoolMembership(db, userId)
  if (membership && STAFF_ROLES.includes(membership.role)) {
    const rows = await db.select({ id: courses.id }).from(courses).where(eq(courses.schoolId, membership.organizationId))
    return rows.map(r => r.id)
  }

  const rows = await db.select({ courseId: enrollments.courseId }).from(enrollments).where(eq(enrollments.userId, userId))
  return rows.map(r => r.courseId)
}

// The two ADR-0005 invariants better-auth's own invite-member/
// update-member-role validation has no config option for — it accepts its
// built-in admin/member/owner role strings regardless of the custom
// `roles` configured in auth/roles.ts (it merges the two sets rather than
// replacing them). Pure validation lives here, framework-agnostic;
// auth/organization-hooks.ts's thin shim decides how to fail in
// better-auth's own hook protocol (throwing its APIError).

// A better-auth role string is comma-joined and may carry more than one
// role; only a single grantable role is ever valid here. Returns null
// rather than throwing — this file has no opinion on how a caller signals
// failure in its own protocol.
export function grantedRoleFrom (roleString: string): string | null {
  const roles = roleString.split(',').map(r => r.trim()).filter(Boolean)
  if (roles.length !== 1 || !GRANTABLE_ROLES.has(roles[0])) return null
  return roles[0]
}

export async function schoolWouldLoseItsLastTeacher (
  db: Db,
  organizationId: string,
  excludingMemberId: string
): Promise<boolean> {
  const remainingStaff = await db.select().from(member).where(and(
    eq(member.organizationId, organizationId),
    inArray(member.role, STAFF_ROLES),
    ne(member.id, excludingMemberId)
  ))
  return remainingStaff.length === 0
}
