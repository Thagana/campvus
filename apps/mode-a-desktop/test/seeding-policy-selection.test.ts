import test from 'node:test'
import assert from 'node:assert/strict'
import { selectDesktopSeedingPolicy } from '../src/seeding-policy-selection'

test('selects the network-aware seeding policy for the desktop surface (ADR-0004)', () => {
  const networkAwareResult = { isSeedingAllowed: () => true, dispose: () => {} }
  let networkAwareCalled = false
  let alwaysAllowCalled = false

  const result = selectDesktopSeedingPolicy({
    networkAware: () => { networkAwareCalled = true; return networkAwareResult },
    alwaysAllow: () => { alwaysAllowCalled = true; return { isSeedingAllowed: () => true } }
  })

  assert.equal(networkAwareCalled, true)
  assert.equal(alwaysAllowCalled, false)
  assert.equal(result, networkAwareResult)
})
