import test from 'node:test'
import assert from 'node:assert/strict'
import { describeState } from '../src/status-view'
import type { AppState } from '../src/preload-api'

const baseState: AppState = {
  status: 'idle',
  peerCount: 0,
  seedingAllowed: true
}

test('idle state with no peers', () => {
  const view = describeState(baseState)

  assert.equal(view.statusLabel, 'Idle')
  assert.equal(view.statusDetail, '0 peers connected')
  assert.equal(view.peerCountLabel, '0')
  assert.equal(view.errorMessage, undefined)
})

test('singular peer count reads "1 peer"', () => {
  const view = describeState({ ...baseState, peerCount: 1 })

  assert.equal(view.statusDetail, '1 peer connected')
})

test('syncing state reports peer count as the detail', () => {
  const view = describeState({ ...baseState, status: 'syncing', peerCount: 3 })

  assert.equal(view.statusLabel, 'Syncing')
  assert.equal(view.statusDetail, '3 peers connected')
})

test('error state surfaces the error message as the detail and errorMessage', () => {
  const view = describeState({ ...baseState, status: 'error', errorMessage: 'peer connection refused' })

  assert.equal(view.statusLabel, 'Error')
  assert.equal(view.statusDetail, 'peer connection refused')
  assert.equal(view.errorMessage, 'peer connection refused')
})

test('error state without a message falls back to a generic detail', () => {
  const view = describeState({ ...baseState, status: 'error' })

  assert.equal(view.statusDetail, 'Something went wrong')
})

test('seeding allowed is labeled "Allowed"', () => {
  const view = describeState({ ...baseState, seedingAllowed: true })

  assert.equal(view.seedingLabel, 'Allowed')
})

test('seeding disallowed is labeled with the metered-connection reason', () => {
  const view = describeState({ ...baseState, seedingAllowed: false })

  assert.equal(view.seedingLabel, 'Paused (metered connection)')
})
