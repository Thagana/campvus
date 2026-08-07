Status: ready-for-agent

# Mode A Pilot Readiness

See `docs/ARCHITECTURE.md` (§5.1, §8, §13.1), [ADR-0006](../../docs/adr/0006-real-discovery-tiers.md),
and `docs/research/moodle-api-integration.md` for the background this spec builds on.

## Problem Statement

`packages/engine`'s distribution engine is built and tested — signing, dedup, trust model, tiered
discovery, origin fallback, offline catch-up. But three concrete gaps still block Mode A from
being usable in a real pilot, all called out in `docs/ARCHITECTURE.md` §13.1 and Open Question #4:

1. Ingestion is still a manual CLI trigger (`npx tsx src/watcher.ts <courseId> <path>`) — there is
   no real LMS integration, so no lecturer's actual upload is ever detected automatically.
2. `apps/mode-a-desktop` has no configuration surface at all — `courseId`,
   `institutionPublicKeyHex`, `originUrl`, and `maxStoreBytes` are read from raw environment
   variables at module load (`main.ts:29-32`), and the app is permanently stuck in an error state
   if `CAMPVUS_INSTITUTION_PUBLIC_KEY` isn't set. A pilot student installing the packaged app has
   no way to configure it. Worse, the engine's Tier 2 `region` option
   (`SwarmNodeOptions.region`, `swarm-node.ts:67`) is already implemented and reachable from the
   CLI (`peer-node.ts --region=<tag>`), but `apps/mode-a-desktop` never passes it — the desktop
   app can only ever join Tier 1 (LAN) and Tier 3 (wide DHT), never Tier 2 (local cluster).
3. Discovery has only been validated on a single same-Wi-Fi LAN test between two laptops.
   Cross-network conditions — different Wi-Fi networks, a mobile hotspot, campus NAT/firewall
   traversal — are still untested, per Open Question #4's remaining half and ADR-0006's
   "Consequences" section.

Closing these three is what "Phase 1: Mode A pilot readiness" means.

## Solution

Four pieces of work, tracked as separate tickets since they touch different modules and have
different blocking relationships:

- **01 — Desktop app configuration.** Replace the env-var-only config in `apps/mode-a-desktop`
  with a persisted per-user config file plus an in-window settings screen, so a pilot participant
  can configure the app after install without touching environment variables.
- **02 — Wire Tier 2 region into the desktop app** (blocked by 01). Extend the new config
  surface with the `region` field the engine already supports, so `apps/mode-a-desktop` can
  actually join a local-cluster topic like the CLI already can.
- **03 — Real Moodle LMS watcher.** Replace the manual CLI ingestion trigger with a real poller
  against Moodle's Web Services REST API, per `docs/research/moodle-api-integration.md`'s
  findings (token-based service-account auth, no core rate limit, 2–5 minute polling cadence,
  webhook plugins not viable/too heavy a lift for v1).
- **04 — Cross-network discovery field validation** (manual, not code). A test plan executed on
  real separate networks, using the existing CLI (`peer-node.ts`, which already supports
  `--region`) — doesn't need 01/02 to be built first.

## User Stories

1. As a pilot student, I want to open the desktop app and enter my course ID, institution public
   key, and (optionally) an origin URL through a settings screen, so that I can configure the app
   without knowing what an environment variable is.
2. As a pilot student, I want my settings to persist across app restarts, so that I only configure
   the app once.
3. As a pilot student who hasn't configured the app yet, I want a clear "not configured, click here
   to set up" state instead of a silent error, so that I know what to do next.
4. As a pilot student, I want to enter a region tag in the same settings screen, so that my laptop
   can find peers on the same local cluster (e.g. same residence) even when they're not on the
   exact same Wi-Fi network.
5. As a developer, I want changing settings to restart the running swarm engine with the new
   values without requiring an app relaunch, so that the settings screen actually takes effect.
6. As a lecturer, I want a file I upload to Moodle to be detected and distributed automatically
   within a few minutes, without any manual step on my part, so that Mode A behaves like a real
   product, not a spike.
7. As a developer, I want the Moodle poller to avoid re-ingesting a file it's already seen, so
   that repeated polling doesn't create duplicate manifests or redundant hash/sign work.
8. As a developer, I want the Moodle poller to authenticate as a dedicated service-account token
   (`wstoken`), not a real teacher's personal login, so that credential scope matches Moodle's own
   recommended integration pattern.
