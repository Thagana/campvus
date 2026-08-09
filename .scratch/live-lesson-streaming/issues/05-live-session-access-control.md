Type: grilling
Status: resolved

# Live Session Access Control

## Question

How does access control for a live session map onto the existing School/Teacher/Student/
Enrollment model (`CONTEXT.md`)?

Confirm or revise:

- Any Teacher in a School can start a live session for any Course they have access to — matching
  Teacher's existing School-wide access (no per-course restriction, same as today).
- Only Students holding an Enrollment in that specific Course can join — matching Enrollment's
  existing per-course scope.
- Whether live sessions need any access nuance beyond what static file distribution already
  enforces — e.g. can a late joiner see anything from before they joined, can a teacher cap
  attendance below full course enrollment, does leaving and rejoining need to be distinguished
  from a fresh join.

This is independent of the transport decision — access control is a policy question, not a
transport one — so it doesn't need to wait on
[Media Transport & Control-Plane Boundary Decision](03-media-transport-boundary-decision.md).

## Answer

**Holds as-is, no new access primitive.** Any Teacher in a School can start a live session for
any Course they have access to — matching Teacher's existing School-wide access, no per-course
restriction (`CONTEXT.md`). Only Students holding an Enrollment in that specific Course can
join — matching Enrollment's existing per-course scope. Same checks the static file-distribution
path already enforces, just applied at session-join time instead of file-request time.

**No live-specific nuance for v1.** No attendance cap below full course enrollment, no special
handling for late joiners or rejoins — a joining Student just needs a valid Enrollment at the
moment they connect, the same check every time, with no session-specific state to track. Keeps
this consistent with the "keep it simple" instinct already present elsewhere in this map (e.g.
[Recording & Post-Hoc Distribution](04-recording-and-post-hoc-distribution.md)'s reuse of the
existing publish pipeline rather than inventing something new).
