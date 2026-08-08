import { eq } from 'drizzle-orm'
import { FastifyInstance } from 'fastify'
import { Db } from '../db/client'
import { organization, member, user, courses, enrollments } from '../db/schema'
import { requirePlatformAdmin } from '../auth/guards'
import { createSchool } from '../auth/create-school'
import { sendInvitationEmail } from '../email/invitation-email'

// Platform-admin-only routes (auth/platform-admin.ts's CAMPVUS_ADMIN_EMAILS
// allowlist) — replaces the old operator-only create-school.ts CLI as the
// real way a School gets created, now reachable through mode-b-web's admin
// section instead of requiring shell access to the server.
export function registerAdminRoutes (app: FastifyInstance, db: Db): string {
  app.post<{ Body: { name?: string, founderEmail?: string, slug?: string } }>('/admin/schools', async (request, reply) => {
    const admin = requirePlatformAdmin(request, reply)
    if (!admin) return

    const { name, founderEmail, slug } = request.body || {}
    if (!name || !founderEmail) {
      return reply.code(400).send({ error: 'name and founderEmail are required' })
    }

    let result
    try {
      result = await createSchool(db, { name, founderEmail, slug })
    } catch (err) {
      // slug has a UNIQUE constraint (db/client.ts) — surfaced to the admin
      // as a clean 409 rather than a raw 500 now that this is HTTP-reachable,
      // not just an operator reading a script's stack trace. Drizzle's
      // sqlite-proxy driver wraps the real node:sqlite error in a "Failed
      // query: ..." error whose own .message never mentions the constraint
      // — the actual "UNIQUE constraint failed" text is on .cause.
      const cause = err instanceof Error ? err.cause : undefined
      if (cause instanceof Error && cause.message.includes('UNIQUE constraint failed')) {
        return reply.code(409).send({ error: 'a School with this name (or slug) already exists' })
      }
      throw err
    }

    await sendInvitationEmail({
      to: founderEmail,
      schoolName: name,
      role: 'owner',
      invitationId: result.invitationId
    })

    return reply.code(201).send(result)
  })

  app.get('/admin/schools', async (request, reply) => {
    const admin = requirePlatformAdmin(request, reply)
    if (!admin) return

    const rows = await db.select({ id: organization.id, name: organization.name, slug: organization.slug })
      .from(organization)
    return reply.send(rows)
  })

  // One combined view for the admin console: every member of a School
  // (Owner/Teacher/Student, via the `member` table) plus every Course in
  // that School with its enrolled Students — the two things "who is in my
  // School" and "who is enrolled in what Course" actually need, in one
  // round trip rather than N+1 course-by-course lookups.
  app.get<{ Params: { organizationId: string } }>('/admin/schools/:organizationId/roster', async (request, reply) => {
    const admin = requirePlatformAdmin(request, reply)
    if (!admin) return

    const { organizationId } = request.params

    const members = await db.select({ userId: member.userId, email: user.email, role: member.role })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, organizationId))

    const courseRows = await db.select({ id: courses.id, name: courses.name })
      .from(courses)
      .where(eq(courses.schoolId, organizationId))

    const enrollmentRows = await db.select({ courseId: enrollments.courseId, email: user.email })
      .from(enrollments)
      .innerJoin(user, eq(enrollments.userId, user.id))
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(courses.schoolId, organizationId))

    const studentsByCourse = new Map<string, string[]>()
    for (const row of enrollmentRows) {
      const list = studentsByCourse.get(row.courseId) ?? []
      list.push(row.email)
      studentsByCourse.set(row.courseId, list)
    }

    return reply.send({
      members,
      courses: courseRows.map((c) => ({ id: c.id, name: c.name, students: studentsByCourse.get(c.id) ?? [] }))
    })
  })

  return '/admin'
}
