Status: wayfinder:map

# In-Session Live Chat for Teacher Live Lesson Streaming

## Destination

A feature spec for in-session live text chat during a Teacher's live lesson stream (Mode B) —
covering wire-level delivery over the existing Hyperswarm swarm, moderation (mute/delete), and
how chat integrates with the session recording — handed off ready for implementation planning,
following this repo's `spec.md` + `issues/` convention.

This is the follow-up effort that
[In-Session Chat Scope](../live-lesson-streaming/issues/09-in-session-chat-scope.md) (on the
[Teacher Live Lesson Stream Using the P2P Framework](../live-lesson-streaming/map.md) map)
deliberately deferred: "Chat gets its own future effort — its own map/spec, once the core
streaming feature ... has proven out."

## Notes

- Domain: this repo's Mode B (School/Teacher/Student/Enrollment) auth/enrollment model — see
  `CONTEXT.md` before using any of those terms loosely.
- Builds directly on
  [`.scratch/live-lesson-streaming/spec.md`](../live-lesson-streaming/spec.md) and
  [ADR-0007](../../docs/adr/0007-live-lessons-relay-over-hyperswarm-not-webrtc.md) (peer-relay
  over Hyperswarm, no WebRTC/SFU, one-way-broadcast session model). Chat UI lives in
  `apps/mode-a-desktop`'s `LiveSessionPanel.tsx` — the one shared Electron client Mode B's
  desktop/live features actually run in today, despite the "mode-a" name (confirmed while
  reviewing the parent spec).
- Standing decisions made directly with the user while charting this map (quick calls, not run
  through a grilling ticket — revisit if a later ticket surfaces a reason to):
  - **Transport**: chat rides the same Hyperswarm swarm topic as video segments/manifests
    (flood-gossip, per ADR-0007), not a separate server-mediated mechanism. [Chat Message Shape &
    Delivery Semantics](issues/01-chat-message-shape-and-delivery.md) works out the specifics
    under this assumption rather than re-litigating same-topic-vs-separate.
  - **Persistence**: chat is recorded and replayed alongside the session recording, not
    live-only. [Chat Recording & Replay Integration](issues/04-chat-recording-and-replay-integration.md)
    works out how.
  - **Moderation**: in scope for v1 — the Teacher needs some in-session moderation power (mute
    and/or delete), not just the existing Enrollment gate.
    [Moderation Model](issues/03-moderation-model.md) works out the mechanics.
- Skills: `/grilling` and `/domain-modeling` for decision tickets (note: this environment doesn't
  have a `/grilling` skill installed — run the conversation directly, one question at a time, in
  its spirit); `/research` subagent for research tickets; `/prototype` for the UI ticket.

## Decisions so far

- [Gossip-Based Moderation Precedent](issues/02-gossip-moderation-precedent.md) (research,
  resolved): across every gossip/federated system surveyed with no per-room server in the
  delivery path (SSB, Matrix's content redaction, CRDTs), "delete" can only ever be a
  tombstone/redaction message well-behaved clients choose to honor — never guaranteed erasure —
  and "mute" can only ever be receiver-side filtering, never sender-side suppression. True
  sender-side enforcement exists only where a server-equivalent component sits in the delivery
  path (XMPP MUC ban, Matrix room ban), which Hyperswarm flood-gossip deliberately doesn't have.
  Feeds [Moderation Model](issues/03-moderation-model.md), now partially unblocked. Full findings:
  [research/gossip-moderation-precedent.md](research/gossip-moderation-precedent.md).

## Not yet specified

- Message richness: plain text only for v1, or reactions/threading/replies? Not sharp enough to
  ticket yet — likely graduates once [Chat Message Shape & Delivery
  Semantics](issues/01-chat-message-shape-and-delivery.md) resolves and it's clear what the base
  message shape can cheaply support.
- Rate limiting / spam prevention for a flood-gossip-relayed chat with no central broker. Low
  priority at classroom scale (30-150 students, per the parent map), but worth revisiting once
  [Moderation Model](issues/03-moderation-model.md) is resolved — moderation and spam-handling
  are related but not identical.

## Out of scope

- General course discussion (a persistent forum/message board decoupled from any specific live
  session) — this map is scoped to chat *during* a live session, not a standing course-wide
  messaging feature. Confirmed directly with the user while naming this map's destination.
- Real-time two-way audio/video interaction (students unmuting live) — already ruled out at the
  parent map's [Media Transport & Control-Plane Boundary
  Decision](../live-lesson-streaming/issues/03-media-transport-boundary-decision.md); this map
  only extends that one-way-broadcast model with text chat, doesn't revisit it.
