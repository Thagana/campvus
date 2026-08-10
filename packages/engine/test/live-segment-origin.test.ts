import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import type { AddressInfo } from 'net'
import { scheduleSegmentOriginFallback, httpSegmentOriginFetcher, SegmentOriginFallbackFailureReason } from '../src/live-segment-origin'
import { hashBuffer } from '../src/crypto-utils'
import { SignedLiveSegment } from '../src/types'

function makeSegment (overrides: Partial<SignedLiveSegment> = {}): SignedLiveSegment {
  return {
    sessionId: 'session-1',
    courseId: 'COMSCI214',
    seq: 3,
    hash: hashBuffer(Buffer.from('segment-bytes')),
    size: 13,
    timestamp: 1,
    signature: 'irrelevant-for-origin-tests',
    ...overrides
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

test('httpSegmentOriginFetcher fetches and base64-decodes a segment by sessionId/seq', async () => {
  const bytes = Buffer.from('segment-bytes')
  const segment = makeSegment({ hash: hashBuffer(bytes) })

  await withServer((req, res) => {
    if (req.url === '/live-segments/session-1/3') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ segment, content: bytes.toString('base64') }))
    } else {
      res.writeHead(404)
      res.end()
    }
  }, async (baseUrl) => {
    const fetcher = httpSegmentOriginFetcher(baseUrl)
    const result = await fetcher('session-1', 3)
    assert.ok(result)
    assert.deepEqual(result?.segment, segment)
    assert.ok(result?.bytes.equals(bytes))
  })
})

test('httpSegmentOriginFetcher sends provided headers (e.g. an Authorization bearer token)', async () => {
  const bytes = Buffer.from('segment-bytes')
  const segment = makeSegment({ hash: hashBuffer(bytes) })
  let receivedAuth: string | undefined

  await withServer((req, res) => {
    receivedAuth = req.headers.authorization
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ segment, content: bytes.toString('base64') }))
  }, async (baseUrl) => {
    const fetcher = httpSegmentOriginFetcher(baseUrl, { Authorization: 'Bearer test-token' })
    await fetcher('session-1', 3)
  })

  assert.equal(receivedAuth, 'Bearer test-token')
})

test('httpSegmentOriginFetcher returns null on a non-2xx response', async () => {
  await withServer((_req, res) => {
    res.writeHead(404)
    res.end()
  }, async (baseUrl) => {
    const fetcher = httpSegmentOriginFetcher(baseUrl)
    const result = await fetcher('session-1', 3)
    assert.equal(result, null)
  })
})

test('scheduleSegmentOriginFallback fetches the missing segment from origin after the timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const bytes = Buffer.from('segment-bytes')
  const segment = makeSegment({ hash: hashBuffer(bytes) })

  let succeeded: Buffer | undefined
  scheduleSegmentOriginFallback('session-1', 3, {
    hasLocally: () => false,
    fetchFromOrigin: async () => ({ segment, bytes }),
    timeoutMs: 5000,
    onSuccess: (_s, b) => { succeeded = b },
    onFailure: () => { throw new Error('should not fail') }
  }, new Set())

  t.mock.timers.tick(5000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.ok(succeeded?.equals(bytes))
})

test('scheduleSegmentOriginFallback skips the fetch if the segment arrived locally before the timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let fetchCalled = false

  scheduleSegmentOriginFallback('session-1', 3, {
    hasLocally: () => true,
    fetchFromOrigin: async () => { fetchCalled = true; return null },
    timeoutMs: 5000,
    onSuccess: () => { throw new Error('should not succeed') },
    onFailure: () => { throw new Error('should not fail') }
  }, new Set())

  t.mock.timers.tick(5000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(fetchCalled, false)
})

test('scheduleSegmentOriginFallback reports a hash mismatch as a failure, does not accept the bytes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const segment = makeSegment({ hash: 'expected-hash-that-will-not-match' })
  let failureReason: SegmentOriginFallbackFailureReason | undefined

  scheduleSegmentOriginFallback('session-1', 3, {
    hasLocally: () => false,
    fetchFromOrigin: async () => ({ segment, bytes: Buffer.from('wrong content') }),
    timeoutMs: 1000,
    onSuccess: () => { throw new Error('should not succeed') },
    onFailure: (_sid, _seq, reason) => { failureReason = reason }
  }, new Set())

  t.mock.timers.tick(1000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(failureReason, 'origin-hash-mismatch')
})

test('scheduleSegmentOriginFallback reports origin-miss when the origin has nothing for this segment', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let failureReason: SegmentOriginFallbackFailureReason | undefined

  scheduleSegmentOriginFallback('session-1', 3, {
    hasLocally: () => false,
    fetchFromOrigin: async () => null,
    timeoutMs: 1000,
    onSuccess: () => { throw new Error('should not succeed') },
    onFailure: (_sid, _seq, reason) => { failureReason = reason }
  }, new Set())

  t.mock.timers.tick(1000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(failureReason, 'origin-miss')
})

test('scheduleSegmentOriginFallback only schedules once per sessionId+seq', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let callCount = 0
  const scheduled = new Set<string>()
  const deps = {
    hasLocally: () => false,
    fetchFromOrigin: async () => { callCount++; return null },
    timeoutMs: 1000,
    onSuccess: () => {},
    onFailure: () => {}
  }

  scheduleSegmentOriginFallback('session-1', 3, deps, scheduled)
  scheduleSegmentOriginFallback('session-1', 3, deps, scheduled)

  t.mock.timers.tick(1000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(callCount, 1)
})

test('scheduleSegmentOriginFallback treats different sequence numbers in the same session independently', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let callCount = 0
  const scheduled = new Set<string>()
  const deps = {
    hasLocally: () => false,
    fetchFromOrigin: async () => { callCount++; return null },
    timeoutMs: 1000,
    onSuccess: () => {},
    onFailure: () => {}
  }

  scheduleSegmentOriginFallback('session-1', 3, deps, scheduled)
  scheduleSegmentOriginFallback('session-1', 4, deps, scheduled)

  t.mock.timers.tick(1000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(callCount, 2)
})
