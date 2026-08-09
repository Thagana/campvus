import { FastifyInstance } from 'fastify'
import { Keypair, signSessionStart, signLiveSegment, SignedSessionStart, SignedLiveSegment } from '@campvus/engine'
import { Db } from '../db/client'
import { requireCourseRole } from '../auth/guards'

type SignRequestBody =
  | { kind: 'session-start', sessionId?: string, startedAt?: number }
  | { kind: 'segment', sessionId?: string, seq?: number, hash?: string, size?: number, timestamp?: number }

// The signing-proxy endpoint ADR-0007's desktop-client design needs: per
// docs/ARCHITECTURE.md §13.1, the institution secret key lives only here,
// on apps/mode-b-api — a desktop client (apps/mode-a-desktop) never holds
// it, matching this project's existing KMS philosophy for manifest signing
// (§5.2, "the ingestion adapter calls KMS to sign; it never holds raw key
// material in memory"). A teacher's desktop client hashes a live segment
// locally, sends only the *fields* here (never the raw media bytes — those
// go straight over the swarm, this endpoint is a stateless crypto call),
// gets a signature back, and floods the resulting signed object itself via
// @campvus/engine's announceSignedSession/relaySignedSegment.
//
// courseId is always taken from the URL param, never the body — same
// "never client-supplied" principle as courses.schoolId (routes/courses.ts)
// and ingestBuffer's courseId (routes/manifests.ts): a Teacher could
// otherwise get a validly-signed session/segment stamped into a course
// they don't teach.
export function registerLiveSigningRoutes (app: FastifyInstance, db: Db, keypair: Keypair): string {
  app.post<{ Params: { courseId: string }, Body: SignRequestBody }>(
    '/courses/:courseId/live-signatures',
    async (request, reply) => {
      const { courseId } = request.params
      const teacher = await requireCourseRole(db, request, reply, courseId, ['teacher'])
      if (!teacher) return

      const body = request.body
      if (!body || (body.kind !== 'session-start' && body.kind !== 'segment')) {
        return reply.code(400).send({ error: 'kind must be "session-start" or "segment"' })
      }

      if (body.kind === 'session-start') {
        if (!body.sessionId || typeof body.startedAt !== 'number') {
          return reply.code(400).send({ error: 'sessionId and startedAt (epoch ms) are required' })
        }
        const signed: SignedSessionStart = signSessionStart(
          { sessionId: body.sessionId, courseId, startedAt: body.startedAt },
          keypair.secretKey
        )
        return reply.send(signed)
      }

      const { sessionId, seq, hash, size, timestamp } = body
      if (!sessionId || typeof seq !== 'number' || !hash || typeof size !== 'number' || typeof timestamp !== 'number') {
        return reply.code(400).send({ error: 'sessionId, seq, hash, size, and timestamp are required' })
      }
      const signed: SignedLiveSegment = signLiveSegment(
        { sessionId, courseId, seq, hash, size, timestamp },
        keypair.secretKey
      )
      return reply.send(signed)
    }
  )

  return '/courses'
}
