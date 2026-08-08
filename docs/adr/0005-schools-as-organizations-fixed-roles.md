# Schools as better-auth organizations with fixed Teacher/Student roles

Mode B's auth/enrollment ownership was flagged in ARCHITECTURE.md as open question #6,
needing "its own design pass before Mode B work starts." Today, registration is open to
anyone (`routes/auth.ts`), any authenticated user can create a course (`routes/courses.ts`),
and role is per-course (`enrollments.role` — a person can be a Teacher in one course and a
Student in another, per the original comment in `auth/guards.ts`). None of that models a real
school, which has a fixed staff/student population that someone else provisions.

## Decision

Each School (the term we use going forward for the auth/enrollment concept — replacing
"institution" as used in ARCHITECTURE.md's registration/provisioning language, though
"institution" itself stays in use for the unrelated manifest-signing keypair; see CONTEXT.md)
is a better-auth Organization. Schools are created only by us, via an internal script — never
through self-service sign-up. That script seeds the School's first Teacher as its `owner` in
the same operation, so a School never exists without someone able to manage it.

We replace better-auth's default organization roles (owner/admin/member) with
owner/teacher/student. Teacher is school-wide: any Teacher can see and manage every Course in
their School, not just ones they created or were added to — this replaces per-course role
entirely. Students still need a per-course Enrollment. Any Teacher can invite new members and
change another member's role between Teacher and Student, except a change that would leave the
School with zero Teachers is rejected. A person may belong to only one School; this is
enforced when an invitation is accepted.

## Considered Options

- **Keep per-course role, add School only as a grouping label** — rejected: doesn't address
  the actual gap (every teacher in a school already knows every class in it), and leaves two
  role systems — course role and org role — to keep in sync forever.
- **Use better-auth's default owner/admin/member roles as-is** — rejected: "admin"/"member"
  would leak into invite emails, UI copy, and audit logs where we mean "teacher"/"student,"
  requiring the mapping to be re-explained to every future reader.
- **Allow multi-School membership (better-auth's default)** — rejected for now: nothing in the
  product today needs a person in two schools at once. Relaxing this later is easy; retrofitting
  it once real multi-School data exists would not be.

## Consequences

- `courses` needs a `schoolId` column — courses are currently global with no school scoping.
- `enrollments.role` becomes redundant: only Students get Enrollment rows now, so the column
  can eventually collapse to just `(userId, courseId)`.
- Course creation moves from "any authenticated user" to "any Teacher in the School."
- The open sign-up flow in `routes/auth.ts` stops being the onboarding path for real Schools;
  new members arrive via org invitation instead.

This closes ARCHITECTURE.md §13.2 / TODO.md gap #9 ("institution-controlled account
provisioning"). What's still open beneath it: the platform admin who can call `POST
/admin/schools` is identified by an env-var email allowlist (`auth/platform-admin.ts`), not a
real, auditable role system — a smaller follow-up, not a blocker.
