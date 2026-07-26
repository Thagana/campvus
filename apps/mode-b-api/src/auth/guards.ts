// Request-level auth/authorization guards. `installRequestUser` wires the
// session cookie -> `request.user` on every request; `requireAuth` and
// `requireCourseRole` are called at the top of route handlers to enforce
// the two things Mode B routes actually need: "is anyone logged in" and
// "is this specific user a teacher/student of this specific course."
// Enrollment is per-course (§3.2 — a person can be a teacher in one course
// and a student in another), so role checks always take a courseId.

import { and, eq } from 'drizzle-orm'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Db } from '../db/client'
import { enrollments } from '../db/schema'
import { getSessionUser, SessionUser, SESSION_COOKIE_NAME } from './session'

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null
  }
}

export function installRequestUser (app: FastifyInstance, db: Db): void {
  app.decorateRequest('user', null)
  app.addHook('onRequest', async (request) => {
    const sessionId = request.cookies[SESSION_COOKIE_NAME]
    request.user = sessionId ? await getSessionUser(db, sessionId) : null
  })
}

export function requireAuth (request: FastifyRequest, reply: FastifyReply): SessionUser | null {
  if (!request.user) {
    reply.code(401).send({ error: 'authentication required' })
    return null
  }
  return request.user
}

export interface CourseMembership {
  userId: string
  role: string
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

  const rows = await db.select().from(enrollments)
    .where(and(eq(enrollments.userId, user.id), eq(enrollments.courseId, courseId)))
    .limit(1)

  const enrollment = rows[0]
  if (!enrollment || !allowedRoles.includes(enrollment.role)) {
    reply.code(403).send({ error: 'not enrolled with sufficient permissions for this course' })
    return null
  }
  return { userId: user.id, role: enrollment.role }
}
