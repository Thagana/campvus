import { FastifyInstance } from 'fastify'
import { AuthBundle } from '../auth/auth'

// Mounts better-auth's own handler at /api/auth/* — sign-up/sign-in/
// sign-out/get-session/etc. all live under this one catch-all route.
// This is the documented Fastify integration pattern: Fastify has already
// parsed a JSON body into `request.body` by the time this handler runs, so
// it's re-serialized into a Fetch API `Request` for `auth.handler`.
export function registerAuthRoutes (app: FastifyInstance, { auth, fromNodeHeaders }: AuthBundle): string {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const url = new URL(request.url, `http://${request.headers.host}`)
      const headers = fromNodeHeaders(request.headers)

      const req = new Request(url, {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {})
      })

      const response = await auth.handler(req)

      reply.status(response.status)
      response.headers.forEach((value: string, key: string) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value)
      })
      const setCookies = response.headers.getSetCookie()
      if (setCookies.length > 0) reply.header('set-cookie', setCookies)

      return reply.send(response.body ? await response.text() : null)
    }
  })

  return '/api/auth/'
}
