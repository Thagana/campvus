# Campvus

Campus P2P content distribution, spanning two product modes sharing one distribution engine
(see `docs/ARCHITECTURE.md`). This glossary currently covers Mode B's auth/identity domain
only — Mode A borrows enrollment from the host LMS and has no accounts of its own.

## Language

**School**:
A Mode B customer, modeled as a better-auth Organization: the auth/enrollment boundary that
Teachers and Students belong to. Created only by us (system admins) via an internal script —
never through in-app self-service sign-up. See
[ADR-0005](./docs/adr/0005-schools-as-organizations-fixed-roles.md).
_Avoid_: Org (the underlying better-auth mechanism; School is the domain term). Not to be
confused with **Institution** below — they coincide one-to-one in Mode B today, but are
different layers.

**Institution**:
The holder of the manifest-signing keypair/trust root (`ensureInstitutionKeypair`,
`paths.keyFile`) — an engine-level (`@campvus/engine`) concept that predates Schools and
applies to Mode A too, which has no Schools at all. ARCHITECTURE.md's open question #2
("multi-institution model") is about this keypair, not about auth. In Mode B, a School and
its Institution keypair happen to be the same real-world customer, but the code paths are
independent — renaming one doesn't rename the other.
_Avoid_: Using "Institution" for the auth/enrollment concept — that's School.

**Teacher**:
A School member with access to every Course in that School, and the ability to invite new
members, create Courses, and change any other member's role — except a change that would leave
the School with zero Teachers. A custom better-auth organization role.
_Avoid_: Admin, staff

**Student**:
A School member whose access is limited to the specific Courses they hold an Enrollment in.
A custom better-auth organization role.
_Avoid_: Learner, member

**Owner**:
The Teacher seeded automatically when a School is created — the only School member who joins
without being invited by another Teacher. Otherwise carries the same permissions as any Teacher.
_Avoid_: Admin

**Enrollment**:
A Student's membership in one specific Course. Teachers never hold an Enrollment — their
School-wide Teacher role already grants access to every Course in their School.
_Avoid_: Course role (role no longer varies per course — see ADR-0005)
