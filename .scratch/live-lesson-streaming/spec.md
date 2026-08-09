Status: ready-for-agent

# Teacher Live Lesson Streaming (Mode B, P2P relay)

See [ADR-0007](../../docs/adr/0007-live-lessons-relay-over-hyperswarm-not-webrtc.md) for the
central architecture decision this spec builds on, and [CONTEXT.md](../../CONTEXT.md) (School,
Teacher, Student, Enrollment) for the domain vocabulary used throughout. Full grilling/research
trail: `.scratch/live-lesson-streaming/` (map, tickets, research findings).

## Problem Statement

Mode B has no live-session capability today — only static file distribution. A conventional
WebRTC/SFU implementation would work, but requires every student to stream from a managed media
server, working directly against the product's core mission of avoiding student data cost
(`docs/ARCHITECTURE.md` §1). Campvus's actual client is a Node/Electron desktop app already doing
real peer-to-peer transfer over Hyperswarm for course files — not a browser tab, so it isn't
forced into WebRTC the way every browser-based P2P-streaming system researched for this spec was.
Live lesson streams can extend that same swarm instead of introducing a separate real-time-media
engine.

## Solution

The teacher's client chunks the live session into ~6-10 second segments and relays them via
flood-gossip over the Course's existing Hyperswarm topic — the same delivery shape
`swarm-protocol.ts`'s `applyManifestsMessage` already uses for manifest gossip — with an HTTP
origin fallback as the correctness floor when the swarm can't deliver a segment in time (mirrors
§5.6). Sessions are scheduled in advance (a Teacher sets a start time on a Course), so no
push-notification backend is needed: a student connected to the swarm at that time sees the
session-start announcement the same way they'd see a new file manifest today. The session
records locally on the teacher's client and auto-publishes as a regular signed manifest through
the existing hash-sign-publish pipeline (§5.1-§5.3) the instant the session ends — students who
missed it, or want to rewatch, get it through the standard peer-first/origin-fallback file path,
no separate rewatch mechanism. Access control is unchanged from today's file model: any Teacher
can start a session for any Course in their School; only Students holding an Enrollment in that
Course can join.

## User Stories

1. As a Teacher, I want to schedule a live lesson for one of my Courses with a start time, so
   that students know when to be ready to join.
2. As a Teacher, I want to start my scheduled live lesson, so that my session begins streaming to
   enrolled students.
3. As a Student enrolled in a Course, I want my client to see that Course's live session start
   while I'm connected to the swarm, so that I know to join.
4. As a Student, I want to join a live session and start receiving audio/video segments from
   peers on the swarm, so that I can watch without downloading everything directly from an
   origin server.
5. As a Student's client, I want to relay every live segment I receive to every other peer I'm
   connected to on that Course's topic, so that the session's data cost is shared across peers
   instead of centralized on one source.
6. As a Student whose upstream relay peer disconnects mid-session, I want my client to keep
   receiving segments from another already-connected peer with no visible freeze, so that one
   student's dropped connection doesn't break the class for everyone downstream of them.
7. As a Student whose client can't get a segment from any peer within a time budget, I want it to
   fall back to the Mode B origin server for that segment, so that the session is never blocked
   purely because the swarm didn't have it yet.
8. As a Teacher's client, I want to record the session locally as it streams, so that a recording
   exists once class ends.
9. As a Teacher's client, I want to automatically hash, sign, and publish the recording as a
   course-file manifest the moment the session ends, so that no manual upload step is needed.
10. As a Student who missed the live session or wants to rewatch, I want to fetch the recording
    through the same peer-first/origin-fallback path as any other course file, so that catching
    up doesn't require a different mechanism.
11. As a Teacher, I want to start a live session for any Course in my School, not just ones I
    personally created, so that live streaming matches the same School-wide access I already
    have for file distribution.
12. As a Student, I want to be denied joining a live session for a Course I don't hold an
    Enrollment in, so that live sessions carry the same access boundary as course files.
13. As a Student, I want no attendance cap and no special handling if I disconnect and rejoin a
    live session, so that joining behaves consistently every time — just an Enrollment check.
14. As anyone without a valid Enrollment (or Teacher access) for a Course, I want any attempt to
    receive that Course's live segments or its recording to be rejected, so that live content
    carries the same trust/access model as static files.
15. As a Student who isn't connected to the swarm when a session starts, I want no push
    notification to interrupt me, so that the system doesn't need an always-on notification
    backend — I find out by checking the scheduled time.

## Implementation Decisions

- **Media transport:** live segments relay peer-to-peer over the existing Hyperswarm swarm — no
  WebRTC, no SFU, no third-party media-server vendor. See
  [ADR-0007](../../docs/adr/0007-live-lessons-relay-over-hyperswarm-not-webrtc.md) for the full
  reasoning (data-cost mission, desktop client isn't browser-WebRTC-constrained, session is
  one-way broadcast so tolerates multi-second latency).
- **Fan-out:** flood/gossip — every peer relays a received segment to every peer it's connected
  to on the Course topic, the same shape as `applyManifestsMessage`. This is a deliberate choice
  over a bounded-fanout tree: it removes the single-parent dependency that would otherwise make
  one relaying peer's disconnect freeze everyone downstream of it, at the cost of more redundant
  bandwidth — acceptable at classroom scale (30-150 students).
