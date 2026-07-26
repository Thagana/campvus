import test from 'node:test'
import assert from 'node:assert/strict'
import { alwaysAllowSeeding, fixedSeedingPolicy } from '../src/seeding-policy'

test('alwaysAllowSeeding always allows seeding', () => {
  assert.equal(alwaysAllowSeeding().isSeedingAllowed(), true)
})

test('fixedSeedingPolicy returns whatever it was fixed to', () => {
  assert.equal(fixedSeedingPolicy(true).isSeedingAllowed(), true)
  assert.equal(fixedSeedingPolicy(false).isSeedingAllowed(), false)
})
