import test from 'node:test'
import assert from 'node:assert/strict'
import { alwaysAllowSeeding, fixedSeedingPolicy, networkAwareSeedingPolicy } from '../src/seeding-policy'

test('alwaysAllowSeeding always allows seeding', () => {
  assert.equal(alwaysAllowSeeding().isSeedingAllowed(), true)
})

test('fixedSeedingPolicy returns whatever it was fixed to', () => {
  assert.equal(fixedSeedingPolicy(true).isSeedingAllowed(), true)
  assert.equal(fixedSeedingPolicy(false).isSeedingAllowed(), false)
})

test('networkAwareSeedingPolicy allows seeding by default before the first detection resolves', () => {
  const policy = networkAwareSeedingPolicy({ detect: async () => true })
  assert.equal(policy.isSeedingAllowed(), true)
  policy.dispose()
})

test('networkAwareSeedingPolicy disallows seeding once detection confirms metered', async () => {
  const policy = networkAwareSeedingPolicy({ detect: async () => true })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(policy.isSeedingAllowed(), false)
  policy.dispose()
})

test('networkAwareSeedingPolicy keeps seeding allowed when detection is undeterminable (null)', async () => {
  const policy = networkAwareSeedingPolicy({ detect: async () => null })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(policy.isSeedingAllowed(), true)
  policy.dispose()
})

test('networkAwareSeedingPolicy re-polls on the configured interval', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  let metered = false
  const policy = networkAwareSeedingPolicy({ detect: async () => metered, pollIntervalMs: 1000 })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(policy.isSeedingAllowed(), true)

  metered = true
  t.mock.timers.tick(1000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(policy.isSeedingAllowed(), false)
  policy.dispose()
})

test('networkAwareSeedingPolicy.dispose stops further polling', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  let callCount = 0
  const policy = networkAwareSeedingPolicy({
    detect: async () => { callCount++; return false },
    pollIntervalMs: 1000
  })
  await new Promise((resolve) => setImmediate(resolve))
  const countAfterFirstCheck = callCount

  policy.dispose()
  t.mock.timers.tick(5000)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(callCount, countAfterFirstCheck)
})
