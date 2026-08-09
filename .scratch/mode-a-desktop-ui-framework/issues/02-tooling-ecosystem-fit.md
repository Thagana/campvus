Type: research
Status: resolved

# Tooling and ecosystem fit

## Question

For each framework candidate (React, Svelte, and any others surfaced by Bundle size and
runtime comparison), how well does it fit `mode-a-desktop`'s existing tooling and
patterns: Vite plugin integration alongside Electron Forge's existing renderer config,
TypeScript support, a testing story that preserves the current pattern of DOM-free pure
logic modules (`status-view.ts`, `course-files-view.ts`), and availability of a Phosphor
Icons component package (`mode-b-web` already uses `@phosphor-icons/react`)?

## Answer

React fits this app's existing tooling meaningfully better than Svelte does today:

- **Vite/Forge plugin friction is a wash** — both React's and Svelte's current-latest Vite
  plugin majors require Vite 8 (this app pins 5.4.21), and both hit the identical
  "ESM-only plugin loaded by a CJS config" failure under Electron Forge's plugin-vite —
  fixable identically for either by renaming just `vite.renderer.config.ts` to `.mts`
  (no need to flip the whole package to `"type": "module"`, which would break
  `vite.main.config.ts`'s existing CJS handling of `hyperswarm`'s native addons).
- **Two concrete, currently-live gaps favor React over Svelte specifically for this app as
  configured today:**
  1. Svelte's type-checker (`svelte-check`/`svelte2tsx`) crashes outright under the
     `typescript@^7.0.2` this repo already pins ([sveltejs/language-tools#3063](https://github.com/sveltejs/language-tools/issues/3063)),
     no confirmed workaround.
  2. `@testing-library/svelte` hard-pins `vitest` as a peer dependency, in tension with
     this app's existing `tsx --test` (Node native runner) setup; `@testing-library/react`
     has no runner peer dependency at all and slots in without a runner migration.
- Both frameworks preserve the DOM-free pure-logic-module pattern (`status-view.ts`,
  `course-files-view.ts`) — Svelte's own docs explicitly endorse it; nothing in React's
  model prevents it either. Not a discriminator.
- **Phosphor Icons favors React decisively**: the only official, actively-maintained
  package, already proven in-repo via `mode-b-web`. Svelte's best option is an unofficial
  (if well-maintained) community package; Preact has none; Solid's is stale.
- Preact and Solid have more Vite-plugin-version headroom against the pinned Vite 5, and
  Preact's plugin is the only true dual CJS/ESM package of the four — but both trail badly
  on Phosphor Icons support.

Full findings and sources: [issues/02-research-findings.md](02-research-findings.md) (also
on branch `research/tooling-ecosystem-fit`, commit `ce44748`).