9. As the person running the pilot, I want a written test plan (not just a design doc) for
   confirming discovery works across different Wi-Fi networks, a mobile hotspot, and campus
   NAT/firewall conditions, so that Open Question #4 can actually be closed instead of staying
   theoretical.

## Implementation Decisions

### 01 — Desktop app configuration
- New module `apps/mode-a-desktop/src/config.ts`: pure-ish `loadConfig(filePath)` /
  `saveConfig(filePath, config)` functions operating on a JSON file
  (`campvus-config.json`) written to the same Electron `userData` directory `paths.ts` already
  resolves for `registry.json`/`content-store/`/`institution-keys.json` — not part of
  `@campvus/engine`'s `Paths` type, since this config is desktop-app-specific, not shared with
  the CLI or Mode B.
- **Env vars become the fallback default, not removed.** On first launch, if no config file
  exists yet, seed it from `CAMPVUS_COURSE_ID`/`CAMPVUS_INSTITUTION_PUBLIC_KEY`/
  `CAMPVUS_ORIGIN_URL`/`CAMPVUS_MAX_STORE_BYTES` if present (keeps existing pilot installs and
  the `npm start` dev script working unchanged); the config file takes precedence once it exists.
- `main.ts`'s top-level swarm-node construction (currently module-load-time code,
  `main.ts:50-65`) becomes a `startEngine(config)` function callable both at app startup and
  again whenever settings are saved — stop the existing `SwarmNode` (if any), rebuild via
  `createSwarmNode()` with the new config, re-wire `createAgent()` and the `onStateChange`
  listener, and restart. This is the one non-additive change in this ticket — `main.ts` needs
  restructuring, not just new code alongside it.
- New IPC channels added to `preload-api.ts`'s `CampvusApi` (`getConfig`, `saveConfig`) and
  wired through `preload.ts`'s `contextBridge`, following the existing `getState`/`onStateChange`
  pattern.
- Settings UI lives in the existing single window (ADR-0003 — no second `BrowserWindow`), as a
  toggleable panel alongside the current status view, wired in `renderer.ts` the same way
  `status-view.ts` is: a pure `settings-view.ts` module for validation/formatting (testable), thin
  DOM glue in `renderer.ts` (not unit tested, matching the existing convention — no test file
  exists for `renderer.ts` today either).
- Validate the institution public key's hex format before accepting a save (reuse whatever format
  check `@campvus/engine`'s `crypto-utils.ts` already applies internally) and show an inline
  error rather than silently accepting a bad value and only failing later inside the engine.

### 02 — Wire Tier 2 region into the desktop app
- Blocked by 01 — adds one more field (`region`, optional, freeform string) to the same config
  file/settings screen 01 introduces, and passes it through to `createSwarmNode({ ..., region })`
  in `main.ts`'s `startEngine`.
- Surface whether a region is actually joined in the status view (e.g. status detail text or
  tooltip), since Tier 2 having zero visible effect today is part of why it went unwired in the
  first place — the desktop app should show whatever `swarm-node.ts:311`'s "Joined regional
  swarm topic" log line reports, via an existing or new `AgentEngineEvents` callback rather than
  reading `console.log` output.

### 03 — Real Moodle LMS watcher
- New module `apps/mode-a-headless/src/moodle-client.ts`: a thin REST client against
  `<baseUrl>/webservice/rest/server.php?wstoken=<token>&moodlewsrestformat=json&wsfunction=...`,
  calling `core_course_get_contents` to list a course's files (per-section modules/resources,
  each with a Moodle `fileurl`, `filename`, `timemodified`). File bytes are fetched from the
  returned `fileurl` with `?token=<wstoken>` appended, per Moodle's documented `pluginfile.php`
  auth pattern.
- New module `apps/mode-a-headless/src/moodle-watcher.ts`: a poller — on each tick, fetches the
  course's current file list, diffs against a locally persisted "seen" set keyed by Moodle's own
  `(fileurl, timemodified)` pair (not campvus's content hash, which only exists after ingest — the
  point is to avoid re-downloading bytes for files already ingested, not just avoiding duplicate
  manifests after the fact), downloads anything new/changed, and calls the exact same
  `ingestFile`/`ingestBuffer` from `@campvus/engine` the existing manual `watcher.ts` calls today
  — the adapter's job still ends at "fetch, hash, sign, publish" per ARCHITECTURE.md §5.1.
