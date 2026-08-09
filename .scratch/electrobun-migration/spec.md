Status: needs-triage

# Feasibility: move `apps/mode-a-desktop` from Electron to Electrobun

Scoping only — no decision made, no code changed. See [ADR-0002](../../docs/adr/0002-electron-desktop-client-mobile-parked.md)
(why Electron was picked) and [ADR-0003](../../docs/adr/0003-desktop-agent-lazy-window.md)
(the idle-memory workaround this migration would likely make unnecessary).

## Caveat on sourcing

WebFetch/WebSearch were unavailable this session (rate-limited), so everything about
Electrobun's *current* state below comes from training knowledge, not a live check of the
repo/docs. Electrobun is a young, fast-moving project — **treat every claim in the "Electrobun
side" column as needing a live re-check** (repo README, releases, issues) before it's used to
justify a go/no-go decision. The "current app" column is verified directly from this codebase.

## Why this is on the table

ADR-0003 exists entirely because Electron's idle cost comes from keeping a live Chromium
`BrowserWindow` around (~1GB RAM for tray apps like Discord/Teams) — so this app deliberately
never creates one until the user clicks the tray icon. Electrobun replaces Chromium with the
OS's native webview (WKWebView / WebView2 / WebKitGTK), which doesn't carry that cost. If that
holds up, ADR-0003's whole lazy-window workaround becomes unnecessary, install size drops from
~150MB+ to low single-digit MB, and the `forge.config.ts` locale-pruning hack disappears
entirely (no bundled Chromium locales to prune).

That's the upside. It doesn't by itself make the migration low-risk — the app's actual runtime
dependency is a P2P engine with native addons, not just a UI shell.

## Surface area: what would have to survive the move

| Concern | Current (Electron) | Electrobun side | Risk |
|---|---|---|---|
| **P2P engine** — `packages/engine`'s `hyperswarm`, pulling in `sodium-native` and `udx-native` (native `.node` addons via `prebuildify`/`node-gyp-build`) | Runs on Node in the main process, works today | Electrobun's main process runs on **Bun**, whose JS engine is JavaScriptCore, not V8. Bun ships an N-API compatibility shim, and coverage has been improving, but it is not 100%, and `sodium-native`/`udx-native` are exactly the class of module (prebuilt native bindings with nontrivial event-loop/threading use) that has historically been hit-or-miss under Bun. **This is the load-bearing unknown** — if it doesn't work, nothing else here matters. | **Highest — blocking** |
| Main-process Node APIs (`fs`, `path`, `node:fs`, timers, `fetch`/HTTP in `node-request.ts`) | Plain Node | Bun aims for high Node.js API compatibility for exactly this kind of code | Low |
| `contextBridge` + `ipcRenderer.invoke` typed IPC (`preload.ts`, `preload-api.ts`) | Electron-specific API | Electrobun has its own typed RPC bridge between the Bun process and the webview — conceptually equivalent, but it's a different API and the whole preload/bridge layer needs rewriting | Medium (mechanical, not risky) |
| Tray icon, rendered as raw pixels via `nativeImage.createFromBuffer` (`trayIcon`/`renderRingIcon` in `main.ts`) | Electron `Tray` + `nativeImage` | Electrobun's tray support exists but is less mature; whether it accepts a raw pixel buffer (vs. only a file path) needs a direct check | Medium |
| Lazy `BrowserWindow`, hide-on-close, single cached window (`window-controller.ts`, ADR-0003) | Electron `BrowserWindow` | Electrobun's window API differs; the pattern should be portable but needs a rewrite either way — and per above, may not even be necessary anymore | Low-medium |
| Windows 11 Mica `backgroundMaterial` on the settings window | Electron-specific Windows vibrancy option | No known Electrobun equivalent — likely feature regression on Windows unless Electrobun exposes DWM backdrop materials | Medium (cosmetic, not functional) |
| Auto-launch at login, hidden (`auto-launch.ts`, `app.setLoginItemSettings`) | Built into Electron | Needs a per-OS equivalent; unclear if Electrobun has one built in | Medium |
| Sentry (`@sentry/electron/main` + `/renderer`, `@sentry/vite-plugin` sourcemaps, `render-process-gone`/`unresponsive` capture) | Full-featured official SDK | No dedicated Electrobun SDK. Main process could likely use `@sentry/bun` (general Bun server SDK); the webview side has no obvious equivalent to Electron's renderer crash/unresponsive events. Sourcemap upload pipeline would need to be rebuilt for whatever bundler Electrobun uses. | Medium-high (observability regression, not blocking) |
| Packaging: `electron-forge` + `MakerSquirrel`/`MakerZIP`/`MakerRpm`/`MakerDeb`, `@electron/fuses`, `AutoUnpackNativesPlugin`, and the two custom `afterCopy` hooks that hand-copy `hyperswarm`'s hoisted dependency closure and prune foreign-platform prebuilds | Electron-forge, heavily customized already (see `forge.config.ts` comments — this was already nontrivial to get working) | Electrobun ships its own build/bundle CLI, not electron-forge. The Chromium-locale problem disappears, but the **native-addon bundling problem (`hyperswarm`'s hoisted deps, per-platform prebuilds) is a property of pnpm + native modules, not of Electron** — it will very likely need solving again from scratch in Electrobun's tooling. | Medium-high |
| `electron-squirrel-startup` (Windows shortcut/uninstall handling) + Squirrel installer/delta-update flow | Mature, first-class | Electrobun's own updater exists but its production maturity is the kind of thing that needs a live check, not an assumption | Medium |
| CI matrix: windows-latest, macos-latest, ubuntu-latest, each producing installers (`.exe`/`.nupkg`, `.zip`, `.deb`/`.rpm`) | Working today, all three platforms | **Linux webview backend (WebKitGTK) has historically been the least mature of Electrobun's three platforms** — needs direct verification before assuming parity with today's deb/rpm releases | High for Linux specifically |

## Bottom line

This is not a UI-framework swap — the app's reason for existing is the P2P engine, and that
engine's native dependencies are the one thing that has to work under Bun for any of the rest
of this to be worth scoping further. Everything else in the table above (bridge API, tray,
packaging, updater, Sentry) is real work but is the *normal* cost of a runtime migration, not a
question mark.

## Recommended next step

Don't scope packaging/CI/Sentry any further yet — spike the one unknown that gates everything
else:

1. A throwaway Electrobun app (not this repo) that `import`s `hyperswarm` (pulling in
   `sodium-native` + `udx-native`) under Bun, and successfully opens a swarm/UDP connection to a
   peer.
2. Run it on Windows, macOS, and Linux — this app ships all three today, and Linux is the
   platform most likely to fail first.
3. If it works everywhere: come back and scope the bridge/tray/packaging/Sentry rewrite for
   real, sized as implementation tickets.
4. If it fails on any platform: this migration is blocked until either Bun's N-API coverage
   improves or `packages/engine` gets an alternate transport for that platform — not worth
   scoping further right now.

No code in this repo needs to change to run that spike; it belongs in a scratch directory or
throwaway repo, not `apps/mode-a-desktop`.
