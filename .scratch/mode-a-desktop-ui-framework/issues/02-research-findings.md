Type: research-findings
Status: draft
Parent ticket: `issues/02-tooling-ecosystem-fit.md`

# Tooling and ecosystem fit — research findings

## Grounding: the actual repo setup

- `apps/mode-a-desktop/package.json` pins `vite: ^5.4.21`, `@electron-forge/plugin-vite: ^7.11.2`,
  `typescript: ^7.0.2` (current `latest` on npm as of this research — TypeScript's new
  native/`tsgo`-based major), and has **no** `"type": "module"` field (defaults to CommonJS).
  `test` runs on Node's built-in runner: `"test": "tsx --test test/*.test.ts"` — not Jest, not
  Vitest.
- `vite.renderer.config.ts` currently has zero framework plugin: just `defineConfig({ build:
  {...}, plugins: [...sentrySourcemapPlugin()] })`.
- `forge.config.ts` wires three separate Vite configs through `@electron-forge/plugin-vite`'s
  `VitePlugin`: `build: [{ entry: 'src/main.ts', config: 'vite.main.config.ts', target: 'main'
  }, { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' }]` and
  `renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }]`. The `config` field
  is a plain `string` path in `@electron-forge/plugin-vite`'s own type
  (`VitePluginRendererConfig.config: string`,
  [Config.ts](https://raw.githubusercontent.com/electron/forge/main/packages/plugin/vite/src/Config.ts)),
  and the plugin loads renderer configs by calling the real `vite` package's own
  `vite.build()` / `vite.createServer()` APIs directly
  ([VitePlugin.ts](https://raw.githubusercontent.com/electron/forge/main/packages/plugin/vite/src/VitePlugin.ts)
  imports `vite` and calls `vite.build({...})`/`vite.createServer({...})`) — so renderer config
  loading goes through Vite's own official config-file resolution, not a Forge-specific loader.
- `vite.main.config.ts` deliberately keeps `hyperswarm` as a real CJS `require()`
  (`rollupOptions.external: ['hyperswarm']`) because its native `.node` addons can't be bundled
  — the repo is intentionally *not* fully-ESM at the main-process level today.
- Reference point: `apps/mode-b-web/package.json` uses React 19 + `@vitejs/plugin-react ^6.0.4`
  + `vite ^8.1.5` + `@phosphor-icons/react ^2.1.10` — plain Vite, **not** through Electron
  Forge's plugin. Notably it's already on Vite 8, one major ahead of mode-a-desktop's Vite 5.

---

## 1. Vite plugin maturity/compatibility under Electron Forge's `plugin-vite`

### Both React's and Svelte's *current* Vite plugins require Vite 8 — mode-a-desktop is on Vite 5

Checked npm registry metadata directly for each plugin's `peerDependencies`:

| Package | Latest version | `vite` peer range |
|---|---|---|
| `@vitejs/plugin-react` | 6.0.5 | `^8.0.0` |
| `@sveltejs/vite-plugin-svelte` | 7.3.0 | `^8.0.0-beta.7 \|\| ^8.0.0` |
| `@vitejs/plugin-react` (older) | 4.3.4 | `^4.2.0 \|\| ^5.0.0 \|\| ^6.0.0` |
| `@sveltejs/vite-plugin-svelte` (older) | 4.0.4 | `^5.0.0` |
| `@preact/preset-vite` | 2.10.6 | `2.x \|\| 3.x \|\| 4.x \|\| 5.x \|\| 6.x \|\| 7.x \|\| 8.x` |
| `vite-plugin-solid` | 2.11.14 | `^3.0.0 \|\| ^4.0.0 \|\| ^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0 \|\| ^9.0.0` |

(Source: `npm view <pkg> peerDependencies` equivalent — direct registry queries against
`registry.npmjs.org`, current as of this research.)

`@electron-forge/plugin-vite@7.11.2` (the version mode-a-desktop pins, also the current latest)
has **no dependency and no peer dependency on `vite` at all** — it only depends on
`@electron-forge/plugin-base`, `@electron-forge/shared-types`, `chalk`, `debug`, `listr2`,
`fs-extra`. It treats `vite` as purely the host project's own devDependency. So the version
constraint is entirely between mode-a-desktop's own `vite: ^5.4.21` pin and whichever framework
plugin you add.

**Practical implication, identical for React and Svelte:** to add either framework's plugin to
`vite.renderer.config.ts` today without first upgrading Vite, you'd need to pin an older major
(`@vitejs/plugin-react@^4` or `@sveltejs/vite-plugin-svelte@^4`) rather than "latest". This is
not a discriminator between the two — both currently-latest plugin majors have moved past Vite
5. Preact's and Solid's plugins, by contrast, declare much wider `vite` ranges that already
cover 5.x cleanly.

### The ESM-only-plugin-vs-CJS-config problem hits React and Svelte equally — but is avoidable per-file

Both plugin packages are pure ESM with no CJS entry point:

- `@vitejs/plugin-react@6.0.5`: `"type": "module"`, `exports: { ".": "./dist/index.js" }` — no
  `require` condition.
- `@sveltejs/vite-plugin-svelte@7.3.0`: `"type": "module"`, `exports: { ".": { "types": ...,
  "default": "./src/index.js" } }` — no `require` condition either.

Since `apps/mode-a-desktop/package.json` has no `"type": "module"`, Vite's own config loader
will, by default, try to bundle `vite.renderer.config.ts` to CommonJS and `require()` it — and
`require()`-ing an ESM-only plugin import inside that config throws. This is a **documented,
general Vite behavior**, not Electron-Forge-specific: Vite's own troubleshooting guide
([vite.dev/guide/troubleshooting.html](https://vite.dev/guide/troubleshooting.html)) describes
exactly this failure mode ("This package is ESM only but it was tried to load by `require`")
and gives two official fixes: add `"type": "module"` to `package.json`, or rename the config
file to `.mjs`/`.mts`.

This is corroborated by real reports hitting it specifically in Electron Forge + Vite setups,
for **both** frameworks:

- React: [electron-forge/electron-forge-docs#250](https://github.com/electron-forge/electron-forge-docs/issues/250)
  — a user's exact error: `"[plugin: externalize-deps] '@vitejs/plugin-react' resolved to an
  ESM file. ESM file cannot be loaded by require."` Still open, no maintainer fix posted.
- Svelte: [sveltejs/vite-plugin-svelte#837](https://github.com/sveltejs/vite-plugin-svelte/issues/837)
  — same root error trying to import `@sveltejs/vite-plugin-svelte` into an Electron Forge
  template's config; closed by the Svelte maintainers as `downstream`/`not planned` (i.e. "this
  is Forge's/your config's problem, not ours"). Related open Forge-side issues:
  [electron/forge#3466](https://github.com/electron/forge/issues/3466) ("Vite Plugin for Svelte
  Support") and [electron/forge#3503](https://github.com/electron/forge/issues/3503) (same).
- The `"type": "module"` escape hatch is itself risky in this specific repo/Forge combo:
  [electron/forge#3502](https://github.com/electron/forge/issues/3502) — adding `"type":
  "module"` to package.json in a Forge+Vite template breaks Forge's own CJS-based loading of
  the **main**/preload build configs (`"Cannot use import statement outside a module"` /
  `"require() of ES Module not supported"`), open and unresolved. This matters extra for
  mode-a-desktop specifically because `vite.main.config.ts` already leans on CJS `require()`
  semantics for `hyperswarm`'s native addons — flipping the whole package to ESM is the
  higher-risk fix.

**Grounded recommendation (applies equally to React or Svelte):** don't add `"type": "module"`
to `apps/mode-a-desktop/package.json`. Instead rename only the renderer config file to
`vite.renderer.config.mts` and update the `config:` string in `forge.config.ts`'s `renderer[0]`
entry to match — Vite's own loader treats `.mts` as ESM unconditionally regardless of the
package's `"type"` field, and per `VitePlugin.ts` above this is real Vite config-loading, so the
same fix Vite documents generically works here. This leaves `vite.main.config.ts` and
`vite.preload.config.ts` untouched and CJS, exactly as `hyperswarm`'s native-addon handling
requires.

One asymmetry worth noting: `@preact/preset-vite` ships a genuine dual CJS/ESM package
(`exports: { ".": { "import": "./dist/esm/index.mjs", "require": "./dist/cjs/index.js" } }`,
confirmed via the npm registry metadata) — so Preact's plugin does **not** hit this failure mode
at all, `require()`-able as-is. That's a real, if secondary, point in Preact's favor on pure
tooling friction, though the `.mts` rename above neutralizes the React/Svelte version of the
problem just as effectively.

### Confirmed working examples

- React: multiple public Electron-Forge-plugin-vite + React templates exist and are actively
  used, e.g. [julillermo/template-electron-forge-vite-react-ts](https://github.com/julillermo/template-electron-forge-vite-react-ts)
  and [ChurchTao/electron-forge-vite-react-template](https://github.com/ChurchTao/electron-forge-vite-react-template).
  Inspecting the julillermo template's actual `vite.renderer.config.ts` and `package.json`
  directly (raw GitHub content) shows it does **not** even depend on `@vitejs/plugin-react` —
  it relies on Vite's built-in esbuild JSX transform for `.tsx` files and sidesteps the
  ESM-plugin problem entirely, at the cost of no React Fast Refresh/HMR. That's a legitimate
  minimal-friction path for React specifically that has no Svelte equivalent (Svelte requires
  its compiler plugin to compile `.svelte` files at all — there's no "skip the plugin" option).
- Svelte: no equivalently mature, widely-used Electron-Forge + Vite + Svelte template surfaced
  in this research; the two closest hits were both problem reports
  ([electron/forge#3466](https://github.com/electron/forge/issues/3466),
  [#3503](https://github.com/electron/forge/issues/3503)) rather than working examples. This is
  a real maturity gap for Svelte specifically in the Electron-Forge-plugin-vite niche (as
  opposed to the separate, unrelated `electron-vite` tool, which both frameworks support out of
  the box per [electron-vite.org](https://electron-vite.org/) — but that's a different build
  tool, not what mode-a-desktop uses).

---

## 2. TypeScript support quality

### React

First-party-adjacent, mature. React's own docs
([react.dev/learn/typescript](https://react.dev/learn/typescript)) state: *"Out of the box,
TypeScript supports JSX and you can get full React Web support by adding `@types/react` and
`@types/react-dom` to your project."* Types are community-maintained (DefinitelyTyped) rather
than shipped inside the `react` package itself, but this has been the standard, well-trodden
path for years — JSX itself is natively understood by `tsc`, no plugin required for
type-checking.

### Svelte

Also first-party, but structurally different because `.svelte` files are not plain
`.ts`/`.tsx` — they're a custom single-file-component format. Per Svelte's own docs
([svelte.dev/docs/svelte/typescript](https://svelte.dev/docs/svelte/typescript)):
type-annotation-only syntax works natively in `<script lang="ts">` with no preprocessor, but
anything that doesn't just disappear at transpile time (enums, parameter-property shorthand,
etc.) needs a preprocessor — `vitePreprocess` from `@sveltejs/vite-plugin-svelte` for
Vite-based projects. Actual type-*checking* of `.svelte` files (as opposed to just letting them
compile) requires the separate `svelte-check` CLI / the Svelte language-tools, since plain `tsc`
doesn't understand `.svelte` template syntax.

### mode-a-desktop-specific TypeScript-version caveat (Svelte-specific, currently blocking)

`apps/mode-a-desktop/package.json` pins `typescript: ^7.0.2` — TypeScript 7 (the new
native/Go-ported "tsgo" compiler), currently `latest` on npm. This directly and currently
breaks Svelte's type-checking toolchain:
[sveltejs/language-tools#3063](https://github.com/sveltejs/language-tools/issues/3063) — both
`svelte2tsx` and `svelte-check` crash on TypeScript 7 with `ERR_PACKAGE_PATH_NOT_EXPORTED` ("No
'exports' main defined in .../typescript/package.json"), because TS7 changed its package
exports shape in a way `svelte-check`'s `require('typescript')` call doesn't handle. Open, no
assignee, no workaround confirmed as of this research (the reporter notes passing `--tsgo`
doesn't fix it either). Secondary reporting (not primary-source, treat as directional only) —
[TechTimes coverage of TS 7](https://www.techtimes.com/articles/320049/20260710/typescript-7-now-stable-10-faster-builds-not-for-vue-or-svelte-yet.htm)
— frames this as an ecosystem-wide gap expected to close around TypeScript 7.1 once a stable
programmatic API for native-compiler consumers ships.

React's TypeScript story has no equivalent exposure here: `tsc`'s own JSX/type-checking is core
compiler functionality, not a downstream tool reflecting into `typescript`'s internal module
shape, so it isn't vulnerable to this specific TS7 breakage in the way `svelte-check` is.

**This is a real, currently-live discriminator, not a hypothetical one** — it's blocking given
the TypeScript version this app already has pinned today, not a distant hypothetical.
(mode-a-desktop could pin back to `typescript@^6` to sidestep it, but that's a downgrade from
what's currently pinned, and isn't automatic.)

### Preact / Solid (brief)

Preact: TypeScript is fully supported via `preact/compat` types and its own JSX namespace;
mature, same tsc-native story as React since Preact intentionally mirrors React's typing
surface. Solid: also first-party TypeScript support (`solid-js` ships its own types, JSX
handled via `babel-preset-solid`/`vite-plugin-solid`'s transform, no separate type-checker CLI
needed the way `.svelte` needs `svelte-check`, since Solid components are plain `.tsx`).

---

## 3. Testing setup — does it force logic into framework-coupled code?

mode-a-desktop's actual pattern to preserve: `status-view.ts` and `course-files-view.ts` are
plain `.ts` modules with zero DOM/framework imports, exercised by `tsx --test
test/*.test.ts` (Node's **built-in** test runner — not Jest, not Vitest) using plain
`node:assert/strict`. `renderer.ts` is the only file that touches the DOM.

### Svelte's own docs explicitly endorse this exact pattern

Straight from [svelte.dev/docs/svelte/testing](https://svelte.dev/docs/svelte/testing):
*"Before writing component tests, think about whether you actually need to test the component,
or if it's more about the logic inside the component. If so, consider extracting out that
logic to test it in isolation, without the overhead of a component."* This is a first-party,
explicit endorsement of exactly the `status-view.ts`/`course-files-view.ts` split — nothing
about Svelte's component model forces view-model logic into `.svelte` files.

### React doesn't force it either, though its own docs don't say so as explicitly

Nothing in React's architecture requires business/formatting logic to live inside a component
— plain `.ts` modules imported into JSX components are the standard pattern used throughout
the React ecosystem (hooks-extraction, "container/presenter" splits, etc.), though
[react.dev/learn/typescript](https://react.dev/learn/typescript) and
[testing-library.com/docs/react-testing-library/intro](https://testing-library.com/docs/react-testing-library/intro/)
don't carry a Svelte-style explicit callout for this — the intro page's stated guiding
principle is about component tests resembling real usage, not about logic extraction.

### Test-runner fit: React Testing Library is runner-agnostic; Svelte Testing Library has a hard `vitest` peer dependency

This is the sharpest, most concrete finding of this section, and it's specific to
mode-a-desktop's actual `tsx --test` setup:

- `@testing-library/react@16.3.2` `peerDependencies` (from the npm registry):
  `{"react": "^18.0.0 || ^19.0.0", "react-dom": "^18.0.0 || ^19.0.0", "@types/react": "...",
  "@types/react-dom": "...", "@testing-library/dom": "^10.0.0"}` — **no test-runner peer
  dependency at all.** Matches its own docs
  ([testing-library.com/docs/react-testing-library/intro](https://testing-library.com/docs/react-testing-library/intro/)):
  *"the library works with any framework"* (Jest is just the docs' stated preference). Working
  setups pairing it with Node's native `node:test` + `jsdom` (via e.g. `global-jsdom`) exist and
  are documented in the wild (e.g. [matthewbrown.io's node:test + RTL walkthrough](https://matthewbrown.io/2025/09/04/node-test-runner)) —
  not an officially-blessed recipe, but not fighting the library either.
- `@testing-library/svelte@5.4.2` `peerDependencies`: `{"vite": "*", "svelte": "^3 || ^4 || ^5
  || ^5.0.0-next.0", "vitest": "*"}` — **`vitest` is a hard peer dependency of the package
  itself**, even though the setup docs
  ([testing-library.com/docs/svelte-testing-library/setup](https://testing-library.com/docs/svelte-testing-library/setup/))
  say *"We recommend using Vitest, but you're free to use the library with any test runner
  that's ESM compatible."* In practice this means installing `@testing-library/svelte` under
  strict peer-dependency resolution (pnpm's default is fairly strict) would want `vitest`
  present even if the actual test execution goes through `tsx --test`, and there's no
  documented `node:test` recipe for it the way there is for React (only Vitest-first guides
  turned up in this research, e.g. Sourcegraph's and Tim Deschryver's Svelte testing writeups).

Net: adopting Svelte here would most plausibly mean introducing Vitest as a second test runner
(or migrating existing `tsx --test` tests to Vitest) for anything touching
`@testing-library/svelte`, whereas React Testing Library can sit directly on top of the
existing `tsx --test` + `node:assert` setup without a runner change — assuming `status-view.ts`
/`course-files-view.ts`-style modules stay runner-agnostic either way, which both frameworks
support.

### Preact / Solid (brief)

`@testing-library/preact@3.2.4` peer deps: only `preact` — no runner peer, same
runner-agnostic story as React (expected, since it wraps `preact-render-to-string`/DOM APIs
directly). `@solidjs/testing-library@0.8.10` peer deps: `solid-js`, `@solidjs/router` — again no
runner peer dependency.

---

## 4. Phosphor Icons component packages by framework

Checked directly against the npm registry search API (`registry.npmjs.org/-/v1/search`) and the
`phosphor-icons` GitHub org's repository listing.

| Framework | Official (`@phosphor-icons/*`) package | Status |
|---|---|---|
| React | [`@phosphor-icons/react`](https://github.com/phosphor-icons/react) | Official. Latest `2.1.10`, published 2025-05-22. Already in use in this monorepo (`apps/mode-b-web`). |
| Vue | `@phosphor-icons/vue` | Official (not asked for, but confirms the org actively maintains multiple framework packages). |
| Web / web components | `@phosphor-icons/web` (already used by mode-a-desktop today, as a CSS/font import — not a component package), `@phosphor-icons/webcomponents` | Official. |
| **Svelte** | **None.** No `@phosphor-icons/svelte` exists, and the `phosphor-icons` GitHub org has no Svelte repo (confirmed via the org's repo list: React, Vue, Web, Web Components, Flutter, Swift, Elm, React Native, Core, Homepage — no Svelte). | Community-only: [`phosphor-icons-svelte`](https://github.com/babakfp/phosphor-icons-svelte) (unscoped, latest `2.1.0`, published 2025-08-25 — actively maintained) and a second independent one, `haruaki07/phosphor-svelte`. Neither is under the `phosphor-icons` org/scope. |
| **Preact** | **None**, official or community. No package surfaced in npm registry searches for "phosphor preact" beyond `preact` itself and unrelated Preact packages. | Preact's own `preact/compat` layer is the documented path to run `@phosphor-icons/react` unmodified — Preact's docs ([preactjs.com/guide/v10/switching-to-preact](https://preactjs.com/guide/v10/switching-to-preact/)) state Vite users get the `react`/`react-dom` → `preact/compat` aliasing "automatically handled" via `@preact/preset-vite`, so `@phosphor-icons/react` should work as-is through that alias, though this wasn't independently verified by actually installing/running it in this research pass. |
| **Solid** | **None** under the official `phosphor-icons` scope. | Community: [`solid-phosphor`](https://unpkg.com/browse/phosphor-solid@1.1.5/README.md) (unscoped npm name `solid-phosphor`), latest `1.0.16`, published 2024-06-30 — over a year stale relative to the Svelte community package. |

**Bottom line for this question:** React is the only candidate with a first-party,
actively-published Phosphor package, and it's the one already proven inside this same
monorepo (`apps/mode-b-web`). Svelte's best option is a well-maintained but unofficial
community package. Preact has no dedicated package at all (relies on `react/compat`
aliasing working transparently for this specific library, unverified here). Solid's community
package is the stalest of the bunch.

Note: mode-a-desktop currently ships `@phosphor-icons/web` (the CSS/webfont variant) and swaps
icon classes by string (`STATUS_ICON_CLASS` in `renderer.ts`), not a component package at all —
so *any* framework choice here is a net-new integration, not a continuation of an existing
component-level dependency.

---

## Synthesis (for the framework-choice ticket, not decided here)

- **Vite/Forge plugin friction is a wash between React and Svelte today**: both current-latest
  plugin majors need a Vite 8 upgrade (or an older plugin major) to match mode-a-desktop's
  pinned Vite 5.4.21, and both hit the identical "ESM-only plugin required by a CJS-loaded
  config" failure mode unless the renderer config is renamed to `.mts` — a fix that works
  identically for both and doesn't require touching `vite.main.config.ts`'s CJS `hyperswarm`
  handling.
- **Two concrete, currently-live discriminators favor React over Svelte specifically for this
  app as configured right now:**
  1. Svelte's type-checking toolchain (`svelte-check`/`svelte2tsx`) is broken under the
     `typescript@^7.0.2` this repo already pins
     ([sveltejs/language-tools#3063](https://github.com/sveltejs/language-tools/issues/3063)),
     with no confirmed workaround yet.
  2. `@testing-library/svelte` carries a hard `vitest` peer dependency, in tension with
     mode-a-desktop's existing `tsx --test` (Node native runner) setup; `@testing-library/react`
     has no runner peer dependency and slots in without a test-runner migration.
- **Both frameworks preserve the DOM-free pure-logic-module pattern** — Svelte's own docs
  explicitly recommend it; nothing about React's component model prevents it either. Not a
  discriminator.
- **Phosphor Icons tooling favors React decisively**: official, actively-maintained, and
  already proven in-repo (`apps/mode-b-web`) vs. Svelte's unofficial-but-maintained option vs.
  no dedicated package at all for Preact/Solid.
- Preact and Solid have *more* Vite-plugin-version headroom against the pinned Vite 5 than
  React/Svelte's current plugin majors do, and Preact's plugin is the only one of the four that
  ships a true dual CJS/ESM package (sidestepping the require-ESM friction entirely) — but both
  come with weaker or no Phosphor Icons support, per the table above.
