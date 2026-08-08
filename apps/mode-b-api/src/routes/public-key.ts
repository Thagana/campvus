import { FastifyInstance } from 'fastify'
import { Keypair } from '@campvus/engine'

// Deliberately unauthenticated (§5.2, docs/ARCHITECTURE.md: "every student
// app/agent is provisioned with the institution's public key ... fetched
// once out-of-band") — the key is what the trust model is built on, not a
// secret; a Mode A client (apps/mode-a-desktop's Settings-panel login flow)
// needs to fetch it before it has any session to authenticate with.
export function registerPublicKeyRoutes (app: FastifyInstance, keypair: Keypair): string {
  app.get('/public-key', async () => {
    return { publicKeyHex: Buffer.from(keypair.publicKey).toString('hex') }
  })

  return '/public-key'
}
