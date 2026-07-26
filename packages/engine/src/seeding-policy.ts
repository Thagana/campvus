// Seeding policy (§7): "never seed over mobile data unless the student
// explicitly opts in." That requires knowing whether the current network
// is Wi-Fi/LAN or metered mobile data — an OS-level capability plain
// Node.js on a laptop does not have (no portable network-type API without
// native/platform bindings). Real detection belongs to whatever mobile
// packaging (Bare/Pear) eventually runs on-device.
//
// This module implements the correct *shape* of the policy — pluggable,
// checked before every seed — with an honest stand-in decision until real
// network-type detection exists. Do not read this as "Wi-Fi is detected";
// it isn't.

export interface SeedingPolicy {
  isSeedingAllowed (): boolean
}

// Default: seed unconditionally. Matches today's behaviour, and is the only
// honest default on a platform where network type can't be determined.
export function alwaysAllowSeeding (): SeedingPolicy {
  return { isSeedingAllowed: () => true }
}

// A manual stand-in for real network-type detection: an operator (or a
// future adapter that *can* detect network type) supplies the answer
// directly instead of the policy guessing.
export function fixedSeedingPolicy (allowed: boolean): SeedingPolicy {
  return { isSeedingAllowed: () => allowed }
}
