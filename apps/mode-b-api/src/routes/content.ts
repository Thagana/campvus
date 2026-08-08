import { FastifyInstance } from 'fastify'
import { hasContent, readContent, loadRegistry, Paths } from '@campvus/engine'
import { Db } from '../db/client'
import { accessibleCourseIds, requireAuth } from '../auth/guards'

// This endpoint IS the "origin" §5.6 describes: Mode A's peer-node.ts
// --origin=<baseUrl> flag can point straight at
// `<baseUrl>/content/<hash>` and get exactly the fallback behaviour it
// already implements. Gated by course access (Teacher: every Course in
// their School; Student: Courses they hold an Enrollment in — see
// auth/guards.ts's accessibleCourseIds), not just "any valid session" — a
// hash is unguessable, but one course's content shouldn't be fetchable
// just because you're logged in as a user of a *different* course.
// Content is always addressed by a sha256 hex digest (see
// engine/crypto-utils.ts's hashBuffer) — 64 lowercase hex characters.
// Rejecting anything else before it reaches the filesystem closes off
// path traversal via this parameter (e.g. "../institution-keys.json") and
// the empty-string edge case where path.join(contentDir, '') resolves to
// contentDir itself.
const HASH_PATTERN = /^[0-9a-f]{64}$/

export function registerContentRoutes (app: FastifyInstance, db: Db, paths: Paths): string {
  app.get<{ Params: { hash: string } }>('/content/:hash', async (request, reply) => {
    const user = requireAuth(request, reply)
    if (!user) return

    const { hash } = request.params
    if (!HASH_PATTERN.test(hash)) {
      return reply.code(400).send({ error: 'hash must be a 64-character hex sha256 digest' })
    }
    if (!hasContent(paths.contentStoreDir, hash)) {
      return reply.code(404).send({ error: 'no content for this hash' })
    }

    const courseIds = await accessibleCourseIds(db, user.id)

    const manifest = loadRegistry(paths).find(m => m.hash === hash && courseIds.includes(m.courseId))
    if (!manifest) {
      return reply.code(403).send({ error: 'not enrolled in a course this content belongs to' })
    }

    const bytes = readContent(paths.contentStoreDir, hash)
    reply.header('content-type', 'application/octet-stream')
    return reply.send(bytes)
  })

  return '/content'
}
