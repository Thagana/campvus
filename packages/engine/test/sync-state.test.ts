import test from 'node:test'
import assert from 'node:assert/strict'
import { createSyncStateTracker } from '../src/sync-state'

test('peerConnected and peerDisconnected report a running count', () => {
  const tracker = createSyncStateTracker()
  const seen: number[] = []
  tracker.onPeerCountChange((count) => seen.push(count))

  tracker.peerConnected()
  tracker.peerConnected()
  tracker.peerDisconnected()

  assert.deepEqual(seen, [1, 2, 1])
  assert.equal(tracker.peerCount(), 1)
})

test('markMissing fires onSyncStart only on the first outstanding hash', () => {
  const tracker = createSyncStateTracker()
  let starts = 0
  tracker.onSyncStart(() => { starts++ })

  tracker.markMissing('a')
  tracker.markMissing('b')

  assert.equal(starts, 1)
})

test('markObtained fires onSyncEnd only once the last outstanding hash clears', () => {
  const tracker = createSyncStateTracker()
  let ends = 0
  tracker.onSyncEnd(() => { ends++ })

  tracker.markMissing('a')
  tracker.markMissing('b')
  tracker.markObtained('a')
  assert.equal(ends, 0)

  tracker.markObtained('b')
  assert.equal(ends, 1)
})

test('markMissing is idempotent for a hash already tracked as missing', () => {
  const tracker = createSyncStateTracker()
  let starts = 0
  tracker.onSyncStart(() => { starts++ })

  tracker.markMissing('a')
  tracker.markMissing('a')

  assert.equal(starts, 1)
})

test('markObtained is a no-op for a hash that was never marked missing', () => {
  const tracker = createSyncStateTracker()
  let ends = 0
  tracker.onSyncEnd(() => { ends++ })

  tracker.markObtained('never-missing')

  assert.equal(ends, 0)
})

test('a fresh sync can start again after a previous one ends', () => {
  const tracker = createSyncStateTracker()
  const starts: number[] = []
  let count = 0
  tracker.onSyncStart(() => { starts.push(++count) })

  tracker.markMissing('a')
  tracker.markObtained('a')
  tracker.markMissing('b')

  assert.deepEqual(starts, [1, 2])
})
