# Mode A desktop (`campvus-p2p`)

Mode A's near-term companion app — an Electron tray app that wraps [`@campvus/engine`](../../packages/engine)
directly to join the peer-to-peer swarm for a student's enrolled courses. Tray-only until
opened; no separate server. See ADR-0001/0003/0004 in [`docs/adr`](../../docs/adr) and
[`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

## Setup

From the repo root: `pnpm install`. Then, from this directory:

```
pnpm start
```

`start` bakes in a default `CAMPVUS_INSTITUTION_PUBLIC_KEY` for local dev convenience (see
`package.json`) — override it, and the other env vars below, as needed.

## Configuration

Engine config (course IDs, institution public key, origin URLs, region, max store bytes) can
come from either:

- **Env vars** at first run — `CAMPVUS_COURSE_IDS` (comma-separated),
  `CAMPVUS_INSTITUTION_PUBLIC_KEY`, `CAMPVUS_ORIGIN_URL`, `CAMPVUS_MANIFEST_ORIGIN_URL`,
  `CAMPVUS_REGION`, `CAMPVUS_MAX_STORE_BYTES` (see `src/main.ts`).
- **The window's Settings panel**, which persists to `desktop-config.json` in Electron's
  per-user `userData` directory (`src/paths.ts`, `src/config-store.ts`) and can restart the
  engine without relaunching the app. This is the source of truth once it exists — env vars
  are only first-run defaults (gap #12, `docs/TODO.md`).

Runtime state (`registry.json`, `institution-keys.json`, `content-store/`) also lives under
`userData`, not next to the installed app code — that directory may not be writable and gets
wiped on reinstall/update.

To try the P2P sync yourself, run this app alongside a headless peer-node (or a second
desktop instance) on the same course/network:

```
CAMPVUS_COURSE_ID=COMSCI214 CAMPVUS_INSTITUTION_PUBLIC_KEY=<paste from apps/mode-a-headless/institution-keys.json> pnpm start
```

The tray should show real peer counts and sync status instead of "idle, 0 peers".

## Observability (Sentry)

- `src/observability.ts` calls `Sentry.init()` in the main process — but only when
  `SENTRY_DSN` is set. No DSN (local dev without a `.env`, CI on a forked PR with no exposed
  secrets) means `Sentry.init` is never called at all, a true no-op.
- `src/sentry-scrub.ts` is the PII backstop, applied via `beforeSend`/`beforeBreadcrumb`:
  redacts bearer tokens, emails, and any object key matching
  `password|token|authorization|secret|email`, on top of narrowing what the SDK's http/net
  integrations collect in the first place (`dataCollection` options in `observability.ts`).
  Kept Electron-free so it's testable under plain `tsx --test` (`test/sentry-scrub.test.ts`).
- `vite.sentry-plugin.ts` wires `@sentry/vite-plugin` into all three Vite configs
  (main/preload/renderer) to upload sourcemaps and tag the release — gated on
  `SENTRY_AUTH_TOKEN` being set, same no-op discipline as the DSN guard. Uploaded sourcemaps
  are deleted after upload so they never ship inside the packaged asar.

Local dev: put `SENTRY_DSN` (and, to test sourcemap upload, `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG`, `SENTRY_PROJECT`) in a gitignored `.env` in this directory. CI supplies the same
vars as secrets/vars (see `.github/workflows/desktop-ci.yml`) and no-ops cleanly when absent.

## Packaging (`electron-forge make`)

```
pnpm package   # electron-forge package — build only, no installers
pnpm make      # electron-forge make — build + platform installers (.exe/.nupkg, .zip, .deb, .rpm)
```

`forge.config.ts` covers a few things beyond the Vite plugin defaults:

- **`executableName: 'campvus-p2p'`** — electron-packager otherwise names the binary after
  `productName` ("campvus"), but the Linux deb/rpm installers expect a binary matching
  `package.json`'s `name` ("campvus-p2p") and fail to find it without this.
- **Dependency closure copy** — `hyperswarm`'s native-addon dependency tree isn't bundleable
  by Vite (see `vite.main.config.ts`'s `external`), and electron-packager only copies this
  app's own directory, not pnpm's hoisted root `node_modules`. An `afterCopy` hook walks
  Node's own resolution algorithm to copy the whole runtime dependency closure in.
- **Foreign prebuild pruning** — those native packages (`udx-native`, `sodium-native`, ...)
  ship `prebuildify`-style binaries for every platform they support. Each CI job only
  packages for its own host platform/arch, so a second `afterCopy` hook deletes every
  `prebuilds/<platform>-<arch>` variant except the one being built — otherwise they're dead
  weight, and on Linux, `rpmbuild`'s auto-strip pass fails outright trying to strip a
  foreign-format binary (e.g. `android-arm`) it doesn't recognize.
- **Locale pruning** — the app has no i18n, so a separate `afterCopy` hook deletes all of
  Chromium's bundled locale `.pak` files except `en-US.pak` (~46MB saved).

Building deb/rpm packages requires `dpkg`/`rpmbuild` + `fakeroot`, which `ubuntu-latest`
doesn't ship by default — see the `apt-get install rpm fakeroot` step in
`.github/workflows/desktop-ci.yml`. That means deb/rpm makers can't run on Windows or macOS
dev machines; `pnpm make` on those platforms only produces their native installer
(Squirrel/`.zip` respectively).

## Tests

```
pnpm test         # tsx --test test/*.test.ts
pnpm typecheck    # tsc --noEmit
```
