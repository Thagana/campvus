import { SeedingPolicy } from '@campvus/engine'

export interface SeedingPolicyFactories {
  networkAware (): SeedingPolicy
  alwaysAllow (): SeedingPolicy
}

// Encodes ADR-0004: apps/mode-a-desktop seeds freely by default, with an
// opt-out for a tethered/metered connection — the network-aware policy is
// what implements that opt-out (falling back to "seed freely" itself
// whenever detection is undeterminable, per seeding-policy.ts).
export function selectDesktopSeedingPolicy (factories: SeedingPolicyFactories): SeedingPolicy {
  return factories.networkAware()
}
