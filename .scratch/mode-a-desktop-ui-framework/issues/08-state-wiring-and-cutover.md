Type: task
Status: resolved
Blocked by: 06, 07

# State wiring and cutover

## Question

Replace `renderer.ts`'s module-level `latestState`/`currentPanel` variables and the
`window.campvus.onStateChange` wiring with React state (`useState`/`useReducer` in a root
`App` component, per [Migration strategy](04-migration-strategy.md)'s settled guidance —
no external store needed at this scale). `App` should own panel switching (status /
settings / files) and re-render `StatusPanel`/`SettingsPanel`/`CourseFilesPanel` on state
changes, preserving the existing initial-hydration flow (`window.campvus.getState()` then
a config fetch if unconfigured). Remove the old vanilla-DOM `renderer.ts` entry point and
wire `index.html` to mount the new React root via `ReactDOM.createRoot`. This is the final
ticket — once it's done, `apps/mode-a-desktop`'s renderer is fully on React and this map's
destination is reached.

## Answer

Done. `src/App.tsx` owns `state`/`panel` via `useState`, hydrates via
`window.campvus.getState()` and subscribes via `window.campvus.onStateChange` in a
`useEffect` (cleanup returns the unsubscribe function), and opens the settings panel on an
unconfigured install — matching the original's initial-hydration flow. `src/renderer.ts`
was deleted; `src/renderer.tsx` is the new entry point, importing `createRoot` from
`react-dom/client` and rendering `<App />` into `index.html`'s `<div id="root">`.
`index.html` no longer carries any static panel markup.

Also removed, beyond this ticket's literal scope: `preview.html`, `src/preview-entry.ts`,
`src/preview-stub.ts` — a self-documented "TEMPORARY" visual-QA harness that only worked by
importing the old `renderer.ts` directly against static markup with matching element ids;
unreferenced anywhere else in the repo, and non-functional once the vanilla renderer and
its markup were gone.

Verified: `tsc --noEmit` clean, all 60 tests pass (52 pre-existing + 8 new
`settings-form.test.ts` cases), production `vite build` succeeds, and a dev-server smoke
test confirmed every new file transforms without error. `eslint` could not be run — it
fails at plugin-load time (`@typescript-eslint` incompatible with this repo's pinned
`typescript@^7.0.2`), a pre-existing infrastructure issue unrelated to this migration.

This map's destination is now fully reached: framework decided, migration strategy
decided, and the migration itself implemented.
