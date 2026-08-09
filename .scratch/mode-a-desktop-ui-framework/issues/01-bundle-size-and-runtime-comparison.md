Type: research
Status: resolved

# Bundle size and runtime comparison

## Question

For `apps/mode-a-desktop`'s actual Vite + Electron Forge renderer build, what is the real
gzipped bundle-size and runtime-overhead delta between React, Svelte, and any other
credible "powerful yet small" candidate (e.g. Preact, Solid)? Also quantify how that delta
compares to Electron's own Chromium-driven installer footprint, so the map can judge
whether "small bundle size" is actually a meaningful discriminator between candidates here,
or a rounding error next to the runtime's own weight.

## Answer

Bundle size does not meaningfully discriminate between React, Svelte, Preact, and Solid for
this app. Self-measured real Vite production builds: React+ReactDOM ≈ 60.5 KB gzip, Svelte 5
≈ 11.6 KB, Preact ≈ 5.8 KB, Solid ≈ 3.5 KB (cross-checked within 2.5% against an independent
third-party benchmark). Electron's own official runtime binary for this repo's pinned version
(43.2.0) is 118-138 MB per platform. The worst-case framework delta (~56 KB) is ~0.04% of
Electron's own footprint — a rounding error, not a real discriminator. All four candidates
satisfy "small bundle size" equally; the decision should turn on DX/tooling fit and team
familiarity instead (see Tooling and ecosystem fit).

Full findings, methodology, and sources: [issues/01-research-findings.md](01-research-findings.md)
(also on branch `research/bundle-size-and-runtime-comparison`, commit `8a8e4b8`).
