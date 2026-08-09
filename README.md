# campvus

[![Desktop CI & Release](https://github.com/Thagana/campvus/actions/workflows/desktop-ci.yml/badge.svg)](https://github.com/Thagana/campvus/actions/workflows/desktop-ci.yml)

Campus P2P content distribution — a pnpm workspace.

Campvus is a **nonprofit, open-source initiative**: the goal is cheap, resilient content
distribution for schools with limited bandwidth/infrastructure, not a commercial product.
Contributions, forks, and self-hosted deployments are welcome — see [License](#license) and
[Contributing](#contributing) below.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full system design (two product
modes sharing one engine) and current implementation status.

## Layout

```
packages/
  engine/               @campvus/engine — the shared P2P content-distribution engine:
                        hashing, signing, manifest model, swarm distribution, origin
                        fallback, seeding/eviction policy. Used identically by every
                        product mode.
apps/
  mode-a-headless/      @campvus/mode-a-headless — Mode A: sits beside an existing LMS,
                        no UI of our own. CLI-only spike today. See its own README for
                        setup and the LAN-discovery walkthrough.
  mode-a-desktop/       Mode A's actual near-term companion app (Electron) — wraps
                        @campvus/engine directly, tray-only until opened. Ships Sentry
                        error reporting with a PII-scrubbing backstop. See its own README,
                        and ADR-0001/0003/0004.
  mode-b-api/           @campvus/mode-b-api — Mode B's backend: direct-upload API,
                        auth/enrollment, origin storage. See its own README.
  mode-b-web/           @campvus/mode-b-web — Mode B's teacher UI (React + Vite): upload
                        files, manage courses/enrollment, platform-admin school rosters.
                        No student UI yet — that needs a Node/Electron shell for real P2P,
                        not a browser. See its own README.
  campvus/              A Kotlin Multiplatform Compose app scaffold (Android/iOS/Desktop)
                        — a separate toolchain (Gradle, not pnpm). Parked as the mobile
                        client (ADR-0002) until Hyperswarm-on-mobile is picked back up.
```

`packages/engine` + everything under `apps/` except `apps/campvus` are the pnpm workspace
(see `pnpm-workspace.yaml`); `apps/campvus` is a sibling managed by its own Gradle tooling.

## Setup

```
pnpm install
```

## Commands (run from repo root, fan out across the pnpm workspace)

```
pnpm typecheck   # tsc --noEmit in every package
pnpm test        # runs each package's test script (packages/engine, apps/mode-b-api)
```

For the Mode A CLI walkthrough (generating keys, simulating a lecturer upload, running
the peer-to-peer swarm), see [`apps/mode-a-headless/README.md`](./apps/mode-a-headless/README.md).
For the Mode A desktop app (config, Sentry observability, `electron-forge` packaging), see
[`apps/mode-a-desktop/README.md`](./apps/mode-a-desktop/README.md).
For the Mode B backend API, see [`apps/mode-b-api/README.md`](./apps/mode-b-api/README.md).
For the Mode B teacher UI, see [`apps/mode-b-web/README.md`](./apps/mode-b-web/README.md).

To test the desktop app yourself, run it alongside a headless peer-node (or a second desktop
instance) on the same course/network — see the "Configuration" section in its own README for
the env vars — and the tray should show real peer counts and sync status instead of "idle, 0
peers" always.

## Contributing

This is a community-maintained, nonprofit project — issues and specs are tracked as local
markdown files under [`.scratch/`](./.scratch) rather than a hosted issue tracker; see
[`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md) and
[`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md) for how work is proposed and
picked up. Open a PR against `master` (see `docs/agents/release-process.md` for the branch
model) — bug reports, docs fixes, and new institutions/schools wanting to pilot Campvus are
all welcome.

## License

MIT — see [`LICENSE`](./LICENSE). Free to use, modify, and self-host; no warranty, as-is.
