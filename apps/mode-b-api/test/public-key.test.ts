import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp } from './helpers'

// Unauthenticated by design (see routes/public-key.ts) — a Mode A client
// needs to fetch the institution's public key before it has any session.
test('GET /public-key returns this server instance\'s institution public key hex, with no auth', async () => {
  const { app, keypair } = await createTestApp()

  const res = await app.inject({ method: 'GET', url: '/public-key' })

  assert.equal(res.statusCode, 200)
  const { publicKeyHex } = res.json()
  assert.equal(publicKeyHex, Buffer.from(keypair.publicKey).toString('hex'))
})
