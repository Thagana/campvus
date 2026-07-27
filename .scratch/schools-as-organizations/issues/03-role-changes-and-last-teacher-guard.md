# 03 — Role changes + last-Teacher guard

**What to build:** any Teacher can change another member's role between Teacher and Student, or
remove a member from the School entirely, using better-auth's native role-update/remove-member
actions. New lifecycle hooks on both actions reject any change that would leave the School with
zero Teacher/Owner members, so a School can never end up with nobody able to manage it.

**Blocked by:** 02 (needs a second member in a School to promote/demote/remove)

**Status:** done

- [x] A Teacher can promote a Student in their School to Teacher
- [x] A Teacher can demote another Teacher in their School to Student
- [x] A Teacher can remove another member from the School entirely
- [x] Attempting to demote the School's last remaining Teacher to Student is rejected
- [x] Attempting to remove the School's last remaining Teacher is rejected
- [x] A demoted Teacher immediately loses Teacher-level access (inviting, role changes) on their
      very next request — course creation isn't buildable yet (ticket 04), so not covered here
- [x] Tests use the existing `createTestApp()` + `app.inject()` HTTP seam throughout

## Discovery: the Owner is permanently un-demotable and un-removable

better-auth's own `creatorRole` protection (built into `update-member-role`/`remove-member`,
not something we added) already blocks changing or removing a School's sole Owner — and since
this ticket also closes the "grant `owner` through invite/role-update" gap (needed so nobody
can hand out a second Owner), the Owner can never actually leave through either endpoint, by
anyone, including themselves. Combined, that means **the School's "last remaining Teacher" is,
in every state reachable through the public API, always the Owner** — the last-Teacher guard
this ticket adds (`schoolWouldLoseItsLastTeacher` in `organization-hooks.ts`) can't currently be
triggered for a plain Teacher through normal use; the Owner-removal path it also covers is
redundant with better-auth's own protection.

The guard is still worth keeping: it encodes the actual domain invariant (teacher-or-owner, not
"owner specifically") independent of better-auth's owner-only mechanism, and would start
mattering the moment any future path lets the Owner leave (e.g. an ownership-transfer feature,
or a `leave-organization` route, neither of which exists yet). `test/roles.test.ts` proves the
guard's own logic works by directly deleting the Owner's `member` row to simulate a School down
to one plain Teacher — a state the public API can't otherwise reach.
