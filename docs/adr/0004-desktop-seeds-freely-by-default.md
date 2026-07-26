# Desktop client seeds freely by default; Wi-Fi-only stays the mobile default

§7 locked "Wi-Fi/LAN-only seeding by default, never over mobile data unless opt-in" as one of
three explicit seeding decisions, reasoning that mobile plans often meter or exclude upload
from bundles. That reasoning is about cellular data plans on phones — it doesn't hold the same
way for `apps/mode-a-desktop` (ADR-0002), which normally connects over home/campus/residence
Wi-Fi or ethernet, typically unmetered.

## Decision

`apps/mode-a-desktop` seeds freely by default. A student on a tethered/mobile-hotspot
connection can opt out. If/when the parked mobile client (ADR-0002) is picked back up, it
keeps Wi-Fi-only-by-default — that's the connection type the original metered-data risk
actually applies to.

## Consequences

The seeding policy needs a per-product-surface default (desktop: seed-on by default; mobile:
seed-off-unless-Wi-Fi by default), not one global default. Either way, the opt-out/opt-in
toggle is only meaningful once network-type detection exists — `seeding-policy.ts`'s
Wi-Fi-vs-metered detection is still a manual-override stub (§13), not yet real for either
surface.
