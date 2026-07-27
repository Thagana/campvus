# 03 — Role changes + last-Teacher guard

**What to build:** any Teacher can change another member's role between Teacher and Student, or
remove a member from the School entirely, using better-auth's native role-update/remove-member
actions. New lifecycle hooks on both actions reject any change that would leave the School with
zero Teacher/Owner members, so a School can never end up with nobody able to manage it.

**Blocked by:** 02 (needs a second member in a School to promote/demote/remove)

- [ ] A Teacher can promote a Student in their School to Teacher
- [ ] A Teacher can demote another Teacher in their School to Student
- [ ] A Teacher can remove another member from the School entirely
- [ ] Attempting to demote the School's last remaining Teacher to Student is rejected
- [ ] Attempting to remove the School's last remaining Teacher is rejected
- [ ] A demoted Teacher immediately loses Teacher-level access (course creation, inviting, role
      changes) on their very next request
- [ ] Tests use the existing `createTestApp()` + `app.inject()` HTTP seam throughout
