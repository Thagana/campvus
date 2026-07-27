Status: ready-for-agent

# Schools as Organizations (Mode B auth/enrollment redesign)

See [ADR-0005](../../docs/adr/0005-schools-as-organizations-fixed-roles.md) and
[CONTEXT.md](../../CONTEXT.md) (School, Teacher, Student, Owner, Enrollment, Institution) for
the domain vocabulary this spec uses throughout.

## Problem Statement

Today, Mode B's registration is open to anyone, any authenticated user can create a Course,
and role is tracked per-Course (`enrollments.role`) rather than per-person. None of this models
a real school: a school has a fixed staff/student population that the school itself controls,
not an open sign-up list, and every Teacher in a school already knows about every class in it —
yet today a Teacher must be separately re-added to each individual Course, even within the same
school, and there's no way to represent "this account belongs to this school" at all. Courses
and accounts have no school-scoping in the schema today.

## Solution

Introduce School as the enrollment boundary, backed by better-auth's Organization feature. We
(system admins) create a School and seed its founding Teacher as Owner via an internal script —
never through in-app self-service sign-up. From there, School management is self-service for
Teachers: any Teacher can invite new Teachers or Students by email, any Teacher can change any
other member's role between Teacher and Student (except the School's last Teacher can't be
demoted or removed), and any Teacher automatically has access to every Course in their School —
no more re-adding a teacher per course. Students still only see and access the specific Courses
they hold an Enrollment in. A person belongs to exactly one School, enforced when they accept
an invitation.

## User Stories

1. As a system admin, I want to create a new School and designate its founding Teacher by
   email, so that a school can start using Mode B without any self-service sign-up path existing.
2. As the founding Teacher of a new School, I want to sign up (or sign in, if I already have an
   account) and see a pending invitation making me the School's Owner, so that I can start
   managing my school without the system admin creating my account for me.
3. As a Teacher, I want to invite another Teacher into my School by email, so that I can share
   management of the school with a colleague.
4. As a Teacher, I want to invite a Student into my School by email, so that they can access the
   courses I enroll them in.
5. As a Student, I want to be prevented from inviting anyone, so that only Teachers can grow the
   School's membership.
6. As an invited person with no existing account, I want to sign up with the invited email and
   then see and accept my pending invitation, so that I don't need an account before being invited.
7. As an invited person who already has a Mode B account, I want to see and accept a pending
   invitation the next time I'm signed in, so that joining a School doesn't require a new account.
8. As a person who already belongs to a School, I want any attempt to accept an invitation to a
   second School to be rejected, so that the one-School-per-person rule can't be violated.
9. As a Teacher, I want to promote a Student in my School to Teacher, so that I can share
   management responsibilities as trust grows.
10. As a Teacher, I want to demote another Teacher in my School to Student, so that I can correct
    a mistaken invite or reflect a role change.
11. As a Teacher, I want an attempt to demote or remove the School's last remaining Teacher to be
    rejected, so that a School can never end up with nobody able to manage it.
12. As a Teacher, I want to create a Course, so that I can start distributing materials for a
    class.
13. As a Teacher, I want Course creation to require that I'm a Teacher in a School, so that
    random authenticated accounts (with no School) can't create Courses.
14. As a Teacher, I want a Course I create to automatically belong to my School, so that I never
    have to specify which school it's for.
15. As a Teacher, I want to see and manage every Course that belongs to my School automatically,
    without being individually added to each one, so that joining a school's staff is enough to
    do my job.
16. As a Student, I want to see and access only the Courses I hold an Enrollment in, so that I
    don't see every class in the school, only mine.
17. As a Teacher, I want to enroll a Student in one of my School's Courses by email, so that they
    gain access to that specific class's materials.
18. As a Teacher, I want enrolling a Student who isn't a member of my School yet to fail clearly,
    so that I understand they need to be invited to the School first, not just the Course.
19. As a Student, I want to be denied if I try to create a Course, so that Course creation stays
    a Teacher-only action.
20. As a Student, I want to be denied access to a Course I don't hold an Enrollment in, so that
    course content stays scoped to the students actually taking it.
21. As anyone without a School membership, I want every School-scoped and Course-scoped action to
    be denied, so that having a Mode B account alone grants no access to anything.
22. As a Teacher who gets demoted to Student, I want to immediately lose Teacher-level access
    (course creation, inviting, role changes) on my very next request, so that role changes take
    effect right away, not just at next sign-in.
23. As a system admin, I want the school-creation operation to be a script I run directly (no
    HTTP endpoint, no in-app admin role), so that school creation never becomes part of the
    public attack surface.
24. As a developer, I want the school-creation script's core logic exposed as a plain function
    (not just a CLI entrypoint), so that it can be exercised directly without shelling out to a
    subprocess.
25. As a Teacher, I want to remove a member from my School entirely (not just demote them), so
    that I can offboard someone who's left, subject to the same last-Teacher protection as
    demotion.

## Implementation Decisions

