import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgent } from '../src/agent'
import { FakeEngineEvents } from './fake-engine-events'

test('agent starts idle before any engine event fires', () => {
  const engine = new FakeEngineEvents()
  const agent = createAgent(engine)

  assert.equal(agent.getTrayDescription().status, 'idle')
})

test('agent transitions to syncing when the engine signals sync start', () => {
  const engine = new FakeEngineEvents()
  const agent = createAgent(engine)

  engine.emitSyncStart()

  assert.equal(agent.getTrayDescription().status, 'syncing')
})

test('agent returns to idle when the engine signals sync end', () => {
  const engine = new FakeEngineEvents()
  const agent = createAgent(engine)

  engine.emitSyncStart()
  engine.emitSyncEnd()

  assert.equal(agent.getTrayDescription().status, 'idle')
})

test('agent transitions to error when the engine signals an error', () => {
  const engine = new FakeEngineEvents()
  const agent = createAgent(engine)

  engine.emitError(new Error('boom'))

  assert.equal(agent.getTrayDescription().status, 'error')
})

test('tooltip reports the current peer count', () => {
  const engine = new FakeEngineEvents()
  const agent = createAgent(engine)

  engine.emitPeerCountChange(3)

  assert.match(agent.getTrayDescription().tooltip, /3 peers/)
})

test('tooltip reports the error message when in error state', () => {
  const engine = new FakeEngineEvents()
  const agent = createAgent(engine)

  engine.emitError(new Error('peer connection refused'))

  assert.match(agent.getTrayDescription().tooltip, /peer connection refused/)
})

test('getState reflects the same status, peer count, and error as the tray description', () => {
  const engine = new FakeEngineEvents()
  const agent = createAgent(engine)

  engine.emitSyncStart()
  engine.emitPeerCountChange(2)
  engine.emitError(new Error('boom'))

  assert.deepEqual(agent.getState(), { status: 'error', peerCount: 2, errorMessage: 'boom' })
})

test('onStateChange notifies subscribers with the latest state on every engine event', () => {
  const engine = new FakeEngineEvents()
  const agent = createAgent(engine)
  const seen: string[] = []
  agent.onStateChange((state) => { seen.push(state.status) })

  engine.emitSyncStart()
  engine.emitPeerCountChange(1)
  engine.emitSyncEnd()

  assert.deepEqual(seen, ['syncing', 'syncing', 'idle'])
})

test('onStateChange is not called before any engine event fires', () => {
  const engine = new FakeEngineEvents()
  const agent = createAgent(engine)
  let calls = 0
  agent.onStateChange(() => { calls++ })

  assert.equal(calls, 0)
})
