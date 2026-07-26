import { FastifyInstance } from 'fastify'
import { ingestBuffer, loadRegistry, Keypair, Paths } from '@campvus/engine'
import { Db } from '../db/client'
import { requireCourseRole } from '../auth/guards'

// The direct-upload API (§5.1, §3.2): a teacher's upload IS the ingestion
// event, calling straight into the same shared-engine pipeline
// (ingestBuffer) that Mode A's watcher calls after detecting an LMS
// upload. No polling/webhook layer, because there's no external system to
// watch — Mode B owns the whole path.
export function registerManifestRoutes (
  app: FastifyInstance,
  db: Db,
  paths: Paths,
  keypair: Keypair
): void {
  app.post<{ Params: { courseId: string } }>('/courses/:courseId/manifests', async (request, reply) => {
    const { courseId } = request.params
    const teacher = await requireCourseRole(db, request, reply, courseId, ['teacher'])
    if (!teacher) return

    const file = await request.file()
    if (!file) {
      return reply.code(400).send({ error: 'a file upload is required (multipart field)' })
    }

    const buf = await file.toBuffer()
    const { manifest, deduped } = ingestBuffer({
      courseId,
      filename: file.filename,
      buf,
      keypair,
      paths
    })

    return reply.code(deduped ? 200 : 201).send({ manifest, deduped })
  })

  // What a Mode B student client syncs against — the full current
  // manifest list for a course, not just live events (§9).
  app.get<{ Params: { courseId: string } }>('/courses/:courseId/manifests', async (request, reply) => {
    const { courseId } = request.params
    const enrolled = await requireCourseRole(db, request, reply, courseId, ['teacher', 'student'])
    if (!enrolled) return

    const manifests = loadRegistry(paths).filter(m => m.courseId === courseId)
    return reply.send(manifests)
  })
}
