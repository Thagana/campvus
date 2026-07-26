import test from 'node:test'
import assert from 'node:assert/strict'
import { pickEvictions } from '../src/eviction'

test('pickEvictions returns nothing when under budget', () => {
  const files = [
    { hash: 'a', size: 100, lastAccessMs: 1 },
    { hash: 'b', size: 100, lastAccessMs: 2 }
  ]
  assert.deepEqual(pickEvictions(files, 500), [])
})

test('pickEvictions evicts oldest-last-accessed first until under budget', () => {
  const files = [
    { hash: 'oldest', size: 100, lastAccessMs: 1 },
    { hash: 'middle', size: 100, lastAccessMs: 2 },
    { hash: 'newest', size: 100, lastAccessMs: 3 }
  ]
  assert.deepEqual(pickEvictions(files, 150), ['oldest', 'middle'])
})

test('pickEvictions never evicts a newer file while an older one could be freed instead', () => {
  const files = [
    { hash: 'oldest', size: 50, lastAccessMs: 1 },
    { hash: 'newest', size: 50, lastAccessMs: 2 }
  ]
  assert.deepEqual(pickEvictions(files, 50), ['oldest'])
})

test('pickEvictions is not confused by out-of-order input', () => {
  const files = [
    { hash: 'newest', size: 10, lastAccessMs: 3 },
    { hash: 'oldest', size: 10, lastAccessMs: 1 },
    { hash: 'middle', size: 10, lastAccessMs: 2 }
  ]
  assert.deepEqual(pickEvictions(files, 10), ['oldest', 'middle'])
})
