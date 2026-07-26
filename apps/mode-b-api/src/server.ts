import path from 'path'
import fs from 'fs'
import fastify, { FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import staticPlugin from '@fastify/static'
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

const WEB_DIST = path.join(__dirname, '..', '..', 'mode-b-web', 'dist')

export async function buildServer (deps: ServerDeps): Promise<FastifyInstance> {
  const app = fastify({ logger: false })

  await app.register(cookie)
  await app.register(multipart)

  installRequestUser(app, deps.db)

  registerAuthRoutes(app, deps.db)
  registerCourseRoutes(app, deps.db)
  registerManifestRoutes(app, deps.db, deps.paths, deps.keypair)
  registerContentRoutes(app, deps.db, deps.paths)

  // Serves apps/mode-b-web's built assets once `npm run build` has been run
  // there. In dev, use Vite's own dev server instead — it proxies API
  // calls back to this one (see mode-b-web/vite.config.ts), same-origin
  // either way. Guarded so a fresh checkout without a frontend build
  // doesn't fail to boot.
  if (fs.existsSync(WEB_DIST)) {
    await app.register(staticPlugin, { root: WEB_DIST })
  }

  return app
}
