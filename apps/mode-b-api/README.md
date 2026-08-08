# @campvus/mode-b-api

Mode B's backend: the direct-upload API, auth/enrollment, and origin storage described in
[`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §3.2. Calls straight into
[`@campvus/engine`](../../packages/engine)'s `ingestBuffer` — no watcher, no polling, because
there's no external LMS to watch. This is the backend only; no UI yet.

## Stack

- **Fastify** — HTTP API framework.
- **Postgres via `postgres` (postgres.js)**, wired through Drizzle's `postgres-js` driver — a
  pure-JS driver with no native compile step (unlike `pg-native` or `better-sqlite3`, which
  fail without Visual Studio build tools; no prebuilt binary matched this machine). Connects
  using the `DATABASE_URL` env var.
- **`@node-rs/argon2`** for password hashing — a prebuilt N-API binary per platform, unlike the
  `argon2` package (same native-compile problem as `better-sqlite3`).
- **DB-backed sessions** via a signed-looking opaque cookie (`campvus_session`) — not a
  stateless JWT, so a session can be revoked by deleting its row.
- **`drizzle-kit` migrations** — `db/client.ts` runs `drizzle-orm`'s `migrate()` against the
  generated SQL in `drizzle/` on every boot, instead of the old hand-written idempotent DDL.
  After changing `src/db/schema.ts`, run `pnpm db:generate` (wraps `drizzle-kit generate`) to
  produce a new migration file, then commit it alongside the schema change.

## Setup

From the repo root: `pnpm install`. Then, from this directory:

```
npx tsx src/index.ts
```

On first run this auto-generates Mode B's own institution Ed25519 keypair (no manual
`identity.ts generate` step, unlike Mode A — a server shouldn't need an operator to run a
setup command before it can boot) and prints the public key. It listens on `PORT` (default
`3000`).

Runtime state lives alongside this app's code, not at the workspace root: `registry.json`,
`institution-keys.json`, `content-store/` (via `@campvus/engine`, same pattern as
`apps/mode-a-headless`) — plus accounts/courses/enrollments/sessions, which live in the
Postgres database pointed at by `DATABASE_URL`, not part of the engine at all.

**Mode B's keypair is separate from Mode A's.** Reconciling trust roots across modes (so the
same institution's manifests are verifiable everywhere) is Open Question #2 in the
architecture doc, not decided here.

## API

| Route | Auth | What |
|---|---|---|
| `POST /auth/register` | — | `{email, password}` → account + session cookie. Open registration for now — no institution-controlled provisioning yet (open question #6). |
| `POST /auth/login` | — | `{email, password}` → session cookie |
| `POST /auth/logout` | session | Destroys the session |
| `GET /auth/me` | session | Current user |
| `POST /courses` | session | `{id, name}` → creates a course; creator becomes its teacher |
| `GET /courses` | session | Courses the current user is enrolled in, with their role |
| `POST /courses/:courseId/enrollments` | teacher of `:courseId` | `{email, role}` → enrolls an already-registered user |
| `POST /courses/:courseId/manifests` | teacher of `:courseId` | Multipart file upload → `ingestBuffer` → signed manifest |
| `GET /courses/:courseId/manifests` | enrolled in `:courseId` | The full current manifest list for the course (§9 — what a student client syncs against) |
| `GET /content/:hash` | enrolled in the manifest's course | Raw bytes by content hash |

`GET /content/:hash` **is** the "origin" §5.6 describes — in principle, `--origin=<baseUrl>`
on Mode A's `peer-node.ts` could point straight at `<baseUrl>/content/<hash>` and get the
fallback behaviour it already implements.

**In practice, this isn't wired up yet** — two real gaps, found while smoke-testing this
integration rather than assumed away:

1. Mode A's `httpOriginFetcher` makes a plain unauthenticated request; this endpoint requires
   a session cookie. A machine-to-machine origin fetch needs its own credential story (a
   service token, most likely), not a student's session.
2. There's no manifest-sync bridge between the two products' registries — Mode A's
   `peer-node` only acts on manifests it already knows about (from its own `registry.json` or
   gossiped from a peer), so it has no way to learn about a Mode B course's manifests to know
   there's anything to fetch in the first place.

Both are real design work for whenever Mode A/Mode B interop is actually needed, not
something this backend-API-first pass tried to paper over.

## Tests

```
npx tsx --test test/*.test.ts
```

Requires `TEST_DATABASE_URL` (see `.env.example`) — a disposable Postgres instance the suite
can freely create/drop databases on. Each `createTestApp()` call CREATE DATABASEs a uniquely
named database for isolation (mirroring the old per-test `:memory:` SQLite behaviour) and
drops it once the importing test file's suite finishes.

Fastify's `.inject()` — no real network port. Covers register/login/logout, course
creation + enrollment authorization, upload → manifest → content round trip, enrollment
gating on `/content/:hash`, and the hash-format validation that closes off path traversal
through that same route (`hash` is user-controlled input; `/^[0-9a-f]{64}$/` is enforced
before any filesystem lookup).
