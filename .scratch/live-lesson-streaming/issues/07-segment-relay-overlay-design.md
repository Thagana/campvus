Type: prototype
Status: resolved
Blocked by: 03

# Segment Relay Overlay Design

## Question

[Media Transport & Control-Plane Boundary Decision](03-media-transport-boundary-decision.md)
decided live media relays as chunked segments over Hyperswarm, but not how the relay overlay
itself behaves. This is a "how should it behave" question — raise the fidelity of the discussion
with a rough spike (per the `/prototype` skill) before committing it to the spec:

- How audio/video gets chunked into relayable segments (segment duration, encoding), and how a
  segment is addressed/announced on the swarm (new mechanism, distinct from static file
  manifests which are hash-addressed after the fact — a live segment needs to be announced as it
  is produced).
- Fan-out shape: does every peer relay to every other peer it's connected to (flood/gossip,
  simplest but highest redundant-bandwidth), or does the swarm form a lighter tree/mesh with
  bounded fan-out per peer?
- What happens when a relaying peer disconnects mid-class (lid closed, backgrounded, hotspot
  drop) — per the research (`.scratch/live-lesson-streaming/research/peer-assisted-relay-feasibility.md`),
  this is the single riskiest unsolved piece: a dropout must not visibly freeze the class for
  everyone downstream of that peer.
- How the HTTP origin fallback (the correctness floor, per ADR-0007) is invoked when the swarm
  can't deliver a segment in time — same peer-first/origin-fallback shape as file distribution,
  but on a much tighter time budget.

## Answer

**Resolved via discussion, not a code spike** — the actual prototype build is deferred to the
first step of implementation, where it gets feedback from running code; this ticket records the
planned design going into the spec.

**Fan-out: flood/gossip, same pattern as manifest gossip.** Every peer relays a segment to every
peer it's connected to on the course topic — the same shape `swarm-protocol.ts`'s
`applyManifestsMessage` already uses for manifests, not a bounded-fanout tree. This directly
solves the riskiest problem [the research](../research/peer-assisted-relay-feasibility.md)
flagged (a relaying peer dropping mid-class freezing everyone downstream of it): because no peer
depends on one designated parent, losing one connection just means falling back to another
already-connected peer or the HTTP origin fallback (per ADR-0007) — no explicit relay-tree
rebuild logic needed. Costs more redundant bandwidth than a tree, an acceptable tradeoff at
classroom scale (30-150, per [ticket 01](01-live-session-scale.md)). Avoids the "new engineering
discipline" of tree/parent-child maintenance that ADR-0007 flagged as a real cost.

**Segment duration: ~6-10 seconds.** Longer than typical live-HLS segments (PeerTube/
p2p-media-loader use ~2-4s) — fewer segments to announce/relay per minute, less swarm chatter and
per-segment overhead. Justified directly by the confirmed one-way-broadcast session model (see
[Media Transport & Control-Plane Boundary Decision](03-media-transport-boundary-decision.md)),
which already tolerates multi-second latency — there's no sub-second responsiveness goal to
protect by paying for shorter segments.

**Not decided here, left for implementation:** exact codec/encoding, and how a live segment is
addressed/announced on the swarm (a live segment is produced incrementally, unlike a static
file's hash computed after the fact — needs its own message shape, distinct from
`applyManifestsMessage`, but the same flood-gossip delivery mechanism applies).
