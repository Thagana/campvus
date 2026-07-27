# Real Tier 1/2 discovery: mDNS for LAN, a region-scoped topic for local cluster

`docs/ARCHITECTURE.md` §8 named three discovery tiers — LAN, local cluster, wide DHT — with
expanding-ring search recommended over pre-computing a radius. Today's engine only implements
Tier 3: `swarm-node.ts` joins a single flat Hyperswarm/HyperDHT topic
(`topicForCourse(courseId)`) with no LAN- or cluster-scoping at all. The confirmed two-laptop
Wi-Fi test (Open Question #4) worked because the global DHT happened to connect them quickly,
not because any LAN-specific mechanism existed.

## Decision

**Tier 1 (LAN)**: add an mDNS advertise/browse layer (via `bonjour-service`, a pure-JS,
no-native-deps package already in the same no-native-compile spirit as this engine's other
dependency choices) scoped to the local broadcast domain. A node advertises a `_campvus._tcp`
service carrying the course topic in a TXT record, and browses for others advertising the same
course; on discovery, it opens a plain TCP connection directly to the peer's advertised address
— bypassing the DHT entirely for same-LAN peers — and feeds that connection into the exact same
`handleMessage`/`send` wire protocol `swarm-node.ts` already uses for DHT-discovered peers,
since that protocol only needs a `Duplex` stream and has no opinion on how the connection was
established.

**Tier 2 (local cluster)**: rather than real geolocation/geohashing, use a coarse
admin-configured region tag (e.g. a `CAMPVUS_REGION` env var, set once per deployment/residence
by whoever runs the node) and join a second Hyperswarm topic derived from
`courseId + ':' + region` alongside the existing course-wide topic. Peers sharing the same
region tag naturally find each other through the DHT on this narrower topic, without any new
discovery mechanism — it's the same join, just scoped tighter. No region configured means no
Tier 2 topic is joined; Tier 3 alone still applies.

**Tier 3 (wide DHT)**: unchanged — the existing course-wide topic join.

**No expanding-ring timer.** §8 recommends trying LAN first and widening only if no peers are
found within a time budget. This ADR deliberately skips that state machine for v1: all
applicable tiers (mDNS, region topic if configured, course-wide topic) are joined immediately
and concurrently. LAN peers are typically found within milliseconds via mDNS regardless, so the
practical benefit of an artificial delay before joining wider tiers is small, and a real
expanding-ring implementation (tracking a time budget, tearing down/re-establishing joins) is
meaningfully more complex than "join everything, let whichever peer answers first serve the
request" — which the existing per-hash request logic (`requestedHashes`) already does correctly
regardless of which tier a peer was found through.

## Considered Options

- **UDP broadcast instead of mDNS** — rejected: works only on IPv4 LANs without cross-subnet
  routing assumptions mDNS's standard library support already handles more portably, and
  reinventing service advertisement/discovery from a raw broadcast socket is more code for less
  ecosystem support.
- **Real geohashing for Tier 2** — rejected for v1: needs a location source (GPS permission on
  desktop is awkward, IP-geolocation is unreliable indoors) for a use case §8 itself frames as
  "nearby but not same LAN, same suburb" — a coarse operator-set tag captures that without new
  infrastructure, and can be replaced with real geolocation later without changing the topic
  mechanism itself.
- **A full expanding-ring state machine** — rejected for v1, see above; revisit if joining all
  tiers concurrently turns out to cost something real (e.g. DHT join overhead at scale) that a
  staged join would avoid.

## Consequences

- New dependency: `bonjour-service` (packages/engine).
- `swarm-node.ts` gains a second connection source (raw TCP from mDNS discovery) alongside
  Hyperswarm's own `connection` event, both feeding the same message handler.
- `SwarmNodeOptions` gains an optional `region` field; unset means Tier 2 is simply not joined,
  a non-breaking addition for existing callers (`peer-node.ts`'s CLI, `apps/mode-a-desktop`).
- Resolves the discovery-tiering half of `docs/ARCHITECTURE.md` §8/Open Question #4; the other
  half (real-world validation across different Wi-Fi networks, mobile hotspot, campus
  NAT/firewall) still needs manual field testing on real separate networks, not covered by this
  ADR.
