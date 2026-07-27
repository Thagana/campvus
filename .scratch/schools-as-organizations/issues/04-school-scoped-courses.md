# 04 — School-scoped Courses

**What to build:** Course creation requires Teacher role in a School, and the new Course's
`schoolId` is inferred server-side from the creating Teacher's own membership — never
client-supplied. Teachers automatically see and manage every Course in their School with no
per-Course membership needed. Students only see and access Courses they hold an Enrollment in.
Enrolling someone who isn't yet a member of the School fails clearly. Accounts with no School
membership are denied everywhere School/Course-scoped.

**Blocked by:** 02 (needs a Teacher and a Student actually in a School to exercise both sides
of access)

**Status:** done

- [x] A Teacher creates a Course; it's automatically scoped to their School without specifying
      a school explicitly
- [x] A Teacher sees and can manage every Course in their School, including ones they didn't
      personally create (tested for listing, manifest upload/list, content fetch, and enrolling
      a student — all four via a colleague Teacher who didn't create the course)
- [x] A Student sees and can access only the Courses they hold an Enrollment in — not every
      Course in the School
- [x] A Student attempting to create a Course is denied
- [x] Enrolling an email that isn't a member of the School fails with a clear error, distinct
      from "no account at all"
- [x] An authenticated account with no School membership is denied on every School/Course-scoped
      route (`/courses` create/list/enroll and the manifest routes)
- [x] Tests use the existing `createTestApp()` + `app.inject()` HTTP seam throughout

## Note: routes/content.ts and manifests.ts were also touched

Not named explicitly in "What to build," but necessary: `manifests.ts` already shared
`requireCourseRole` with `courses.ts` so it needed no changes of its own, but `content.ts` did
its own enrollments-only query — updated to use the new `accessibleCourseIds` (guards.ts) so a
Teacher's School-wide access extends to content downloads too, not just course listing.

## Note: a pre-existing case-sensitivity gap in enrollment-by-email, not introduced here

`routes/courses.ts`'s enrollment lookup (`eq(user.email, email)`) is case-sensitive, same as
before this ticket. If a Teacher enrolls using different casing than the stored email, they'll
see "no account with this email" instead of "not a member of your School" — the wrong one of
the two distinct errors this ticket added. Pre-existing behavior (the old code had the same
case-sensitive lookup), not a regression, so left out of this ticket's scope — worth a follow-up.
