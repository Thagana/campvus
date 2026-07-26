import fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import { Keypair, Paths } from '@campvus/engine'
import { Db } from './db/client'
import { installRequestUser } from './auth/guards'
import { registerAuthRoutes } from './routes/auth'
import { registerCourseRoutes } from './routes/courses'
import { registerManifestRoutes } from './routes/manifests'
import { registerContentRoutes } from './routes/content'

export interface ServerDeps {
  db: Db
  paths: Paths
  keypair: Keypair
}

export async function buildServer (deps: ServerDeps): Promise<FastifyInstance> {
  const app = fastify({ logger: false })

  await app.register(cookie)
  await app.register(multipart)

  installRequestUser(app, deps.db)

  registerAuthRoutes(app, deps.db)
  registerCourseRoutes(app, deps.db)
  registerManifestRoutes(app, deps.db, deps.paths, deps.keypair)
  registerContentRoutes(app, deps.db, deps.paths)

  return app
}
