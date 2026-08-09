Status: wayfinder:map

# Teacher Live Lesson Stream Using the P2P Framework

## Destination

A feature spec for teacher live lesson streaming (Mode B only) — covering the media-transport
architecture (how much of `packages/engine`'s P2P framework is actually reused), session
lifecycle, access control, and discovery — handed off ready for implementation planning,
following this repo's `spec.md` + `issues/` convention.

**Destination reached:** [spec.md](spec.md) is written. All tickets resolved.

## Notes

- Domain: this repo's Mode B (School/Teacher/Student/Enrollment) auth/enrollment model — see
  `CONTEXT.md` before using any of those terms loosely.
- Standing constraint: [ADR context] `docs/ARCHITECTURE.md` §12 Open Question #7 currently treats
  live A/V as a *different engine* from the P2P file-distribution engine (`packages/engine`,
  Hyperswarm-based) and says it "should not be designed into the shared engine's design now."
  This map is explicitly allowed to revisit that boundary (that's its central question, see
  [Media Transport & Control-Plane Boundary Decision](issues/03-media-transport-boundary-decision.md)),
  but whatever it decides should update Open Question #7 when closed — and get its own ADR if the
  decision is hard to reverse / surprising / a real tradeoff (see `domain-modeling` skill's ADR
  criteria).
- Known gate, not blocking: per `docs/ARCHITECTURE.md` §13.2, real Mode B P2P swarm participation
  between two authenticated clients is unvalidated end-to-end (only origin-fallback is tested).
  This map proceeds without waiting on that validation, but the eventual spec should carry it as a
  named risk/dependency.
- Skills: `/grilling` and `/domain-modeling` for decision tickets; `/research` subagent for
  research tickets.

## Decisions so far

- [Peer-Assisted Relay Feasibility](issues/02-peer-assisted-relay-feasibility.md) (research, resolved):
  no surveyed peer-assisted live-relay system (PeerTube/p2p-media-loader, Streamroot/Peer5, Theta
  Network, academic hybrid P2P-CDN work, BitTorrent Live's history, Owncast's unbuilt P2P request)
  hits sub-second interactive latency or pays off at classroom scale — PeerTube disables P2P in
  low-latency mode, and p2p-media-loader's own docs put useful scale at 1,000+ viewers, an order of
  magnitude above classroom scale. Recommendation feeding
  [ticket 03](issues/03-media-transport-boundary-decision.md): a conventional SFU (mediasoup/LiveKit
  OSS or a hosted vendor) is the credible v1 choice; peer-assisted relay isn't ruled out forever, just
  not justified at this scale today. Doesn't preclude control-plane-only Hyperswarm/topics reuse
  (ticket 03 option (a)). Full findings:
  [research/peer-assisted-relay-feasibility.md](research/peer-assisted-relay-feasibility.md).
- [Typical Live Session Scale](issues/01-live-session-scale.md) (grilling, resolved): assume
  lecture-sized sessions, roughly 30-150 students (working assumption, not pilot-validated) —
  comfortably inside a conventional SFU's normal range and well past WebRTC mesh's ceiling.
  Reinforces rather than complicates the SFU conclusion from
  [Peer-Assisted Relay Feasibility](issues/02-peer-assisted-relay-feasibility.md).
- [Media Transport & Control-Plane Boundary Decision](issues/03-media-transport-boundary-decision.md)
  (grilling, resolved): **peer-assisted relay over the existing Hyperswarm swarm — no WebRTC, no
  SFU** — deliberately overriding ticket 02's own SFU recommendation. The desktop/Electron client
  isn't browser-WebRTC-constrained the way every surveyed system was, the product's core mission
  is student data-cost avoidance (which SFU doesn't serve), and the session model is confirmed
  one-way broadcast, which tolerates peer-relay's multi-second latency class. Recorded as
  [ADR-0007](../../docs/adr/0007-live-lessons-relay-over-hyperswarm-not-webrtc.md); updated
  `docs/ARCHITECTURE.md` §3.2 and §12 Open Question #7 to point here instead of assuming a
  separate WebRTC/SFU engine.
- [Recording & Post-Hoc Distribution](issues/04-recording-and-post-hoc-distribution.md)
  (grilling, resolved): in scope — a recording is hashed/signed/published through the same
  pipeline as any other course file. The teacher's client (already the segment source) records
  locally and auto-publishes the moment the session ends; no separate server-side recording path.
- [Live Session Access Control](issues/05-live-session-access-control.md) (grilling, resolved):
  holds as-is, no new primitive — Teacher's School-wide access starts a session for any of their
  Courses, Student's Enrollment gates joining, same checks as static file access. No attendance
  cap, no special late-join/rejoin handling for v1.
- [Live Session Discovery & Notification](issues/06-live-session-discovery-notification.md)
  (grilling, resolved): sessions are scheduled in advance (Teacher sets a start time), not
  ad-hoc — so no new push-notification infra is needed; the swarm-topic announcement (same
  mechanism as a manifest) just confirms "it's live now" to whoever's already connected. Keeps
  §5.5's "not instant push" stance intact.
- [Segment Relay Overlay Design](issues/07-segment-relay-overlay-design.md) (prototype,
  resolved via discussion — code spike deferred to implementation): flood/gossip fan-out (same
  pattern as manifest gossip), ~6-10s segments. Flood-gossip solves the relay-dropout robustness
  problem structurally — no single-parent dependency, no explicit tree-rebuild logic needed.
- [Scheduling UX Detail](issues/08-scheduling-ux-detail.md) (grilling, resolved): one-off only
  (no recurring), `startTime` must reject a past timestamp (not yet built — real gap), and a
  Teacher can cancel/edit a scheduled session (not yet built — real gap). Surfaced on
  `CourseDetailPage` as-built, no change there. `spec.md` updated to call for the two gaps
  explicitly rather than leaving scheduling UX as an open implementation question.
- [In-Session Chat Scope](issues/09-in-session-chat-scope.md) (grilling, resolved): deferred to a
  future follow-up effort — this spec ships audio/video only, matching ADR-0007's one-way-broadcast
  analysis. `spec.md`'s Out of Scope section updated from "not decided" to a settled deferral.

## Not yet specified

(none — every fog item has graduated into a resolved ticket.)

## Out of scope

- Mode A live lesson streaming — ruled out while naming this map's destination. Mode A has no
  accounts and no UI of its own (`docs/ARCHITECTURE.md` §3.1); a live-session feature needs both,
  which only Mode B has (§3.2). Confirmed directly with the user rather than via a closed ticket.
- SFU/WebRTC vendor infra evaluation (mediasoup, LiveKit OSS/Cloud, Daily, Twilio) — moot once
  [Media Transport & Control-Plane Boundary Decision](issues/03-media-transport-boundary-decision.md)
  ruled out SFU/WebRTC entirely; closed via that ticket rather than evaluated on its own merits.
- Real-time two-way audio interaction (students unmuting live) — ruled out while resolving
  [Media Transport & Control-Plane Boundary Decision](issues/03-media-transport-boundary-decision.md):
  the session model is confirmed one-way broadcast.
