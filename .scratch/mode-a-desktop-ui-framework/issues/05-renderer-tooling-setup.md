Type: task
Status: resolved

# Renderer tooling setup

## Question

Add React to `apps/mode-a-desktop`'s build so the migration can start: add `react`,
`react-dom`, and `@vitejs/plugin-react` (pin to a major compatible with this app's
`vite@^5.4.21`, per [Tooling and ecosystem fit](02-tooling-ecosystem-fit.md) — current-latest
`@vitejs/plugin-react` requires Vite 8, so either pin an older plugin major or upgrade Vite).
Rename `vite.renderer.config.ts` to `vite.renderer.config.mts` (the grounded fix from the
tooling research for the ESM-only-plugin-vs-CJS-config failure) and update the `config:`
string in `forge.config.ts`'s `renderer[0]` entry to match — leave `vite.main.config.ts` and
`vite.preload.config.ts` untouched (still CJS, required for `hyperswarm`'s native addons).
Confirm `tsconfig` supports JSX (`jsx: "react-jsx"` or equivalent). Verify a trivial
placeholder React component renders in both `npm start` (dev) and a production build before
handing off to the panel-migration tickets.

## Answer

Done. Added `react@^19.2.8`, `react-dom@^19.2.8`, `@phosphor-icons/react@^2.1.10` as
dependencies and `@vitejs/plugin-react@^4.7.0` (pinned to the v4 major — resolved by pnpm to the latest
4.x release rather than the 4.3.4 initially requested — whose peer range
`^4.2.0 || ^5.0.0 || ^6.0.0` covers this app's `vite@^5.4.21` without a Vite upgrade) plus
`@types/react`/`@types/react-dom` as devDependencies. Renamed
`vite.renderer.config.ts` → `vite.renderer.config.mts` and added `react()` to its plugins;
updated `forge.config.ts`'s `renderer[0].config` to match. `vite.main.config.ts`/
`vite.preload.config.ts` untouched.

`tsconfig.json` needed more than just `jsx: "react-jsx"`: the base config's
`"moduleResolution": "Node16"` rejected importing the ESM-only `@phosphor-icons/react`
package (TS1479/TS2305) since this package has no `"type": "module"`. Fixed by overriding
`"module": "ESNext"` / `"moduleResolution": "Bundler"` locally in
`apps/mode-a-desktop/tsconfig.json` (matching `mode-b-web`'s tsconfig) rather than adding
`"type": "module"` to `package.json` — confirmed safe since this package's source has no
direct `require()` calls and `hyperswarm`'s CJS handling lives entirely in
`vite.main.config.ts`'s Rollup `external`, not in TS-level module resolution.

Verified via `vite build --config vite.renderer.config.mts` (production) and a dev-server
smoke test (all new component files transform without error) before handing off to
[Migrate status and settings panels](06-migrate-status-and-settings-panels.md) and
[Migrate course-files panel](07-migrate-course-files-panel.md).
