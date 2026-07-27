# campvus

Campus P2P content distribution — a pnpm workspace.

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
                        @campvus/engine directly, tray-only until opened. See ADR-0001/0003/0004.
  mode-b-api/           @campvus/mode-b-api — Mode B's backend: direct-upload API,
                        auth/enrollment, origin storage. See its own README.
  mode-b-web/           @campvus/mode-b-web — Mode B's teacher UI (React + Vite): upload
                        files, manage courses/enrollment. No student UI yet — that needs
                        a Node/Electron shell for real P2P, not a browser. See its own README.
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
For the Mode B backend API, see [`apps/mode-b-api/README.md`](./apps/mode-b-api/README.md).
For the Mode B teacher UI, see [`apps/mode-b-web/README.md`](./apps/mode-b-web/README.md).

To test it yourself, run the desktop app with:
CAMPVUS_COURSE_ID=COMSCI214 CAMPVUS_INSTITUTION_PUBLIC_KEY=<paste from apps/mode-a-headless/institution-keys.json> pnpm --filter mode-a-desktop start
alongside a headless peer-node (or a second desktop instance) on the same course/network — the tray should now show real peer counts and sync status instead of "idle, 0 peers" always.
