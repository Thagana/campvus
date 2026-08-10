Type: grilling
Status: resolved

# In-Session Chat Scope

## Question

[Media Transport & Control-Plane Boundary Decision](03-media-transport-boundary-decision.md)
confirmed the session model is one-way broadcast (audio/video), and mentioned "text chat only" as
an aside while resolving that ticket — but chat's own scope was never pinned down. Is text chat
during a live session:

- **In scope for this spec** — needs its own design pass (transport: over the same swarm topic,
  or a separate mechanism? persistence: does chat get recorded/replayed alongside the video?
  access control: same Enrollment gate as the session itself?), or
- **Out of scope, deferred to a follow-up** — this spec ships audio/video only, chat is a
  named future feature but not designed or built here.

This is the last fog item on this map before it's fully closed — no chat feature exists in the
codebase today (`LiveSessionPanel.tsx` has no chat UI, no message-relay protocol alongside
`live-segment-protocol.ts`).

## Answer

**Deferred to a follow-up, out of scope for this spec.** Live lesson streaming ships audio/video
only for v1. Chat gets its own future effort — its own map/spec, once the core streaming feature
(itself still unvalidated end-to-end against a real multi-client swarm, per §13.2) has proven out.
Keeps this spec's surface area matched to what ADR-0007 actually analyzed (one-way broadcast),
rather than growing it to cover a feature that was never part of that decision's reasoning.

`spec.md`'s Out of Scope section previously said chat's inclusion "isn't decided" — updated to
reflect this as a settled deferral, not an open question.
