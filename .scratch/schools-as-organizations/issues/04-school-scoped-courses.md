# 04 — School-scoped Courses

**What to build:** Course creation requires Teacher role in a School, and the new Course's
`schoolId` is inferred server-side from the creating Teacher's own membership — never
client-supplied. Teachers automatically see and manage every Course in their School with no
per-Course membership needed. Students only see and access Courses they hold an Enrollment in.
Enrolling someone who isn't yet a member of the School fails clearly. Accounts with no School
membership are denied everywhere School/Course-scoped.

**Blocked by:** 02 (needs a Teacher and a Student actually in a School to exercise both sides
of access)

- [ ] A Teacher creates a Course; it's automatically scoped to their School without specifying
      a school explicitly
- [ ] A Teacher sees and can manage every Course in their School, including ones they didn't
      personally create
- [ ] A Student sees and can access only the Courses they hold an Enrollment in — not every
      Course in the School
- [ ] A Student attempting to create a Course is denied
- [ ] Enrolling an email that isn't a member of the School fails with a clear error, distinct
      from "no account at all"
- [ ] An authenticated account with no School membership is denied on every School/Course-scoped
      route
- [ ] Tests use the existing `createTestApp()` + `app.inject()` HTTP seam throughout
