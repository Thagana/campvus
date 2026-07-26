import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import { FastifyInstance } from 'fastify'
import { Db } from '../db/client'
import { courses, enrollments, users } from '../db/schema'
import { requireAuth, requireCourseRole } from '../auth/guards'

export function registerCourseRoutes (app: FastifyInstance, db: Db): void {
  // Creates a course; the creator becomes its teacher. No institution-admin
  // flow yet — anyone authenticated can create a course. Fine for a pilot's
  // small trusted user set; gating course creation to vetted staff is a
  // later concern.
  app.post<{ Body: { id?: string, name?: string } }>('/courses', async (request, reply) => {
    const user = requireAuth(request, reply)
    if (!user) return

    const { id, name } = request.body || {}
    if (!id || !name) {
      return reply.code(400).send({ error: 'id and name are required' })
    }

    const existing = await db.select().from(courses).where(eq(courses.id, id)).limit(1)
    if (existing[0]) {
      return reply.code(409).send({ error: 'a course with this id already exists' })
    }

    const now = Date.now()
    await db.insert(courses).values({ id, name, createdAt: now })
    await db.insert(enrollments).values({
      id: crypto.randomUUID(), userId: user.id, courseId: id, role: 'teacher', createdAt: now
    })

    return reply.code(201).send({ id, name })
  })

  app.get('/courses', async (request, reply) => {
    const user = requireAuth(request, reply)
    if (!user) return

    const rows = await db.select({ id: courses.id, name: courses.name, role: enrollments.role })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.userId, user.id))

    return reply.send(rows)
  })

  app.post<{ Params: { courseId: string }, Body: { email?: string, role?: string } }>(
    '/courses/:courseId/enrollments',
    async (request, reply) => {
      const { courseId } = request.params
      const teacher = await requireCourseRole(db, request, reply, courseId, ['teacher'])
      if (!teacher) return

      const { email, role } = request.body || {}
      if (!email || (role !== 'teacher' && role !== 'student')) {
        return reply.code(400).send({ error: 'email and role ("teacher" | "student") are required' })
      }

      const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
      const student = rows[0]
      if (!student) {
        return reply.code(404).send({ error: 'no account with this email — they must register first' })
      }

      const existing = await db.select().from(enrollments)
        .where(and(eq(enrollments.userId, student.id), eq(enrollments.courseId, courseId)))
        .limit(1)
      if (existing[0]) {
        return reply.code(409).send({ error: 'already enrolled in this course' })
      }

      await db.insert(enrollments).values({
        id: crypto.randomUUID(), userId: student.id, courseId, role, createdAt: Date.now()
      })

      return reply.code(201).send({ email, role })
    }
  )
}