- **Segment duration:** ~6-10 seconds. Longer than typical live-HLS segments (2-4s) since the
  confirmed one-way-broadcast model has no sub-second latency goal to protect; longer segments
  mean less swarm chatter and per-segment overhead.
- **Scale assumption:** 30-150 students per session (working assumption, not pilot-validated —
  revisit if real pilot data differs materially).
- **Session scheduling:** a Teacher sets a start time on a Course; sessions are not ad-hoc. This
  is what removes the need for a push-notification backend — students know when to be connected.
- **Discovery:** the session-start announcement flows over the same swarm-topic mechanism as a
  new manifest — a new message shape, not `applyManifestsMessage` itself (a live session isn't a
  static hash-addressed object), but the same flood-gossip delivery.
- **Recording & rewatch:** the teacher's client (already the segment source) records locally and
  auto-publishes through the existing hash-sign-publish pipeline the moment the session ends — no
  server-side recording path, no separate rewatch mechanism from ordinary file access.
- **Access control:** unchanged from the existing model — Teacher's School-wide access starts a
  session for any Course in their School; Student's per-Course Enrollment gates joining. No
  attendance cap, no special late-join/rejoin handling.
- **Origin fallback:** an HTTP origin fetch is the correctness floor when the swarm can't deliver
  a segment within a configurable time budget — mirrors §5.6's existing peer-first,
  origin-fallback pattern for files, applied to segments instead of whole files.
- **Explicitly not decided here, left for implementation:** exact codec/encoding, the concrete
  wire format for the live-segment announcement message, and the scheduling UI/flow (how far in
  advance, recurring vs. one-off, where it's surfaced in `apps/mode-b-web`/the desktop client).
  These are engineering/UI judgment calls downstream of the architecture this spec fixes, not
  open architecture questions.

## Testing Decisions

- **Pure logic gets unit tests, same pattern as the existing student-agent protocol.** Per
  `docs/ARCHITECTURE.md` §13.1, `swarm-protocol.ts`'s gossip/diff/request/verify logic is tested
  as pure functions against fake peer connections, with no real network involved. The live-segment
  gossip/relay logic (fan-out to connected peers, time-budget fallback trigger, disconnect
  handling) should follow the same seam: unit-testable without a real Hyperswarm network.
- **Real swarm robustness needs manual/smoke validation, not unit tests.** §13.1's Tier 1 LAN
  discovery claim was only trusted once confirmed on two physical laptops on the same Wi-Fi
  network — the same standard applies here: a relaying peer actually disconnecting mid-session
  and downstream peers recovering without a visible freeze needs to be observed on real devices,
  not just asserted in a unit test against mocked connections.
- **Recording auto-publish** should be tested the same way `packages/engine`'s existing
  hash-sign-publish pipeline is tested today (§13.1: "working and tested") — the only new
  surface is *what* triggers publish (session-end, not an ingestion adapter), not the pipeline
  itself.
- **Access control** should reuse the exact test seams already used for Course/Enrollment checks
  in `apps/mode-b-api` (`test/courses.test.ts`'s style — real server, in-memory DB, actual HTTP
  requests) rather than inventing a new pattern, since the access rules themselves are unchanged.

## Out of Scope

- Mode A live lesson streaming — Mode A has no accounts or UI to build this on
  (`docs/ARCHITECTURE.md` §3.1); ruled out while charting `.scratch/live-lesson-streaming/`.
- SFU/WebRTC vendor evaluation (mediasoup, LiveKit, Daily, Twilio) — moot once ADR-0007 ruled out
  SFU/WebRTC entirely for this feature.
- Real-time two-way audio interaction (students unmuting live) — the session model is one-way
  broadcast; a video-call-style feature is a different, harder problem not covered here.
- In-session text chat — not decided whether it belongs in this feature at all; left as an open
  question for a follow-up, not required by this spec's destination.
- Exact scheduling UI/flow, codec/encoding choice, and the live-segment announcement wire format
  — implementation-level decisions downstream of this spec's architecture.
- KMS-backed key custody for live-session signing — inherits the same local-file caveat already
  flagged for static-file signing (`docs/ARCHITECTURE.md` §13.1); not a new gap this feature
  introduces.
- An actual working prototype of the segment relay overlay — this spec was resolved via design
  discussion, not a code spike (see
  [Segment Relay Overlay Design](issues/07-segment-relay-overlay-design.md)); the first
  implementation step should validate the flood-gossip/disconnect-recovery design against real
  code, the same way §13.1's LAN discovery claim was only trusted once physically verified.

## Further Notes

- Closes `docs/ARCHITECTURE.md` §12 Open Question #7 (previously assumed live A/V needed a
  separate WebRTC/SFU engine) — see the updated Open Question #7 text and
  [ADR-0007](../../docs/adr/0007-live-lessons-relay-over-hyperswarm-not-webrtc.md).
- **Known risk carried forward, not resolved by this spec:** per §13.2, Mode B's real
  cross-client P2P swarm participation is itself still unvalidated end-to-end (only
  origin-fallback has been tested). This feature builds live relay directly on top of that
  unproven substrate — validating basic Mode B P2P file swarming for real is a reasonable
  prerequisite to sequence before or alongside implementing this spec, not a reason to block
  writing it.
