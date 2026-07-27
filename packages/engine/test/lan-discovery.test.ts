import test from 'node:test'
import assert from 'node:assert/strict'
import { isRelevantLanPeer, shouldInitiateLanConnection } from '../src/lan-discovery'

test('isRelevantLanPeer accepts a peer advertising the same topic with a different id', () => {
  assert.equal(isRelevantLanPeer({ topic: 'abc', id: 'peer-1' }, 'abc', 'self-id'), true)
})

test('isRelevantLanPeer rejects our own advertisement (same id)', () => {
  assert.equal(isRelevantLanPeer({ topic: 'abc', id: 'self-id' }, 'abc', 'self-id'), false)
})

test('isRelevantLanPeer rejects a peer advertising a different course topic', () => {
  assert.equal(isRelevantLanPeer({ topic: 'different-course', id: 'peer-1' }, 'abc', 'self-id'), false)
})

test('isRelevantLanPeer rejects a service with no txt record at all', () => {
  assert.equal(isRelevantLanPeer(undefined, 'abc', 'self-id'), false)
})

test('shouldInitiateLanConnection: exactly one side of a pair initiates', () => {
  assert.equal(shouldInitiateLanConnection('aaa', 'bbb'), true)
  assert.equal(shouldInitiateLanConnection('bbb', 'aaa'), false)
})
