import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
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
      if (startTime <= Date.now()) {
        return reply.code(400).send({ error: 'startTime must be in the future' })
      }

      const id = crypto.randomUUID()
      const createdAt = Date.now()
      await db.insert(liveSessions).values({ id, courseId, startTime, createdBy: teacher.userId, createdAt })

      return reply.code(201).send({ id, courseId, startTime })
    }
  )

  // Reschedule (ticket 08, .scratch/live-lesson-streaming/): same
  // future-time rule as scheduling, same School-wide Teacher access as
  // everything else on this route — not restricted to the session's
  // original creator.
  app.patch<{ Params: { courseId: string, sessionId: string }, Body: { startTime?: number } }>(
    '/courses/:courseId/sessions/:sessionId',
    async (request, reply) => {
      const { courseId, sessionId } = request.params
      const teacher = await requireCourseRole(db, request, reply, courseId, ['teacher'])
      if (!teacher) return

      const { startTime } = request.body || {}
      if (!startTime || typeof startTime !== 'number') {
        return reply.code(400).send({ error: 'startTime (epoch ms) is required' })
      }
      if (startTime <= Date.now()) {
        return reply.code(400).send({ error: 'startTime must be in the future' })
      }

      const [updated] = await db.update(liveSessions)
        .set({ startTime })
        .where(and(eq(liveSessions.id, sessionId), eq(liveSessions.courseId, courseId)))
        .returning({ id: liveSessions.id, courseId: liveSessions.courseId, startTime: liveSessions.startTime })
      if (!updated) {
        return reply.code(404).send({ error: 'session not found' })
      }

      return reply.send(updated)
    }
  )

  // Cancel (ticket 08) — hard delete, no "cancelled" status to filter out
  // downstream: a cancelled session should simply stop appearing in the
  // GET list students/teachers see.
  app.delete<{ Params: { courseId: string, sessionId: string } }>(
    '/courses/:courseId/sessions/:sessionId',
    async (request, reply) => {
      const { courseId, sessionId } = request.params
      const teacher = await requireCourseRole(db, request, reply, courseId, ['teacher'])
      if (!teacher) return

      const deleted = await db.delete(liveSessions)
        .where(and(eq(liveSessions.id, sessionId), eq(liveSessions.courseId, courseId)))
        .returning({ id: liveSessions.id })
      if (deleted.length === 0) {
        return reply.code(404).send({ error: 'session not found' })
      }

      // A JSON body, not 204 — the frontend's shared `request()` helper
      // (api.ts) always calls res.json(), same as every other route here.
      return reply.send({ id: deleted[0].id })
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
