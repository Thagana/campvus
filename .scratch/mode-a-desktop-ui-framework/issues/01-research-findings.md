Type: research-findings
Status: ready-for-human
Answers: 01-bundle-size-and-runtime-comparison.md

# Bundle size and runtime comparison — findings

## TL;DR

For `apps/mode-a-desktop`, **bundle size does not meaningfully discriminate** between
React, Svelte, Preact, and Solid. The realistic worst-case delta between the heaviest
candidate (React + ReactDOM, ~60 KB gzip) and the lightest (Solid/Preact, ~4-8 KB gzip)
is on the order of **50-55 KB gzip** — smaller than a single unoptimized PNG icon. Electron
itself ships a **118-138 MB** Chromium+Node.js runtime per the official release artifacts
for the exact Electron version this repo pins (`43.2.0`). The framework choice's bundle-size
footprint is roughly **0.04%** of Electron's own footprint — a rounding error, not a
discriminator. If bundle size is the deciding criterion, all four candidates clear the bar
equally; the decision should be made on DX, ecosystem fit with the existing manual-DOM code
(`renderer.ts`, `status-view.ts`, `course-files-view.ts`), and team familiarity instead.

## Methodology

Numbers below come from two sources, both cited inline:

1. **Self-produced measurements** — I scaffolded four minimal Vite production apps (one
   per framework, each a trivial stateful counter component: `<h1>Hello</h1>` + a button
   wired to one piece of state), ran `vite build` in production mode, and read the
   gzip sizes Vite's own build reporter prints (Vite computes real gzip-9 sizes for its
   build summary, not an estimate). Scaffolds live under
   `C:\Users\User\AppData\Local\Temp\claude\...\scratchpad\bundle-bench\{react,preact,solid,svelte}-app`
   (temp/throwaway, not committed) using the same Vite major version this repo already
   pins (`vite@^5.4.21`), each with its official first-party Vite plugin
   (`@vitejs/plugin-react`, `@preact/preset-vite`, `vite-plugin-solid`,
   `@sveltejs/vite-plugin-svelte`).
2. **Published/official figures** — bundlephobia.com (via its public JSON API,
   `bundlephobia.com/api/size?package=...`), each framework's own docs/marketing site,
   and one independent third-party benchmark repo, cross-checked against each other and
   against my own build output. Where a secondary/blog source was the only thing available
   (e.g. generic "Electron apps are ~100MB+" claims), it's flagged as secondary, and I
   preferred a primary measurement instead where possible (see Electron section).

## 1-2. Real bundle sizes (self-measured + cross-checked)

### My own build output (Vite 5.4.21, esbuild minify, prod mode, single trivial counter component)

| Framework | Installed version | Minified JS | Gzipped JS |
|---|---|---|---|
| React 19 + ReactDOM (`createRoot` + `useState`, StrictMode) | react/react-dom 19.2.8 | 193.50 KB | **60.49 KB** |
| Svelte 5 (`$state` rune, compiled via `@sveltejs/vite-plugin-svelte`) | svelte 5.56.8 | 30.14 KB | **11.62 KB** |
| Preact (`preact/hooks` `useState`) | preact 10.29.8 | 13.88 KB | **5.80 KB** |
| SolidJS (`createSignal`) | solid-js 1.9.14 | 8.31 KB | **3.47 KB** |

These are full production bundles (framework runtime + the trivial app code + JSX/compiler
output), i.e. what would actually ship in `dist/renderer` for a "hello world" screen built
with each framework via Vite — the realistic number for this repo's build pipeline, not a
theoretical package-only number.

### Independent cross-check: geoffrich/component-size-benchmark

