# 02 — Teacher invites; one-School-per-person

**What to build:** any Teacher (Owner included) can invite a new Teacher or Student into their
School by email, using better-auth's native invite/accept flow — already role-gated by ticket
01's access-control config. Students are denied when they attempt to invite. A new
invitation-accept lifecycle hook rejects the accept if the accepting person is already an
accepted member of any other School, enforcing that a person belongs to exactly one School.

**Blocked by:** 01

- [ ] A Teacher can invite another Teacher by email; that person can accept and their role is
      `teacher`
- [ ] A Teacher can invite a Student by email; that person can accept and their role is `student`
- [ ] An invited email with no existing account can sign up after being invited and then see and
      accept the pending invitation
- [ ] A Student attempting to invite anyone is denied
- [ ] A person who is already an accepted member of School A has their attempt to accept an
      invitation to School B rejected
- [ ] Tests use the existing `createTestApp()` + `app.inject()` HTTP seam throughout
