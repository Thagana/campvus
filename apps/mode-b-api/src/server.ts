import path from 'path'
import fs from 'fs'
import fastify, { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import staticPlugin from '@fastify/static'
import { Keypair, Paths } from '@campvus/engine'
import { Db } from './db/client'
import { createAuth } from './auth/auth'
import { installRequestUser } from './auth/guards'
import { registerAuthRoutes } from './routes/auth'
import { registerCourseRoutes } from './routes/courses'
import { registerSchoolRoutes } from './routes/school'
import { registerManifestRoutes } from './routes/manifests'
import { registerSessionRoutes } from './routes/sessions'
import { registerLiveSigningRoutes } from './routes/live-signing'
import { registerContentRoutes } from './routes/content'
import { registerAdminRoutes } from './routes/admin'
import { registerPublicKeyRoutes } from './routes/public-key'

export interface ServerDeps {
  db: Db
  paths: Paths
  keypair: Keypair
  authSecret: string
}

const WEB_DIST = path.join(__dirname, '..', '..', 'mode-b-web', 'dist')

export async function buildServer (deps: ServerDeps): Promise<FastifyInstance> {
  // trustProxy: this sits behind Fly's edge proxy (TLS terminates there,
  // plain HTTP internally) — without it req.ip/req.protocol would reflect
  // the proxy hop, not the real client.
  const app = fastify({ logger: false, trustProxy: true })

  // Unauthenticated by design — Fly's http_service health check polls this.
  app.get('/healthz', async () => ({ ok: true }))

  await app.register(multipart)

  const auth = await createAuth(deps.db, deps.authSecret)

  installRequestUser(app, auth)

  // Each register*Routes call hands back the path prefix it just claimed —
  // the SPA fallback below reads that list instead of a second,
  // hand-maintained copy that can drift out of sync with what's actually
  // registered (as happened the moment routes/school.ts was added without
  // updating a separate literal array here).
  const apiPrefixes = [
    registerAuthRoutes(app, auth),
    registerCourseRoutes(app, deps.db),
    registerSchoolRoutes(app, deps.db),
    registerManifestRoutes(app, deps.db, deps.paths, deps.keypair),
    registerSessionRoutes(app, deps.db),
    registerLiveSigningRoutes(app, deps.db, deps.keypair),
    registerContentRoutes(app, deps.db, deps.paths),
    registerAdminRoutes(app, deps.db),
    registerPublicKeyRoutes(app, deps.keypair),
    '/healthz'
  ]

  // Serves apps/mode-b-web's built assets once `npm run build` has been run
  // there. In dev, use Vite's own dev server instead — it proxies API
  // calls back to this one (see mode-b-web/vite.config.ts), same-origin
  // either way. Guarded so a fresh checkout without a frontend build
  // doesn't fail to boot.
  if (fs.existsSync(WEB_DIST)) {
    await app.register(staticPlugin, { root: WEB_DIST })

    // The marketing page (public/landing.html, built as a plain static
    // file — no React) owns the bare root instead of the SPA's index.html.
    // Registered as an explicit route so it wins over @fastify/static's own
    // default "serve index.html for /" behavior; the teacher app itself
    // lives at /login and beyond, reached via the landing page's CTAs.
    app.get('/', (request, reply) => reply.sendFile('landing.html'))

    // mode-b-web has no server-rendered routing — every real page (e.g.
    // /accept-invite) is client-side only. @fastify/static above only ever
    // serves an actual file on disk, so a fresh browser navigation straight
    // to /accept-invite (not a client-side transition) 404s without this:
    // fall back to index.html for any GET that isn't under a known API
    // prefix, letting the SPA's own routing take over from there.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !apiPrefixes.some((prefix) => request.url.startsWith(prefix))) {
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({ error: 'not found' })
    })
  }

  return app
}
