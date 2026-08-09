import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { FastifyInstance } from 'fastify'
import { Db } from '../db/client'
import { liveSessions } from '../db/schema'
import { requireCourseRole } from '../auth/guards'

// Session scheduling only (ADR-0007, .scratch/live-lesson-streaming/spec.md
// ticket 06): a Teacher sets a start time on a Course, no ad-hoc "go live
// now with no notice" and no push-notification backend — a connected
// student's client learns a session is live from the swarm-topic
// announcement itself (@campvus/engine's startLiveSession), not from this
// API. This endpoint exists purely so students know *when* to be
// connected, and access control matches the existing course-file model
// exactly (ticket 05): any Teacher can schedule for any Course in their
// School, only enrolled Students can see the schedule.
export function registerSessionRoutes (app: FastifyInstance, db: Db): string {
  app.post<{ Params: { courseId: string }, Body: { startTime?: number } }>(
    '/courses/:courseId/sessions',
    async (request, reply) => {
      const { courseId } = request.params
      const teacher = await requireCourseRole(db, request, reply, courseId, ['teacher'])
      if (!teacher) return

      const { startTime } = request.body || {}
      if (!startTime || typeof startTime !== 'number') {
        return reply.code(400).send({ error: 'startTime (epoch ms) is required' })
      }

      const id = crypto.randomUUID()
      const createdAt = Date.now()
      await db.insert(liveSessions).values({ id, courseId, startTime, createdBy: teacher.userId, createdAt })

      return reply.code(201).send({ id, courseId, startTime })
    }
  )

  // What a student's client checks to know when to be connected — same
  // shape as manifests.ts's GET, both teacher- and student-accessible.
  app.get<{ Params: { courseId: string } }>('/courses/:courseId/sessions', async (request, reply) => {
    const { courseId } = request.params
    const member = await requireCourseRole(db, request, reply, courseId, ['teacher', 'student'])
    if (!member) return

    const rows = await db.select({
      id: liveSessions.id,
      courseId: liveSessions.courseId,
      startTime: liveSessions.startTime
    }).from(liveSessions).where(eq(liveSessions.courseId, courseId))

    return reply.send(rows)
  })

  // Same '/courses/...' namespace routes/courses.ts and routes/manifests.ts
  // register under — server.ts's apiPrefixes list is a Set, so repeating
  // the prefix here is fine.
  return '/courses'
}
