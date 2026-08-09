Type: grilling
Status: resolved

# Live Session Discovery & Notification

## Question

Now that [Media Transport & Control-Plane Boundary Decision](03-media-transport-boundary-decision.md)
has settled on relaying live sessions over the existing swarm/topic mechanism (no separate
signaling backend), how do students actually learn a live session has started?

Options to weigh:

- Swarm-only: a session-start announcement is just another message on the course's existing
  topic (same mechanism as a new manifest) — a student only sees it if their app/agent is
  currently connected to the swarm.
- Some push layer on top: `docs/ARCHITECTURE.md` §5.5 deliberately avoids an always-on push
  notification backend for file sync ("not instant push, to avoid needing an always-on
  notification backend") — decide whether that same tradeoff holds for something as
  time-sensitive as "class starts now," where a student not currently connected would otherwise
  simply miss the start of a live class.

This was fog until Ticket 03 fixed the transport; it's sharp enough to ticket now.

## Answer

**Scheduled sessions, no new push infra.** Live sessions are scheduled in advance — tied to a
Course, with a start time a Teacher sets — rather than ad-hoc "go live now with no notice."
Students know when to open the app; the swarm-topic announcement (same mechanism as a new
manifest) just confirms "it's live now" to whoever's already connected at that time. This keeps
§5.5's existing "deliberately not instant push, to avoid needing an always-on notification
backend" stance intact — it turns out to still apply, because scheduling removes the need for a
student who isn't currently connected to be proactively woken up.

This also answers part of the still-open "session lifecycle / scheduling UX" fog item: sessions
are scheduled, not ad-hoc. What's not decided here: the actual scheduling UI/flow (how far in
advance, recurring vs. one-off, where it's surfaced) — left as an implementation detail for the
spec, not an architecture question this ticket needs to settle.
