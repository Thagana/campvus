import { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import { hashBuffer, verifyLiveSegment, writeContent, hasContent, readContent, Keypair, Paths, SignedLiveSegment } from '@campvus/engine'
import { Db } from '../db/client'
import { liveSegments } from '../db/schema'
import { requireAuth, requireCourseRole, accessibleCourseIds } from '../auth/guards'

// Backstop persistence for live segments (ADR-0007, docs/ARCHITECTURE.md
// §13.3): routes/live-signing.ts is a deliberately stateless signing proxy
// that never sees raw bytes — the teacher's client relays those straight
// over the swarm. That means the swarm is the *only* delivery path unless
// something also stores a segment's bytes somewhere an HTTP fallback can
// serve them from. This route pair is that something: POST persists what
// the teacher's client already signed (called fire-and-forget, after the
// swarm relay, from apps/mode-a-desktop's main.ts — never blocking the
// primary relay path on this call succeeding), GET is what
// packages/engine's httpSegmentOriginFetcher calls when a peer's own
// swarm-delivery attempt times out.
export function registerLiveSegmentRoutes (app: FastifyInstance, db: Db, paths: Paths, keypair: Keypair): string {
  app.post<{ Params: { courseId: string }, Body: { segment?: SignedLiveSegment, content?: string } }>(
    '/courses/:courseId/live-segments',
    async (request, reply) => {
      const { courseId } = request.params
      const teacher = await requireCourseRole(db, request, reply, courseId, ['teacher'])
      if (!teacher) return

      const { segment, content } = request.body || {}
      if (!segment || typeof content !== 'string') {
        return reply.code(400).send({ error: 'segment and content (base64) are required' })
      }
      if (segment.courseId !== courseId) {
        return reply.code(400).send({ error: 'segment.courseId does not match the URL course' })
      }

      const bytes = Buffer.from(content, 'base64')
      if (hashBuffer(bytes) !== segment.hash) {
        return reply.code(400).send({ error: 'content does not match segment.hash' })
      }
      if (!verifyLiveSegment(segment, keypair.publicKey)) {
        return reply.code(400).send({ error: 'invalid segment signature' })
      }

      const existing = await db.select().from(liveSegments)
        .where(and(eq(liveSegments.sessionId, segment.sessionId), eq(liveSegments.seq, segment.seq)))
        .limit(1)
      if (existing[0]) {
        return existing[0].hash === segment.hash
          ? reply.code(200).send({ stored: true })
          : reply.code(409).send({ error: 'a different segment was already stored for this sessionId+seq' })
      }

      writeContent(paths.contentStoreDir, segment.hash, bytes)
      await db.insert(liveSegments).values({
        id: crypto.randomUUID(),
        sessionId: segment.sessionId,
        courseId,
        seq: segment.seq,
        hash: segment.hash,
        size: segment.size,
        timestamp: segment.timestamp,
        signature: segment.signature,
        createdAt: Date.now()
      })

      return reply.code(201).send({ stored: true })
    }
  )

  // No :courseId in the path — SegmentOriginFetcher's signature is fixed to
  // (sessionId, seq); access is checked against the row's own courseId
  // after lookup, same reasoning as content.ts's top-level /content/:hash.
  app.get<{ Params: { sessionId: string, seq: string } }>('/live-segments/:sessionId/:seq', async (request, reply) => {
    const user = requireAuth(request, reply)
    if (!user) return

    const seq = Number(request.params.seq)
    if (!Number.isInteger(seq) || seq < 0) {
      return reply.code(400).send({ error: 'seq must be a non-negative integer' })
    }

    const rows = await db.select().from(liveSegments)
      .where(and(eq(liveSegments.sessionId, request.params.sessionId), eq(liveSegments.seq, seq)))
      .limit(1)
    const row = rows[0]
    if (!row || !hasContent(paths.contentStoreDir, row.hash)) {
      return reply.code(404).send({ error: 'no segment for this session/seq' })
    }

    const courseIds = await accessibleCourseIds(db, user.id)
    if (!courseIds.includes(row.courseId)) {
      return reply.code(403).send({ error: 'not enrolled in a course this segment belongs to' })
    }

    const bytes = readContent(paths.contentStoreDir, row.hash)
    return reply.send({
      segment: {
        sessionId: row.sessionId, courseId: row.courseId, seq: row.seq,
        hash: row.hash, size: row.size, timestamp: row.timestamp, signature: row.signature
      } satisfies SignedLiveSegment,
      content: bytes.toString('base64')
    })
  })

  return '/courses'
}