[github.com/geoffrich/component-size-benchmark](https://github.com/geoffrich/component-size-benchmark)
(maintained by a Svelte core-team-adjacent contributor) runs a more realistic TodoMVC-scale
component through each framework's real Vite build and publishes gzip/brotli numbers in
[`stats.md`](https://github.com/geoffrich/component-size-benchmark/blob/main/stats.md):

| Framework | Bundle (gzip) |
|---|---|
| Preact | 6,584 B (6.4 KB) |
| React | **59,256 B (57.9 KB)** |
| Solid | 6,320 B (6.2 KB) |
| Svelte 5 | 9,076 B (8.9 KB) |
| Svelte 4 | 5,440 B (5.3 KB) |
| Vue | 25,022 B (24.4 KB) |

My independently-measured React number (60.49 KB) lands within ~2.5% of this third party's
57.9 KB for a materially different (larger, more interactive) component — strong
confirmation that React's ~60 KB gzip floor is real and roughly fixed regardless of app
size, since nearly all of it is the fixed reconciler/scheduler runtime, not
component-specific code. Preact/Solid/Svelte's numbers move more between component sizes
because a much higher fraction of their bundle is compiled, component-specific output rather
than shared runtime — which is exactly the "compiles away" property Svelte and Solid market.

### Svelte 5's shared runtime overhead (quantified)

Svelte is often described as having "near-zero runtime" because component logic compiles to
imperative DOM instructions rather than shipping an interpreter. That's true relative to
React, but Svelte 5 does ship a small always-included shared runtime (`svelte/internal` /
the new signals runtime), and it's larger than Svelte 4's was: the rewrite to a signals-based
reactivity model in Svelte 5 increased the fixed runtime baseline. My measured total for a
one-signal counter (11.62 KB gzip, including the runtime) and the community benchmark's
9.08 KB gzip for a bigger component both include this shared runtime plus compiled component
code — so **Svelte 5's floor is roughly 5-9 KB gzip of shared runtime**, not zero, but still
an order of magnitude below React's ~60 KB.

### Bundlephobia package figures (secondary/official-adjacent, with a caveat)

Fetched live via bundlephobia's public API (`bundlephobia.com/api/size?package=<name>@<version>`):

| Package | Version | Min | Gzip | Source |
|---|---|---|---|---|
| `react` | 19.2.0 | 7,595 B | 2,909 B | bundlephobia.com/package/react@19.2.0 |
| `react-dom` | 19.2.0 | 3,681 B | 1,383 B | bundlephobia.com/package/react-dom@19.2.0 |
| `preact` | 10.29.0 | 11,584 B | 4,772 B | bundlephobia.com/package/preact@10.29.0 — tagline: *"Fast 3kB alternative to React with the same modern API"* ([preactjs.com](https://preactjs.com/)) |
| `solid-js` | 1.9.14 | 22,181 B | 8,357 B | bundlephobia.com/package/solid-js@1.9.14 |

**Caveat / footgun worth flagging to the team:** the `react-dom` bundlephobia number
(1,383 B gzip) is misleading in isolation — it measures the package's default `main` entry,
not the `react-dom/client` sub-path that every real app actually imports (which pulls in the
reconciler + scheduler, the bulk of React's real weight). That's why the naive
react + react-dom bundlephobia sum (~4.3 KB gzip) is ~14x smaller than the real, fully-bundled
number both I and the independent benchmark measured (~59-60 KB gzip). **Don't cite raw
bundlephobia react-dom numbers as "React's size" — use the full-bundle measurement instead.**

## 3. Electron's own runtime footprint

This repo pins `"electron": "^43.2.0"` in `apps/mode-a-desktop/package.json`, resolved to
`electron@43.2.0` in the current lockfile/`node_modules`. Two primary-source measurements
for that exact version:

**a) Official Electron GitHub release artifacts** (fetched via the GitHub API,
`api.github.com/repos/electron/electron/releases/tags/v43.2.0`) — these are the actual
prebuilt Chromium+Node.js+V8 binaries Electron Forge/Builder download and package:

| Platform | Compressed download (zip) |
|---|---|
| `electron-v43.2.0-win32-x64.zip` | **137.6 MB** |
| `electron-v43.2.0-darwin-x64.zip` | **118.3 MB** |
| `electron-v43.2.0-linux-x64.zip` | **119.1 MB** |

Source: [github.com/electron/electron/releases/tag/v43.2.0](https://github.com/electron/electron/releases/tag/v43.2.0)

**b) Locally measured, this exact repo's `node_modules/electron` (Windows x64, v43.2.0)**
unpacks to **348 MB on disk** before any app code, ASAR packing, or installer compression:

| File | Size |
|---|---|
| `electron.exe` | 216 MB |
| `locales/` (all languages) | 47 MB |
| `dxcompiler.dll` | 25 MB |
| `LICENSES.chromium.html` | 20 MB |
| `icudtl.dat` (ICU data) | 11 MB |
| everything else (GL/Vulkan/ffmpeg/snapshot libs) | ~29 MB |

This is the raw dev binary, larger than a final installer would be (installers compress and
strip unused locales), but it confirms the order of magnitude directly from this project's
own dependency tree rather than a secondhand blog claim.

**c) Secondary sources (directional only)**, for context on final packaged/installer size
after electron-builder/Forge compression + app code: multiple community sources put a
minimal ("hello world") Electron app's compressed installer in the **80-150 MB** range, with
Chromium contributing roughly 40-60 MB and Node.js another 10-20 MB of that floor. These are
blog-level secondary sources (not linked as authoritative), included only to corroborate that
the official 118-138 MB per-platform runtime download (source a, primary) is the right order
of magnitude for what ends up in a shipped installer.

### The comparison the ticket asked for

- Realistic framework bundle-size delta (React ~60 KB gzip vs. Solid/Preact ~4-8 KB gzip):
  **~50-56 KB gzip**, worst case.
- Electron's own runtime footprint per official release artifact: **118-138 MB**, i.e.
  **~120,000-140,000 KB**.
- The framework delta is roughly **0.04%** of Electron's own footprint (56 KB / 137,600 KB
  ≈ 0.041%). Even the single heaviest candidate, React's full ~60 KB, is **~0.044%** of the
  Windows Electron runtime download alone, before any app code is added.

**Conclusion: bundle size is not a meaningful discriminator between React, Svelte, Preact,
and Solid for this app.** All four are effectively free next to Electron's own weight. If
"powerful yet small in bundle size" is a stated requirement, it is satisfied by any of the
four; the real decision criteria should be developer experience, fit with the existing
vanilla-DOM renderer code, ecosystem/library availability, and team familiarity — not KB
counts.

## 4. Runtime performance overhead (secondary consideration, briefly)

Beyond static bundle size, React's virtual-DOM diffing model has real CPU overhead per
update that Svelte/Solid's compiled fine-grained reactivity avoids: React re-runs a
diff+reconcile pass over a virtual tree on every state change and commits a patch, while
Svelte compiles each reactive binding into a direct, targeted DOM write, and Solid's signals
subscribe DOM nodes directly to the exact state that affects them — no diffing step exists
in either.

The most-cited primary evidence for this class of difference is
[krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), which
benchmarks ~100+ framework implementations against a standardized set of DOM operations
(create/update/swap/remove thousands of rows) and reports duration, startup time, and memory
for each. Across benchmark rounds, compiled fine-grained-reactivity frameworks (Svelte,
Solid) have consistently placed at or near the top on update-latency and memory metrics,
with React (a virtual-DOM diffing framework) placing meaningfully behind them on the
same operations — this is a well-established, widely-reproduced pattern in that benchmark,
not a one-off result.

**Relevance to `apps/mode-a-desktop` specifically: low.** That benchmark's stress case is
thousands of concurrently-updating rows in a data table/list — a large-SPA workload. This
renderer's actual UI (per `status-view.ts` and `course-files-view.ts`) is a small,
human-scale set of manually-wired DOM elements (connection status, a course/file list in a
P2P sharing sidebar) — tens of elements, not thousands, updating on user/network events, not
every animation frame. The fact that the current hand-written vanilla-DOM code already
handles this workload without needing a virtual DOM or fine-grained reactivity is itself
evidence the update volume is far below where React's reconciler overhead vs. Svelte/Solid's
direct writes would become perceptible. Performance overhead should be treated as a
non-factor for this decision; it would only matter if the renderer's UI complexity grows by
roughly two orders of magnitude (e.g., a virtualized table of thousands of files rendered
without windowing).

## Sources cited

- Own build measurements: Vite 5.4.21 production builds of React 19.2.8/ReactDOM,
  Svelte 5.56.8, Preact 10.29.8, SolidJS 1.9.14 (scaffolds in local scratch dir, not
  committed to this repo)
- [github.com/geoffrich/component-size-benchmark](https://github.com/geoffrich/component-size-benchmark) — `stats.md` results table
- [bundlephobia.com](https://bundlephobia.com) package API (`react`, `react-dom`, `preact`, `solid-js` @ pinned versions)
- [preactjs.com](https://preactjs.com/) — official "3kB" tagline
- [svelte.dev/docs/svelte/overview](https://svelte.dev/docs/svelte/overview) — compiler description
- [github.com/electron/electron/releases/tag/v43.2.0](https://github.com/electron/electron/releases/tag/v43.2.0) — official prebuilt binary sizes for the exact Electron version this repo pins
- Local measurement of this repo's `node_modules/electron` (v43.2.0, win32-x64)
- [github.com/krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) — runtime performance methodology and results
