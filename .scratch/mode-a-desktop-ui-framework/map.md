Label: wayfinder:map

# UI framework for mode-a-desktop

## Destination

Decide which UI framework (React, Svelte, or another candidate that fits "powerful yet
small") `apps/mode-a-desktop`'s renderer should adopt to replace its current hand-wired
vanilla TS/DOM approach, and break the migration of `renderer.ts`'s views onto that
framework into scoped implementation tickets.

## Notes

- Domain: `apps/mode-a-desktop`, an Electron P2P desktop app. Its renderer
  (`renderer.ts`, `status-view.ts`, `course-files-view.ts`) currently does manual
  `document.getElementById` wiring against static HTML/CSS — no framework.
- React is already used elsewhere in the repo: `apps/mode-b-web` (React 19 web app) and
  `apps/campvus` (Expo/React Native). Svelte is not used anywhere in the repo today. This
  is a data point for the framework-choice ticket, not a decision made here.
- Build tooling is already Vite (three configs — main/preload/renderer — via Electron
  Forge's Vite plugin, currently with zero framework plugin attached). Both React and
  Svelte integrate with Vite without a build-tool change.
- `packages/design` ships framework-agnostic CSS tokens only (no JS) — should carry over
  regardless of framework choice.
- The user's "powerful yet small bundle size" constraint is specifically about
  installer/package size. Note for whoever resolves the bundle-size ticket: React/Svelte
  runtime deltas are on the order of tens of KB, small next to Electron's own
  Chromium-driven footprint (~100MB+) — worth confirming with real numbers whether bundle
  size is actually a meaningful discriminator between candidates here, rather than
  assuming it is.
- The current renderer deliberately keeps pure logic modules (`status-view.ts`,
  `course-files-view.ts`) DOM-free for testability without a DOM. Whatever framework is
  chosen should preserve or improve on this, not regress it.
- **Override on "plan don't do":** this map's destination includes breaking the actual
  migration into implementation tickets once the framework and migration strategy are
  decided — not just deciding and handing off. Per-ticket execution of that migration
  work is still out of session scope (one ticket per session), but producing the ticket
  breakdown itself is part of this map.

## Decisions so far

- [Bundle size and runtime comparison](issues/01-bundle-size-and-runtime-comparison.md) —
  bundle size doesn't discriminate: worst-case delta (~56 KB gzip) is ~0.04% of Electron's
  own runtime footprint (118-138 MB). Not a deciding factor between React/Svelte/Preact/Solid.
- [Tooling and ecosystem fit](issues/02-tooling-ecosystem-fit.md) — React fits this app's
  existing tooling better today: Svelte's type-checker crashes under the pinned
  `typescript@^7.0.2`, `@testing-library/svelte` forces a Vitest dependency this app
  doesn't have, and only React has an official Phosphor Icons package (already proven via
  `mode-b-web`). Vite-plugin friction itself is a wash between the two.
- [Framework choice](issues/03-framework-choice.md) — **React**, chosen for tooling fit
  (no live blockers, unlike Svelte) and repo-wide consistency (`mode-b-web`, `campvus`
  are already React). No countervailing reason to prefer Svelte.
- [Migration strategy](issues/04-migration-strategy.md) — **big-bang rewrite**, not
  incremental: the renderer is only ~553 lines total across 3 panels, too small for
  incremental adoption to pay off. Also settled inline: icons via `@phosphor-icons/react`
  (matching `mode-b-web`), CSS stays plain imports (no CSS Modules/CSS-in-JS), state via
  React's built-in hooks (no external store). Produced the implementation ticket
  breakdown: [Renderer tooling setup](issues/05-renderer-tooling-setup.md), [Migrate
  status and settings panels](issues/06-migrate-status-and-settings-panels.md), [Migrate
  course-files panel](issues/07-migrate-course-files-panel.md), [State wiring and
  cutover](issues/08-state-wiring-and-cutover.md).

- [Renderer tooling setup](issues/05-renderer-tooling-setup.md) through [State wiring
  and cutover](issues/08-state-wiring-and-cutover.md) — implemented. `apps/mode-a-desktop`'s
  renderer is now fully on React: `App.tsx` + `components/{StatusPanel,SettingsPanel,
  CourseFilesPanel}.tsx`, a new pure `settings-form.ts` seam (tested), icons on
  `@phosphor-icons/react`, old `renderer.ts` and the temporary `preview.html` QA harness
  removed. `tsc --noEmit` clean, all 60 tests pass, production build verified.

## Not yet specified

(none — destination fully reached: framework decided, migration strategy decided, and the
migration itself implemented and verified.)

## Out of scope

- Electron → Electrobun runtime migration (`.scratch/electrobun-migration/spec.md`) — a
  separate effort, explicitly independent of this one per the user. This map doesn't
  revisit that decision either way.
