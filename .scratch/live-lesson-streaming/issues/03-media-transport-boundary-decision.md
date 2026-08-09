Type: grilling
Status: resolved
Blocked by: 01, 02

# Media Transport & Control-Plane Boundary Decision

## Question

This is the central architecture question this map exists to answer: how much of
`packages/engine`'s P2P framework (Hyperswarm swarm/topics, enrollment-derived trust model) is
actually reused for teacher live lesson streams, and how does live media get from teacher to
students?

Options on the table:

- **(a) Control-plane-only reuse** — swarm/topics used purely for session
  announcement/discovery/access-control; media flows over a conventional WebRTC/SFU. This is the
  reading consistent with `docs/ARCHITECTURE.md` §12 Open Question #7 as currently written.
- **(b) Peer-assisted media relay** — extend the product's actual bandwidth-saving mission to
  live video too, per [Peer-Assisted Relay Feasibility](02-peer-assisted-relay-feasibility.md)'s
  findings.
- **(c) Some hybrid** — e.g. control-plane reuse plus peer-assisted relay only past a certain
  viewer count, SFU below it.

Also decide:

- Whether this resolution should update `docs/ARCHITECTURE.md` §12 Open Question #7 (it should,
  at minimum as a pointer to this ticket).
- Whether it warrants its own ADR under `docs/adr/` per the `domain-modeling` skill's criteria
  (hard to reverse, surprising without context, result of a real tradeoff) — this decision looks
  likely to qualify, but confirm at resolution time.

## Answer

**Option (b): peer-assisted media relay over the existing Hyperswarm swarm.** No WebRTC, no SFU,
no third-party media-server vendor. Live segments relay over the same swarm/topic/trust
infrastructure `packages/engine` uses for file distribution, with an HTTP origin fallback as the
correctness floor (mirroring §5.5/§5.6's existing peer-first/origin-fallback pattern).

This explicitly overrides ticket 02's own bottom-line recommendation (conventional SFU), for
reasons recorded in [ADR-0007](../../../docs/adr/0007-live-lessons-relay-over-hyperswarm-not-webrtc.md):

1. The product's core value proposition is avoiding student data cost — peer relay serves that,
   SFU doesn't.
2. Every system ticket 02 surveyed was forced into WebRTC by the browser sandbox; campvus's
   desktop/Electron client already does raw P2P over Hyperswarm and isn't browser-constrained.
3. The session model is confirmed one-way broadcast (teacher streams, students watch, text chat
   only) — tolerates peer-relay's multi-second latency class, which is exactly the case ticket
   02's research flagged as workable.

Updated `docs/ARCHITECTURE.md` §3.2 and §12 Open Question #7 to point at this resolution instead
of assuming a separate WebRTC/SFU engine. This decision is scoped to classroom scale (30-150,
per [ticket 01](01-live-session-scale.md)) — revisit if session sizes ever grow into the
hundreds-to-thousands range.

**Not resolved by this ticket, carried forward as fog/new tickets:** segment chunking and relay
overlay design (fan-out, backpressure, relay-tree rebuild on peer disconnect), live-session
announcement/discovery mechanism now that transport is swarm-based. See map.
