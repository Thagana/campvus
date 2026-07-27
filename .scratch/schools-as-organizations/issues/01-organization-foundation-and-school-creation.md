# 01 — Organization foundation + School creation

**What to build:** better-auth's `organization` plugin, wired in with custom `owner`/`teacher`/
`student` roles replacing its default owner/admin/member. Self-serve organization creation is
blocked at the HTTP layer — the only way a School comes into existence is the new
school-creation script (an exported function, plus a thin CLI entrypoint that calls it), which
creates the Organization and a pending Owner-role Invitation for a given founding Teacher's
email. That founding Teacher then signs up (or signs in) and accepts the invitation through
better-auth's ordinary flow to become Owner — no special-cased account creation.

**Blocked by:** None — can start immediately

**Status:** done (commit `1f19f1a`)

- [x] `organization` plugin registered in the auth instance with custom access-control roles
      `owner`, `teacher`, `student` (no `admin`/`member` roles remain reachable)
- [x] better-auth's own organization/member/invitation schema tables exist and match what the
      plugin expects
- [x] Hitting the plugin's create-organization HTTP action as a regular authenticated user is
      refused — there is no self-serve path to creating a School
- [x] The school-creation script's core logic is an exported function callable directly (not
      only reachable via a CLI subprocess), and creates: one Organization, and one pending
      Invitation scoped to the `owner` role for the founding Teacher's email
- [x] End-to-end: after running the script, the founding Teacher can sign up with the invited
      email, see the pending invitation, accept it, and their membership role is `owner`
- [x] Tests use the existing `createTestApp()` + `app.inject()` HTTP seam for everything
      reachable over HTTP, and call the script's exported function directly (asserting on DB
      state via the same `db` handle) for the school-creation step itself