- Config (course-to-Moodle-course-ID mapping, base URL, `wstoken`, poll interval): env vars /
  CLI flags, matching the existing flag pattern (`--origin-timeout-ms`, etc.) rather than
  introducing a new config format for this one adapter.
- **Poll interval defaults to 3 minutes**, configurable, per
  `docs/research/moodle-api-integration.md` §3's recommended 2–5 minute non-abusive range (no
  Moodle-imposed rate limit exists, but shared hosting has real CPU/process budget constraints).
- Auth is a dedicated service-account `wstoken`, per the research's finding #4 — no OAuth2
  client-credentials path exists for this purpose in Moodle core, so this isn't a design choice
  with an alternative, it's the only mechanism Moodle actually offers.
- The existing manual CLI trigger (`apps/mode-a-headless/src/watcher.ts`) stays as-is for
  dev/testing convenience — this ticket adds a new poller entrypoint, it does not remove the
  manual one.
- **Webhook-based ingestion (the `tool_trigger` plugin) is explicitly out of scope for this
  ticket** — see Out of Scope below.

### 04 — Cross-network discovery field validation
- Not a code change. A written test plan plus a place to record results: same-network Tier 1
  confirmed already (§13.1); this ticket's job is confirming Tier 2 (region-tagged topic, two
  machines on *different* LANs with the same `--region` value) and Tier 3 (wide DHT across
  genuinely separate networks — different Wi-Fi, a mobile hotspot, campus NAT/firewall) using two
  physical machines running the existing `peer-node.ts` CLI directly — it already supports
  `--region`, so this doesn't need 01/02 built first.
- Record results as an update to `docs/ARCHITECTURE.md` Open Question #4 (mirroring how the
  same-Wi-Fi Tier 1 result was already recorded there) once run.

## Testing Decisions

- **01/02**: `config.ts`'s `loadConfig`/`saveConfig` and the new `settings-view.ts` validator are
  pure functions — test them directly with a temp directory, the same style as
  `packages/engine/test/eviction.test.ts` and `apps/mode-a-desktop/test/status-view.test.ts`.
  `main.ts`'s `startEngine` restructuring and the IPC wiring itself are not unit tested, matching
  this app's existing convention (no test file covers `main.ts` today either — Electron
  main-process wiring isn't part of this app's test seam).
- **03**: `moodle-client.ts` and `moodle-watcher.ts` are pure/testable against a fake HTTP
  server standing in for Moodle's REST shape (same spirit as `apps/mode-b-api`'s real-server,
  `.inject()`-based tests — spin up a minimal local HTTP server responding with Moodle-shaped
  JSON, not a mock of the client's own fetch calls). New test directory
  `apps/mode-a-headless/test/` (none exists yet) using `tsx --test`, matching every other
  package's test runner in this repo.
- **04**: no automated test — the deliverable is a written procedure and a results record, not
  code coverage.
- **Prior art**: `packages/engine/test/lan-discovery.test.ts` and `manifest-sync.test.ts` for the
  general style of testing engine-adjacent networking code without a real network; `apps/mode-b-api/test/*.test.ts`
  for the "real server, no mocking" seam philosophy this repo prefers throughout.

## Out of Scope

- Webhook-based Moodle ingestion via the `tool_trigger` plugin — the research doc flags it as the
  credible option *if* a webhook were chosen, but it requires the pilot institution's Moodle admin
  to install and configure a third-party plugin, which is a bigger organizational ask than
  polling with a service-account token. Revisit only if 3-minute polling latency proves
  insufficient in the actual pilot.
- Any UI polish beyond a functional settings screen (no theming pass, no onboarding wizard).
- macOS/Linux network-metering detection — unrelated gap, tracked separately (Phase 4 of the
  broader roadmap).
- Mode A ↔ Mode B interop (service-token origin auth, manifest-sync bridge) — tracked separately
  as Phase 2 of the broader roadmap; this spec's origin-fallback config field only needs to point
  at *some* HTTP origin, not specifically a live `apps/mode-b-api` instance.
- KMS/HSM key custody — out of scope everywhere until Phase 4.

## Further Notes

- This spec covers Phase 1 of the roadmap discussed for Mode A pilot readiness; Phases 2-5
  (Mode A↔B interop, completing Mode B, production hardening, business validation) are tracked
  separately and are not blocked by this work.
- Ticket 03 directly answers the "informs the real LMS integration" line in
  `docs/research/moodle-api-integration.md`'s own purpose statement — that research is a
  prerequisite this spec builds on, not parallel work.
