import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import type { AddressInfo } from 'net'
import nacl from 'tweetnacl'
import { signManifest, hashBuffer } from '../src/crypto-utils'
import { syncManifestsFromOrigin, httpManifestListFetcher } from '../src/manifest-sync'
import { ManifestFields, SignedManifest, Keypair } from '../src/types'

function makeManifest (keypair: Keypair, overrides: Partial<ManifestFields> = {}): SignedManifest {
  return signManifest({
    courseId: 'COMSCI214',
    filename: 'slides.pdf',
    hash: hashBuffer(Buffer.from('content')),
    size: 7,
    timestamp: 1,
    ...overrides
  }, keypair.secretKey)
}

function hex (publicKey: Uint8Array): string {
  return Buffer.from(publicKey).toString('hex')
}

async function withServer (
  handler: http.RequestListener,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = http.createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  try {
    const port = (server.address() as AddressInfo).port
    await fn(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

test('syncManifestsFromOrigin fetches the manifest list for the given course', async () => {
  let requestedCourseId: string | undefined

  await syncManifestsFromOrigin({
    courseId: 'COMSCI214',
    publicKeyHex: hex(nacl.sign.keyPair().publicKey),
    knownManifests: new Map(),
    localHashes: new Set(),
    fetchManifestList: async (courseId) => { requestedCourseId = courseId; return [] }
  })

  assert.equal(requestedCourseId, 'COMSCI214')
})

test('syncManifestsFromOrigin learns manifests published while offline and queues them for download', async () => {
  const keypair = nacl.sign.keyPair()
  const manifest = makeManifest(keypair)
  const knownManifests = new Map<string, SignedManifest>()

  const result = await syncManifestsFromOrigin({
    courseId: 'COMSCI214',
    publicKeyHex: hex(keypair.publicKey),
    knownManifests,
    localHashes: new Set(),
    fetchManifestList: async () => [manifest]
  })

  assert.equal(result.learned.length, 1)
  assert.equal(result.toRequest.length, 1)
  assert.equal(knownManifests.has(manifest.hash), true)
})

test('httpManifestListFetcher GETs /courses/:courseId/manifests and parses the JSON array', async () => {
  const keypair = nacl.sign.keyPair()
  const manifest = makeManifest(keypair)

  await withServer((req, res) => {
    if (req.url === '/courses/COMSCI214/manifests') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify([manifest]))
    } else {
      res.writeHead(404)
      res.end()
    }
  }, async (baseUrl) => {
    const fetcher = httpManifestListFetcher(baseUrl)
    const result = await fetcher('COMSCI214')
    assert.equal(result.length, 1)
    assert.equal(result[0].hash, manifest.hash)
  })
})

test('syncManifestsFromOrigin rejects an origin-sourced manifest with an invalid signature', async () => {
  const keypair = nacl.sign.keyPair()
  const otherKeypair = nacl.sign.keyPair()
  const manifest = makeManifest(otherKeypair)
  const knownManifests = new Map<string, SignedManifest>()

  const result = await syncManifestsFromOrigin({
    courseId: 'COMSCI214',
    publicKeyHex: hex(keypair.publicKey),
    knownManifests,
    localHashes: new Set(),
    fetchManifestList: async () => [manifest]
  })

  assert.equal(result.rejected.length, 1)
  assert.equal(knownManifests.size, 0)
})
