import { eq } from 'drizzle-orm'
import { FastifyInstance } from 'fastify'
import { Db } from '../db/client'
import { organization } from '../db/schema'
import { requireSchoolRole, STAFF_ROLES } from '../auth/guards'

// A signed-in user's own School membership. Exists so mode-b-web can learn
// its organizationId before calling better-auth's own
// /api/auth/organization/invite-member — that endpoint requires
// organizationId in its payload (see auth/organization-hooks.ts, test/
// invites.test.ts), and until now nothing exposed it to the browser. A
// person belongs to at most one School (ADR-0005), so this is a single
// object, not a list.
export function registerSchoolRoutes (app: FastifyInstance, db: Db): string {
  app.get('/school', async (request, reply) => {
    const membership = await requireSchoolRole(db, request, reply, [...STAFF_ROLES, 'student'])
    if (!membership) return

    const rows = await db.select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, membership.organizationId))
      .limit(1)

    return reply.send({
      organizationId: membership.organizationId,
      name: rows[0]?.name ?? '',
      role: membership.role
    })
  })

  return '/school'
}
