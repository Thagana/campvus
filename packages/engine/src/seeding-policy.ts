// Seeding policy (§7). The default differs by product surface (ADR-0004):
// the desktop client (apps/mode-a-desktop) seeds freely by default, with an
// opt-out for a tethered/metered connection; the parked mobile client would
// default the other way (Wi-Fi-only, opt-in to seed on metered data). This
// module implements the policy's *shape* — pluggable, checked before every
// seed — for both the manual stand-in and (on Windows) real detection.

import { isConnectionMetered } from './network-type'

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

export interface NetworkAwareSeedingPolicyOptions {
  // Injectable for tests; defaults to the real OS-level check
  // (network-type.ts). Returns true/false when detectable, null when
  // undeterminable (e.g. non-Windows today).
  detect?: () => Promise<boolean | null>
  pollIntervalMs?: number
}

export interface DisposableSeedingPolicy extends SeedingPolicy {
  // Stops the background poll. Callers that create one of these must call
  // this on shutdown, or the interval keeps the process alive.
  dispose (): void
}

// Polls OS-level metered-connection status and caches the result so
// `isSeedingAllowed()` stays synchronous (detection itself is async).
// Undeterminable readings (null — non-Windows today, or the OS call
// failing) default to "seed freely," per ADR-0004: the desktop surface's
// default is opt-out, so an inconclusive check must never silently behave
// like an opt-in-only policy.
export function networkAwareSeedingPolicy (
  options: NetworkAwareSeedingPolicyOptions = {}
): DisposableSeedingPolicy {
  const detect = options.detect ?? isConnectionMetered
  const pollIntervalMs = options.pollIntervalMs ?? 30_000
  let allowed = true

  const refresh = async (): Promise<void> => {
    const metered = await detect()
    allowed = metered !== true
  }

  void refresh()
  const timer = setInterval(() => { void refresh() }, pollIntervalMs)
  timer.unref()

  return {
    isSeedingAllowed: () => allowed,
    dispose: () => clearInterval(timer)
  }
}
