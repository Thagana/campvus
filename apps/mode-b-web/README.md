# @campvus/mode-b-web

Mode B's teacher UI — login/register, create and manage courses, upload course files,
enroll students, and (for platform admins) create schools and view their rosters. Talks to
[`@campvus/mode-b-api`](../mode-b-api) over plain HTTP; no P2P here, so a browser app is
sufficient (see the student client note below).

## App structure

- `src/router.tsx` — a small hand-rolled client-side router (History API + `popstate`, no
  external router dependency). Routes: `/` (courses), `/course/:courseId`, `/platform-admin`
  (schools list), `/platform-admin/schools/:schoolId` (roster). `App.tsx` reads
  `/accept-invite` and `/reset-password` directly from `window.location` instead, since those
  are always a fresh page load from an emailed link, never a client-side transition.
- `src/pages/` — one component per route (`CoursesPage`, `CourseDetailPage`, `AdminPage`,
  `SchoolRosterPage`, plus the two email-link pages above and `LoginPage`).
  `AdminPage`/`SchoolRosterPage` are gated by the backend (`CAMPVUS_ADMIN_EMAILS` allowlist,
  `routes/admin.ts` in `mode-b-api`), not by anything in the client session payload — a
  non-admin just sees a clean "you don't have access" state rather than a broken screen.
- `src/components/` — shared UI: `Sidebar`, `Modal`, `Toast`, `Dropzone`, `Breadcrumb`,
  `EmptyState`, `Spinner`, `CopyButton`.
- `src/hooks/useAsyncForm.ts` — shared submit/error/loading state for the app's forms.

## Setup

From the repo root: `pnpm install`. Then, with `apps/mode-b-api` running separately
(`cd ../mode-b-api && npx tsx src/index.ts`, defaults to port 3000):

```
npx tsx vite   # or: npx vite
```

Opens on Vite's dev port (usually 5173). API calls (`/auth`, `/courses`, `/content`) are
proxied to `http://localhost:3000` by `vite.config.ts` — same-origin from the browser's
point of view, so cookies/CORS are never an issue. Set `MODE_B_API_URL` if the API runs
somewhere else.

## Build for production

```
npx vite build
```

Writes `dist/`. `apps/mode-b-api`'s server serves this directory as static assets
automatically if it exists (`@fastify/static`, guarded — a checkout without a build still
boots the API fine). So in production, one process (`mode-b-api`) serves both the API and
this UI, same-origin, no separate web server needed.

## Why no student UI here

A real Mode B student client needs actual swarm participation — peer discovery, download,
seeding (§5.5 in the architecture doc) — not just centralized downloads from the origin
endpoint. Browsers can't run Hyperswarm (it needs raw UDP for DHT/holepunching), which is
exactly why Mode A's client is Electron (`apps/mode-a-desktop`), not a web app. A Mode B
student app would need the same kind of shell. Not built yet — see the architecture doc §13.2.

## Verification note

Typechecked and built cleanly (`tsc --noEmit`, `vite build`), and the full teacher flow
(register → create course → upload → list manifests → enroll) was re-driven with curl
against a live `mode-b-api` server, hitting the exact routes/payloads this app's `src/api.ts`
uses. **It has not been visually verified in an actual browser** — no browser-automation
tool was available when this was built. Open `npx vite` yourself and click through it before
treating the UI itself (not just the API wiring) as proven.
