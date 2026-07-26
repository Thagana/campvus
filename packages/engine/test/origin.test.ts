import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import type { AddressInfo } from 'net'
import { httpOriginFetcher, scheduleOriginFallback, OriginFallbackFailureReason } from '../src/origin'
import { hashBuffer } from '../src/crypto-utils'
import { SignedManifest } from '../src/types'

function makeManifest (hash: string): SignedManifest {
  return {
    courseId: 'COMSCI214',
    filename: 'slides.pdf',
    hash,
    size: 7,
    timestamp: 1,
    signature: 'irrelevant-for-origin-tests'
  }
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

test('httpOriginFetcher fetches bytes by hash from the configured base URL', async () => {
  const bytes = Buffer.from('origin content')
  const hash = hashBuffer(bytes)

  await withServer((req, res) => {
    if (req.url === `/${hash}`) {
      res.writeHead(200)
      res.end(bytes)
    } else {
      res.writeHead(404)
      res.end()
    }
  }, async (baseUrl) => {
    const fetcher = httpOriginFetcher(baseUrl)
    const result = await fetcher(makeManifest(hash))
    assert.ok(result)
    assert.ok(result?.equals(bytes))
  })
})

test('httpOriginFetcher returns null on a 404 (origin does not have it either)', async () => {
  await withServer((_req, res) => {
    res.writeHead(404)
    res.end()
  }, async (baseUrl) => {
    const fetcher = httpOriginFetcher(baseUrl)
    const result = await fetcher(makeManifest('deadbeef'))
    assert.equal(result, null)
  })
})

test('scheduleOriginFallback fetches from origin after the timeout if content never arrives locally', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const bytes = Buffer.from('content')
  const hash = hashBuffer(bytes)
  const manifest = makeManifest(hash)
  const localHashes = new Set<string>()

  let succeeded: Buffer | undefined
  scheduleOriginFallback(manifest, {
    hasLocally: (h) => localHashes.has(h),
    fetchFromOrigin: async () => bytes,
    timeoutMs: 5000,
    onSuccess: (_m, b) => { succeeded = b },
    onFailure: () => { throw new Error('should not fail') }
  }, new Set())

  t.mock.timers.tick(5000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.ok(succeeded?.equals(bytes))
})

test('scheduleOriginFallback skips the fetch if content arrived locally before the timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const hash = 'somehash'
  const manifest = makeManifest(hash)
  let fetchCalled = false
  const localHashes = new Set([hash])

  scheduleOriginFallback(manifest, {
    hasLocally: (h) => localHashes.has(h),
    fetchFromOrigin: async () => { fetchCalled = true; return Buffer.from('x') },
    timeoutMs: 5000,
    onSuccess: () => { throw new Error('should not succeed') },
    onFailure: () => { throw new Error('should not fail') }
  }, new Set())

  t.mock.timers.tick(5000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(fetchCalled, false)
})

test('scheduleOriginFallback reports a hash mismatch as a failure, does not accept the bytes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const manifest = makeManifest('expected-hash-that-will-not-match')
  let failureReason: OriginFallbackFailureReason | undefined

  scheduleOriginFallback(manifest, {
    hasLocally: () => false,
    fetchFromOrigin: async () => Buffer.from('wrong content'),
    timeoutMs: 1000,
    onSuccess: () => { throw new Error('should not succeed') },
    onFailure: (_m, reason) => { failureReason = reason }
  }, new Set())

  t.mock.timers.tick(1000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(failureReason, 'origin-hash-mismatch')
})

test('scheduleOriginFallback reports origin-miss when the origin has nothing for this hash', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const manifest = makeManifest('some-hash')
  let failureReason: OriginFallbackFailureReason | undefined

  scheduleOriginFallback(manifest, {
    hasLocally: () => false,
    fetchFromOrigin: async () => null,
    timeoutMs: 1000,
    onSuccess: () => { throw new Error('should not succeed') },
    onFailure: (_m, reason) => { failureReason = reason }
  }, new Set())

  t.mock.timers.tick(1000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(failureReason, 'origin-miss')
})

test('scheduleOriginFallback only schedules once per hash', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const manifest = makeManifest('h1')
  let callCount = 0
  const scheduled = new Set<string>()
  const deps = {
    hasLocally: () => false,
    fetchFromOrigin: async () => { callCount++; return Buffer.from('x') },
    timeoutMs: 1000,
    onSuccess: () => {},
    onFailure: () => {}
  }

  scheduleOriginFallback(manifest, deps, scheduled)
  scheduleOriginFallback(manifest, deps, scheduled)

  t.mock.timers.tick(1000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(callCount, 1)
})
