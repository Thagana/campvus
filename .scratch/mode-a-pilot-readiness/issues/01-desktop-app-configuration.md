# 01 — Desktop app configuration

**What to build:** A persisted per-user config file (`campvus-config.json` in Electron's
`userData` dir) plus an in-window settings screen for `courseId`, `institutionPublicKeyHex`, and
`originUrl`/`maxStoreBytes`, replacing today's env-var-only setup (`main.ts:29-32`). Existing env
vars (`CAMPVUS_COURSE_ID`, `CAMPVUS_INSTITUTION_PUBLIC_KEY`, `CAMPVUS_ORIGIN_URL`,
`CAMPVUS_MAX_STORE_BYTES`) seed the config file on first launch if it doesn't exist yet, so
existing installs and the `npm start` dev script keep working unchanged. Saving settings restarts
the running swarm engine with the new values, without requiring an app relaunch.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `apps/mode-a-desktop/src/config.ts` exports `loadConfig(filePath)` / `saveConfig(filePath,
      config)`, pure functions operating on a JSON file, unit tested with a temp directory
- [ ] On first launch with no config file present, `loadConfig` seeds from the existing
      `CAMPVUS_*` env vars if set; once a config file exists, it takes precedence
- [ ] `main.ts`'s swarm-node construction is restructured into a `startEngine(config)` function
      (stop any existing `SwarmNode`, rebuild via `createSwarmNode()`, re-wire `createAgent()` and
      the `onStateChange` listener, start) callable both at app startup and again whenever
      settings are saved
- [ ] New IPC channels (`getConfig`, `saveConfig`) added to `preload-api.ts`'s `CampvusApi` and
      wired through `preload.ts`, following the existing `getState`/`onStateChange` pattern
- [ ] A settings panel in the existing single window (no second `BrowserWindow`, per ADR-0003),
      toggleable alongside the current status view
- [ ] A pure `settings-view.ts` module handles validation/formatting (unit tested); DOM wiring in
      `renderer.ts` is thin glue, consistent with how `status-view.ts`/`renderer.ts` already split
      that responsibility
- [ ] The institution public key field is validated for correct hex format before a save is
      accepted, with an inline error shown on invalid input — not a silent accept that only fails
      later inside the engine
- [ ] A user who hasn't configured the app yet sees a clear "not configured, open settings" state
      (tray + window) instead of today's generic error message
- [ ] `apps/mode-a-desktop/test/config.test.ts` and `test/settings-view.test.ts` added, run via
      the existing `tsx --test test/*.test.ts` script