- **Modules touched:** `auth/auth.ts` (register better-auth's `organization` plugin, replacing
  its default owner/admin/member roles with custom owner/teacher/student roles via the plugin's
  access-control API, plus lifecycle hooks — see below), `auth/guards.ts` (replace per-Course
  role lookup with School-membership + Course-scope checks), `db/schema.ts` (add the
  organization plugin's own tables — organization, member, invitation — and a `schoolId` column
  on `courses`), `routes/courses.ts` (course creation and access now gated by School role, not
  open to any authenticated user).
- **New module:** a school-creation script exposing an exported function (plus a thin CLI
  entrypoint that calls it) that creates the Organization and creates a pending Owner-role
  Invitation for the founding Teacher's email. The founding Teacher onboards through the
  ordinary sign-up-then-accept-invitation flow like anyone else — there's no special-cased
  account creation for Owners.
- **Sign-up stays open** at the account level (better-auth's existing email/password endpoint
  is unchanged). An account with no School membership can authenticate but has no capabilities —
  sees no Courses, can create none — until it accepts a pending Invitation tied to its email.
- **Invitations follow better-auth's native behavior**: an email with no existing account can
  still be invited; that person signs up afterward and then sees the pending Invitation.
- **One-School-per-person** is enforced in an invitation-accept lifecycle hook: reject the
  accept if the accepting user is already an accepted member of any other School.
- **Last-Teacher guard** is enforced in lifecycle hooks on both role-update and member-removal:
  reject either action if it would leave the School with zero Teacher/Owner members.
- **Role mapping:** Owner and Teacher carry identical permissions (invite, create Course, change
  roles, remove members); Owner is distinguished only by how it's assigned — exclusively via the
  founding Invitation the school-creation script creates, never through a regular in-School
  invite or role-change. Any Teacher (Owner included) can invite and can change any other
  member's role, subject to the last-Teacher guard. Students can do neither.
- **Course-School linkage:** `courses.schoolId` is always inferred server-side from the creating
  Teacher's own School membership — never a client-supplied field, since that would let a
  Teacher stamp a Course into a School they don't belong to.
- **Course access:** a Teacher's access to a Course is derived purely from `course.schoolId`
  matching their School membership (no per-Course row needed for Teachers at all). A Student's
  access requires an `enrollments` row for that specific Course.
- **Deriving the caller's School:** since a person belongs to at most one School, guard logic
  looks up the caller's single membership row directly rather than using better-auth's
  session-level "active organization" switching concept, which exists for multi-org UX this
  product doesn't need.
- **`enrollments.role` becomes vestigial**, not removed: only Students get Enrollment rows now
  (Teachers never do), so the column is only ever written as `'student'`. Actually dropping the
  column is a later cleanup (see Out of Scope), not required here.

## Testing Decisions

- **Two seams**, confirmed with the user before writing this spec:
  1. The existing `createTestApp()` + `app.inject()` HTTP seam (already used by
     `auth.test.ts` and `courses.test.ts`) — reused for everything reachable over HTTP:
     sign-up, invitation accept, role changes, Course creation, Course access.
  2. A direct function-call seam for the school-creation script only, since it deliberately has
     no HTTP route — tests import its exported function directly and assert on DB state via the
     same `db` handle `createTestApp()` already returns.
- **What makes a good test here:** assert observable behavior only — HTTP status codes and
  response bodies, and what a *subsequent* request can or can't do (e.g. a demoted Teacher
  losing course-creation rights on their next request) — never assert against internal DB rows
  except for the school-creation script's own output, where DB state is the only observable
  surface (there's no HTTP layer around that step until the founding Teacher signs up).
- **Prior art:** `apps/mode-b-api/test/auth.test.ts` and `test/courses.test.ts` are the direct
  templates for shape and style — real server, in-memory DB, actual HTTP requests and cookies,
  no mocking of better-auth or the database.
- **Modules to test:** the organization plugin configuration in `auth/auth.ts` (custom roles,
  both lifecycle hooks), the rewritten guards in `auth/guards.ts`, the updated behavior in
  `routes/courses.ts`, and the school-creation script.

## Out of Scope

- Any UI changes in `apps/mode-b-web` (invite-sending screens, accept-invitation screens,
  role-management UI) — this spec is the API/auth model only.
- Email delivery for invitations — better-auth records the Invitation; there's no outbound
  email service in this pilot, so an invited person learns about it out-of-band or by checking
  after signing in.
- Migrating existing pilot data — today's `courses`/`enrollments` rows have no School. This spec
  designs the model going forward; backfilling or migrating existing rows is not covered.
- A platform-admin role or UI for School creation — explicitly deferred; creation stays an
  internal script per the earlier design decision.
- Multi-School membership and School hierarchies (e.g. a district owning multiple Schools) —
  explicitly rejected in ADR-0005 for now.
- Actually dropping the `enrollments.role` column — left as a later cleanup once it's vestigial,
  not required by this spec.

## Further Notes

- This closes ARCHITECTURE.md's open question #6 (Mode B auth/enrollment ownership).
- "Institution" (the manifest-signing keypair/trust root in `@campvus/engine`, used by both Mode
  A and Mode B) is a distinct, unrelated concept from School — see CONTEXT.md. Nothing in this
  spec touches keypairs or manifest signing.
- better-auth `^1.6.25` (already a dependency) ships the `organization` plugin used here.
