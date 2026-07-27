import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import { FastifyInstance } from 'fastify'
import { Db } from '../db/client'
import { courses, enrollments, user } from '../db/schema'
import { getSchoolMembership, requireSchoolRole } from '../auth/guards'
import { STAFF_ROLES } from '../auth/school-roles'

export function registerCourseRoutes (app: FastifyInstance, db: Db): void {
  // schoolId is always the creating Teacher's own School — never a
  // client-supplied field (ADR-0005), so a Teacher can't stamp a Course
  // into a School they don't belong to.
  app.post<{ Body: { id?: string, name?: string } }>('/courses', async (request, reply) => {
    const teacher = await requireSchoolRole(db, request, reply, STAFF_ROLES)
    if (!teacher) return

    const { id, name } = request.body || {}
    if (!id || !name) {
      return reply.code(400).send({ error: 'id and name are required' })
    }

    const existing = await db.select().from(courses).where(eq(courses.id, id)).limit(1)
    if (existing[0]) {
      return reply.code(409).send({ error: 'a course with this id already exists' })
    }

    await db.insert(courses).values({ id, schoolId: teacher.organizationId, name, createdAt: Date.now() })

    return reply.code(201).send({ id, name })
  })

  // A Teacher sees every Course in their School (no per-course row needed);
  // a Student sees only Courses they hold an Enrollment in.
  app.get('/courses', async (request, reply) => {
    const membership = await requireSchoolRole(db, request, reply, [...STAFF_ROLES, 'student'])
    if (!membership) return

    if (STAFF_ROLES.includes(membership.role)) {
      const rows = await db.select({ id: courses.id, name: courses.name })
        .from(courses)
        .where(eq(courses.schoolId, membership.organizationId))
      return reply.send(rows.map(r => ({ ...r, role: 'teacher' })))
    }

    const rows = await db.select({ id: courses.id, name: courses.name, role: enrollments.role })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.userId, membership.userId))

    return reply.send(rows)
  })

  // Enrolls a School member as a Student in one specific Course. The
  // target must already belong to the same School as the Course (joining
  // the School itself happens via invitation — see auth/organization-hooks.ts
  // — not through this endpoint), distinctly from having no account at all.
  app.post<{ Params: { courseId: string }, Body: { email?: string } }>(
    '/courses/:courseId/enrollments',
    async (request, reply) => {
      const { courseId } = request.params
      const teacher = await requireSchoolRole(db, request, reply, STAFF_ROLES)
      if (!teacher) return

      const { email } = request.body || {}
      if (!email) {
        return reply.code(400).send({ error: 'email is required' })
      }

      const courseRows = await db.select().from(courses)
        .where(and(eq(courses.id, courseId), eq(courses.schoolId, teacher.organizationId)))
        .limit(1)
      if (!courseRows[0]) {
        return reply.code(404).send({ error: 'no course with this id in your School' })
      }

      const userRows = await db.select().from(user).where(eq(user.email, email)).limit(1)
      const student = userRows[0]
      if (!student) {
        return reply.code(404).send({ error: 'no account with this email — they must register first' })
      }

      const studentMembership = await getSchoolMembership(db, student.id)
      if (!studentMembership || studentMembership.organizationId !== teacher.organizationId) {
        return reply.code(403).send({ error: 'this account is not a member of your School' })
      }

      const existing = await db.select().from(enrollments)
        .where(and(eq(enrollments.userId, student.id), eq(enrollments.courseId, courseId)))
        .limit(1)
      if (existing[0]) {
        return reply.code(409).send({ error: 'already enrolled in this course' })
      }

      await db.insert(enrollments).values({
        id: crypto.randomUUID(), userId: student.id, courseId, role: 'student', createdAt: Date.now()
      })

      return reply.code(201).send({ email, role: 'student' })
    }
  )
}
