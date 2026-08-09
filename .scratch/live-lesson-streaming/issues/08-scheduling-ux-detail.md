Type: grilling
Status: resolved
Blocked by: 06

# Scheduling UX Detail

## Question

[Live Session Discovery & Notification](06-live-session-discovery-notification.md) settled that
sessions are scheduled in advance (Teacher sets a start time) rather than ad-hoc, but explicitly
left the scheduling UI/flow itself as fog: how far in advance, recurring vs. one-off, where it's
surfaced.

Since that ticket resolved, the feature was actually built (`apps/mode-b-web`'s
`CourseDetailPage`, `apps/mode-b-api`'s `POST /courses/:courseId/sessions`) ahead of this ticket
going through the map. As shipped:

- **One-off only** — a single `startTime` (epoch ms) per session row, no recurrence field
  anywhere in `liveSessions`' schema or the API.
- **No lead-time validation** — the API accepts any `startTime` a Teacher submits, including one
  in the past; the `datetime-local` input has no `min` attribute either.
- **Surfaced on the course page** — an "Upcoming live sessions" table on `CourseDetailPage`,
  visible to Teachers and Students alike; a Teacher schedules via a modal, sorted by start time,
  no way to cancel or edit once scheduled.

This ticket asks: does the as-built behavior match what the spec should actually call for, or are
there gaps (recurring sessions, a minimum lead time, cancel/edit, how far in the future scheduling
is allowed) worth deciding now before this goes into `spec.md`?

## Answer

Three decisions, confirmed with the user:

- **One-off only, as built.** Recurring sessions ("every Tuesday 2pm") stay out of scope for this
  spec. No schema or API change needed here.
- **Reject past timestamps.** `POST /courses/:courseId/sessions` should require `startTime > now`
  — no further minimum lead time beyond that (a Teacher can schedule "5 minutes from now" if they
  want). **Not built today** — the route currently accepts any numeric `startTime`, including one
  in the past. This is a real gap against the decided behavior, not just a doc-only ratification.
- **Add cancel + edit.** A Teacher can cancel a scheduled session, or edit its start time, after
  creating it — mistakes and rescheduling are common enough to need this rather than "delete +
  recreate." **Not built today** — sessions are currently create-only (no `DELETE`/`PATCH` route,
  no UI affordance on `CourseDetailPage`'s session table).
- **No change to where it's surfaced or how far in advance scheduling is allowed** — the
  `CourseDetailPage` "Upcoming live sessions" table + modal, with no upper bound on how far out a
  session can be scheduled, stays as-built.

This resolves the "scheduling UX detail" fog item from
[Live Session Discovery & Notification](06-live-session-discovery-notification.md). Two of the
three decisions above are implementation gaps (past-timestamp validation, cancel/edit) that
`spec.md` should now call for explicitly rather than leave as an open implementation-level
question.
