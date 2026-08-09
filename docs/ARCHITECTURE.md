# Campus P2P Content Distribution Platform — Architecture (Draft v0.7)

## 1. Problem Statement

Students on mobile data repeatedly download the same course materials (slides, readings, past papers) that many of their coursemates have already downloaded — often from the same residence, suburb, or campus area. Every one of those repeats costs the student money, even though a nearby peer already paid for the identical file.

**Goal:** distribute course content peer-to-peer among enrolled students, so only the first download per file per area costs real bandwidth, with the institution as the paying customer — not a general P2P search or content network.

**This is not an LMS.** Where an LMS is present, it keeps doing everything it already does — enrollment, grading, structure, forums. This system is a content delivery accelerator that sits beside it, watching for new uploads and distributing them more cheaply. See §10 for the integration boundary.

---

## 2. Why This Scope Works (vs. general P2P search)

- **Single, known, authoritative content source** — the institution — not an open population of untrusted peers. Trust is a signature check, not quorum/reputation.
- **Content is static and non-personalized** — identical file for every enrolled student, the ideal case for P2P (this is what BitTorrent already does well).
- **Real paying customer** (the institution), not "the whole internet" — solves the P2P chicken-and-egg adoption problem, since enrollment already creates dense, motivated peer clusters (everyone wants week 6's slides at the same time).
- **Natural cluster locality** — coursemates often live in the same residences/suburbs, which is exactly the LAN/local-network scope where P2P transfer is genuinely free.

---

## 3. Product Modes, One Shared Engine

Everything below this section — hashing, signing, the manifest model, the swarm, discovery tiers, seeding rules — is **one engine**, built once. What changes between the two products we ship is only: how content gets *in*, who provides identity/enrollment, and whether there's a UI on top.

### 3.1 Mode A — Headless (sits beside an existing LMS)

The original scope this repo's spike validates. We own no student- or teacher-facing product surface.

- **Ingestion** = the LMS watcher (webhook or polling — §5.1). Teachers keep uploading through the LMS exactly as they do today; we never touch that workflow.
- **Identity/enrollment** is borrowed from the LMS via its existing API — we don't own accounts.
- **Origin fallback** is the LMS's own file storage (§5.6) — we never become the source of truth for a file, only a faster path to it.
- **No UI of ours.** The student side is a thin background agent (not an app with screens) whose only job is invisible caching/seeding — students keep browsing and opening files inside the LMS itself; our layer just makes the bytes arrive from a peer instead of the LMS server when possible.
- **Infra footprint for us:** the watcher/ingestion service and swarm bootstrap only. No servers to host content, no accounts to manage.
- This is exactly what `packages/engine` (the shared engine, `@campvus/engine`) + `apps/mode-a-headless` (the Mode A adapter and thin CLI shims — `src/watcher.ts`/`src/peer-node.ts`/`src/identity.ts`) are today, organized as a pnpm workspace (TypeScript, run via `tsx`, no build step yet). See §13 for what's built vs. outstanding.
- **Mobile companion app: parked (not abandoned).** `apps/campvus` was reset to an Expo (React Native) scaffold, but Hyperswarm/HyperDHT don't run in Expo's managed workflow and only run in bare RN via an embedded Node runtime (`nodejs-mobile`) with hand-compiled native crypto/UDP modules and no iOS simulator support — a substantial separate project. See [ADR-0002](./adr/0002-electron-desktop-client-mobile-parked.md). `apps/campvus` stays in the repo unwired until mobile is picked back up.
- **`apps/mode-a-desktop`** (Electron) is the actual near-term **Mode A companion app** (shape A2 from §10, per [ADR-0001](./adr/0001-mode-a-companion-app-not-lms-plugin.md), which resolves Open Question #8) — it wraps `packages/engine` directly, since Hyperswarm already runs natively on desktop Node with no native-mobile complications (see [ADR-0002](./adr/0002-electron-desktop-client-mobile-parked.md)).

### 3.2 Mode B — Full App (we deploy infra, own both ends)

For institutions with no LMS integration, or where deeper product ownership is the pitch.

- **Ingestion collapses**: there's no external system to watch — a teacher's upload through our own UI *is* the ingestion event, calling straight into the same hash → sign → publish pipeline Mode A's watcher calls after it detects a file.
- **We own identity/enrollment** — course rosters, auth, access control. This is genuinely new work Mode A gets for free from the LMS.
- **We own origin fallback** — our own storage becomes the "always works" fallback tier instead of the LMS's.
- **We build UI** for two audiences: teachers (upload, manage course files) and students (browse, download, see sync/seed status).
- **Live classes** is a plausible future feature once this exists. **Superseded:** the assumption below that this needs a separate WebRTC/SFU engine has been revisited — see [ADR-0007](./adr/0007-live-lessons-relay-over-hyperswarm-not-webrtc.md) and Open Question #7.
- **Backend built:** `apps/mode-b-api` (Fastify) implements the direct-upload API, auth/enrollment, and origin storage — see §13.
- **Teacher UI built:** `apps/mode-b-web` (React + Vite) — login/register, create/list courses, upload files, view a course's manifest list, enroll students by email. No P2P needed for this surface (it's plain HTTP to the API), so a browser app is sufficient — unlike the student client (below).
- **Student client: mostly built, unvalidated.** Per §5.5, a real Mode B student client needs actual swarm participation (not just centralized downloads), which means it needs the same Node/Electron shell Mode A's desktop client uses — a browser can't run Hyperswarm. Rather than a separate app, `apps/mode-a-desktop` was extended in place: its "Sign in to Campvus" flow (added for Mode A/B interop testing, §9/§13.2) already logs a student into a live `apps/mode-b-api`, derives the institution public key + enrolled course IDs from it, and runs the same `@campvus/engine` swarm node Mode A uses — the engine doesn't care which mode issued the topic/key. It now also re-checks enrollment on a timer so a newly-added course is picked up without re-authenticating. **Still unvalidated:** real peer-to-peer swarm discovery/download between two Mode-B-authenticated clients has never been run end to end — only the origin-fallback path (one client fetching bytes from `apps/mode-b-api` directly) has been tested. See §13.2.

### 3.3 What's actually shared (the engine, don't fork this)

| Engine piece | Section |
|---|---|
| Content hashing, manifest signing/verification | §5.2, §5.3, §6 |
| Content-addressing & dedup | §5.3 |
| Swarm registry, topic derivation, tiered discovery | §5.4, §8 |
| Seeding rules (Wi-Fi-only, eviction, seed-after-complete) | §7 |
| Peer-first / origin-fallback resolution, verify-on-receipt | §5.5, §5.6, §9 |

The only mode-specific pieces are the **ingestion adapter** (§5.1: LMS watcher vs. direct upload API) and **whatever UI, if any, sits on top**. Building Mode A first (lower infra cost, matches the current spike) keeps the engine's interfaces honest before Mode B adds a second ingestion path and real UI on top of the same pipeline.

---

## 4. High-Level Flow

```
Content enters the system
 (Mode A: watcher detects LMS upload — Mode B: teacher uploads directly)
              │
              ▼
   Fetch file → compute content hash
   (dedup: identical files share one object)
              │
              ▼
   Sign manifest with institution key
   (Ed25519, key held in KMS/HSM)
              │
              ▼
   Publish signed manifest to swarm registry
   (scoped to that course's topic)
              │
              ▼
   Enrolled students' apps detect new manifest
   (foreground live, background periodic sync)
              │
              ▼
   App diffs manifest against local files,
   enqueues only what's missing
              │
              ▼
   Resolve download: check peer swarm first →
   fall back to origin server if no peer has it
   (Mode A: LMS's origin — Mode B: our own origin)
              │
              ▼
   File delivered, verified against signed hash
              │
              ▼
   Device becomes a seed for that file too
```

---

## 5. Components

### 5.1 Ingestion Adapter (mode-specific; everything downstream is shared engine)
- **Mode A — LMS watcher:** subscribes to LMS webhooks per course where available (e.g. Moodle event observers on file/module creation); falls back to scheduled polling against the LMS's REST API where webhooks aren't supported.
- **Mode B — direct upload API:** a teacher's upload call is itself the ingestion event; no polling or webhook layer needed.
- Either way, the adapter's job ends at "fetch file, compute hash, build and sign manifest, publish it" — the same call into the shared engine (§5.2, §5.3).

### 5.2 Signing & Key Custody (shared)
- Institution holds an Ed25519 keypair. Private key lives in a proper KMS (AWS KMS, or an on-prem HSM if required by institutional compliance) — never in application code or config.
- The ingestion adapter calls KMS to sign; it never holds raw key material in memory.
- Every student app/agent is provisioned with the institution's public key (bundled at install, or fetched once out-of-band) to verify manifests.
- Key rotation/revocation needs a defined mechanism (see §12, open questions) so a compromised key can be retired without breaking trust for content signed under a previous key.

### 5.3 Content Manifest & Object Model (shared)
- Content is addressed by hash, not by filename or LMS internal ID — identical files (re-uploads, shared readings across courses) collapse to one stored object.
- Manifest fields: content hash, course ID, filename, upload timestamp, file size, signature, signer key ID.
- The manifest is what's signed and distributed first; file bytes are distributed separately via the P2P content layer, verified against the manifest's hash on arrival.

### 5.4 Swarm Registry & Topics (shared)
- Each course maps to a derived topic key (hash of course ID, not the raw ID) — avoids leaking plaintext course identifiers to the wider DHT.
- New manifests are announced on that course's topic.
- Discovery is tiered: LAN-first (same Wi-Fi/residence network, zero data cost), then a locally-scoped swarm (same suburb/area), then wide DHT as last resort for peers who are enrolled but not physically nearby.

### 5.5 Student App / Agent (shared engine, mode-specific chrome)
- Syncs enrollment (from the LMS in Mode A, from our own auth in Mode B) to know which topics to subscribe to.
- Foreground: live swarm connection, sees new manifests as they're announced.
- Background: periodic check-in (on app open, and opportunistically on Wi-Fi + charging) — deliberately not instant push, to avoid needing an always-on notification backend.
- Diffs incoming manifests against locally-held content hashes; enqueues only missing files.
- Resolves each download through peer swarm first, origin server as fallback, verifying every file against its signed manifest hash before accepting it.
- After a successful download, keeps the file and continues announcing itself as a source (seeding) — subject to storage/eviction and network-type rules (§7).
- In Mode A this runs with no dedicated UI (invisible background agent); in Mode B it's the engine underneath a full student app with browse/download screens.
- **`apps/mode-a-desktop` (Electron) specifics:** auto-launches at login as tray-only — the Main process owns the engine lifecycle directly and no `BrowserWindow` exists until the user opens the tray icon, keeping idle cost close to a plain Node process instead of a typical Electron tray app's ~1GB idle footprint. See [ADR-0003](./adr/0003-desktop-agent-lazy-window.md). Status at a glance (no window open) is conveyed by swapping the tray icon image itself — idle / syncing / error — with supplementary detail (e.g. file/peer counts) in the tray tooltip text, the same pattern Dropbox/OneDrive/Google Drive use; anything finer-grained waits for the window to be opened.
- **Config surface (closes gap #12):** `courseIds`, the institution public key, origin URL, region (Tier 2), and max store size are no longer env-var-only. `config-store.ts` persists them to `desktop-config.json` in the app's userData dir; env vars still seed first-run defaults but a saved file value wins per field. The window's Settings panel (`renderer.ts` + `index.html`) reads/writes this via `campvus:get-config`/`campvus:save-config` IPC calls, and `main.ts`'s `restartEngine` tears down and rebuilds the swarm node immediately on save — no relaunch needed to fix a misconfigured install, and an install with no institution key opens straight to Settings instead of a bare "not configured" tray error.
- **Multi-course support:** a student is normally enrolled in several courses at once, not one — `SwarmNodeOptions.courseIds` (an array, not a single ID) drives one DHT topic join (Tier 3) + one mDNS LanDiscovery (Tier 1) + one region topic join (Tier 2, if configured) *per course*, all sharing one Hyperswarm instance, one content-store, and one in-memory manifest map keyed by hash across every enrolled course. `applyManifestsMessage` (swarm-protocol.ts) filters an incoming peer's full manifest announcement down to whichever of *any* of the node's enrolled courses match, not just one. The CLI's positional `<courseIds>` argument and the desktop Settings panel's "Course IDs" field both take the same comma-separated convention (e.g. `COMSCI214,MATH101`).

### 5.6 Origin Fallback (shared behaviour, mode-specific backend)
- Used whenever no trustworthy peer has the content yet (first requester for any file, or a swarm with too few active peers).
- Mode A: the LMS's own file storage. Mode B: our own object storage.
- Guarantees correctness — the system never fails to deliver a file just because P2P didn't have it yet.

---

## 6. Trust Model

Deliberately simple compared to a general P2P system, because there's exactly one legitimate signer, in either mode:

1. A file is only accepted if its manifest carries a valid Ed25519 signature from the institution's known public key.
2. The received file's content hash must match the hash stated in that signed manifest.
3. No signature or hash mismatch → discard, and either try another peer or fall back to the origin server.
4. No quorum, no peer reputation scoring, no confidence scoring needed — unlike the general search-caching design, there's no ambiguity about who's authoritative.

---

## 7. Seeding Rules

Once a device finishes downloading a file, it becomes a peer source for others. Three decisions matter here and should be locked in explicitly, not left implicit:

- **Seeding default is per-product-surface, not global.** See [ADR-0004](./adr/0004-desktop-seeds-freely-by-default.md): `apps/mode-a-desktop` **seeds freely by default** (opt-out for tethered/hotspot connections) since laptops normally sit on unmetered home/campus Wi-Fi or ethernet. The parked mobile client (ADR-0002) keeps the original **Wi-Fi/LAN-only-by-default** rule — never seed over mobile data unless the student explicitly opts in — since that's where metered cellular plans actually make seeding costly to the seeder. Either default is only meaningful once network-type detection is real; that's now the case on Windows, macOS, and Linux (see §13.1) — `--seed=auto` uses it, `--seed=on|off` remains a manual override.
- **Storage eviction policy.** Devices can't seed everything forever — cap local storage (e.g. only actively-enrolled courses, evict after term end, LRU by last-access). Configurable, with a sane default.
- **Seed-while-downloading vs. seed-only-after-completion.** True BitTorrent-style partial-piece seeding is more efficient but more complex. Recommend starting with the simpler "seed only after a file is fully downloaded and verified" model for v1, revisiting partial-piece seeding once the simpler version is proven.

---

## 8. Discovery Scope (Adaptive)

A fixed geohash radius doesn't work equally well in a dense city block vs. a rural campus residence — scope should expand in tiers rather than assume one distance:

1. **LAN** — same Wi-Fi network (residence, campus Wi-Fi).
2. **Local cluster** — nearby but not same LAN (adjacent res, same suburb) via a locally-scoped swarm topic.
3. **Wide DHT** — last resort, for enrolled students who are geographically dispersed (this still saves the origin server load even if it doesn't save the requester's own data cost, since discovery/coordination overhead is small relative to file size).

Expanding-ring search (try LAN, widen only if no peers found within a time budget) is simpler to implement correctly than trying to pre-compute "the right" radius per institution/region.

---

## 9. Offline & Sync Behaviour

- A student who hasn't opened the app in a week should see and be able to request every manifest published while they were away — sync diffs against the *full current manifest list* for their courses, not just live events, so nothing is silently missed.
- Fully offline: serve whatever's already local; no partial/incomplete state should be presented as complete.
- Reconnect: resolve queued downloads through the normal peer-first, origin-fallback path.
- **Peer gossip already does the "full list" diff** — `swarm-protocol.ts`'s `applyManifestsMessage` processes a peer's entire known-manifest list (not incremental events) every time, so a client back from a week offline catches up fine as soon as *any* peer is reachable. The gap this section originally flagged was the **origin** side: origin fallback (§5.6) only ever fetched file *bytes* by hash, never the manifest *list* itself — so a client with zero reachable peers had no way to learn what it was missing. `engine/manifest-sync.ts`'s `syncManifestsFromOrigin` closes that: it fetches the origin's current manifest list (`httpManifestListFetcher`, mirroring `httpOriginFetcher`'s shape) and runs it through the exact same verified diff as peer gossip — same trust model (§6), same rejection-on-bad-signature, whether the source is a peer or the origin. `apps/mode-b-api` already exposes the matching endpoint (`GET /courses/:courseId/manifests`); Mode A has no equivalent yet since there's no real LMS integration (Open Question #9).
- **The bridge is now wired on the Mode A side (closes the mechanism half of gap #3, docs/TODO.md):** `swarm-node.ts`'s `createSwarmNode` takes an optional `manifestListFetcher` (+ `manifestSyncIntervalMs`) and calls it once on `start()` (the "on app open" check-in) and again on the configured interval if set — same `considerMissing`/origin-fallback path as a peer-announced manifest. `apps/mode-a-headless`'s CLI exposes this as `--manifest-origin=<baseUrl>` / `--manifest-sync-interval-ms=<n>`; `apps/mode-a-desktop` exposes it as the Settings panel's "Manifest origin URL" field (`CAMPVUS_MANIFEST_ORIGIN_URL` env default), with a fixed 5-minute periodic re-check since it's long-running unlike the CLI. **Still open:** this only closes "no bridge exists at all" — pointing either at a live `apps/mode-b-api` still fails on the auth half (Open Question #9(a)), since `httpManifestListFetcher`/`httpOriginFetcher` make plain unauthenticated requests against session-cookie-gated routes.

---

## 10. LMS Integration Boundary (Mode A specifics)

**Mode A is infrastructure the LMS uses, not a competing product.** It never touches grading, submissions, forums, or course structure — those stay exactly where they are.

Two integration shapes, both still valid, now understood as sub-options *within* Mode A:

| Shape | Description | Tradeoff |
|---|---|---|
| **A1. LMS plugin/module** | e.g. a Moodle plugin, deepest integration, reuses LMS enrollment/auth directly | Locked to one LMS's plugin architecture; each LMS needs its own build |
| **A2. Standalone companion agent** | Syncs against the LMS via its existing API | More upfront work (own enrollment sync), but lower-risk sell to IT ("install an app," not "modify our LMS core") |

**Decided: A2.** See [ADR-0001](./adr/0001-mode-a-companion-app-not-lms-plugin.md) — A1 isn't realistically buildable against an off-the-shelf LMS's vendor-owned app, so A2 is the only viable path for the common case, not just the easier one. It also keeps the product boundary crisp — we are the pipe, not the classroom. Mode B (§3.2) is the separate, bigger-lift product where we *do* become the classroom's file layer, deliberately not the default starting point. The near-term A2 client is `apps/mode-a-desktop` (Electron); the mobile client (`apps/campvus`) is parked — see [ADR-0002](./adr/0002-electron-desktop-client-mobile-parked.md).

---

## 11. Tech Stack

| Layer | Technology |
|---|---|
| Language & tooling (current spike) | TypeScript, run directly via `tsx` — no compile/build step yet (see §13) |
| Runtime (target) | Bare / Pear — **not yet adopted**; the current spike runs on plain Node.js with the `hyperswarm` npm package, a deliberate simplification for the spike, not yet reconciled with this row |
| Content storage & transfer | Plain filesystem, content-addressed by hash (`packages/engine`'s content-store) — not Hyperdrive/Hypercore |
| Peer discovery | Tiered per [ADR-0006](./adr/0006-real-discovery-tiers.md): Tier 1 (LAN) via mDNS/`bonjour-service`, direct TCP to discovered peers; Tier 2 (local cluster) via a second Hyperswarm/HyperDHT topic scoped by an operator-set region tag; Tier 3 (wide) via the course-wide Hyperswarm/HyperDHT topic |
| Cryptography | Ed25519 signing, SHA-256 content hashing, Noise transport (via Hyperswarm; plain TCP for mDNS-discovered LAN peers) |
| Key custody | AWS KMS (or on-prem HSM per institutional requirement) |
| Mode A ingestion | LMS-native webhooks where available; REST API polling fallback |
| Mode B ingestion | Direct upload API — Fastify, `apps/mode-b-api`, calls `@campvus/engine`'s `ingestBuffer` directly |
| Mode B infra | Own auth/enrollment: Postgres via `postgres` (postgres.js — no native compile step, unlike `pg-native`/`better-sqlite3`) through Drizzle's `postgres-js` driver, schema-tracked via `drizzle-kit` migrations (`apps/mode-b-api/drizzle/`), DB-backed sessions, `@node-rs/argon2` password hashing, Schools as better-auth Organizations ([ADR-0005](./adr/0005-schools-as-organizations-fixed-roles.md)). Own origin storage: local filesystem via `@campvus/engine`'s content-store, served over HTTP (`GET /content/:hash`), gated by course enrollment. |
| Mode B teacher UI | React + Vite (`apps/mode-b-web`), served as static assets by `apps/mode-b-api` itself (`@fastify/static`) in production; Vite dev server proxies API calls in dev. Same-origin either way — no CORS/token handling needed. |
| Mode B student UI | **Not built.** Needs real swarm participation (§5.5), which needs a Node/Electron shell like `apps/mode-a-desktop` — a browser can't run Hyperswarm. |
| Mobile packaging | **Parked** — Bare mobile tooling / Pear vs. bare-RN + `nodejs-mobile` both viable in theory, neither chosen; see [ADR-0002](./adr/0002-electron-desktop-client-mobile-parked.md) |
| Desktop packaging | Electron (`apps/mode-a-desktop`), wraps `packages/engine` directly — no native-mobile bindings needed, Node runs Hyperswarm natively |
| Repo structure | pnpm workspace (`packages/engine`, `apps/mode-a-headless` CLI spike, `apps/mode-a-desktop` Electron client, `apps/mode-b-api` backend, `apps/mode-b-web` teacher UI); `apps/campvus` (Expo/React Native) is the parked mobile scaffold, unwired |

---

## 12. Open Questions

1. **Key rotation/revocation** — how does a compromised or rotated institution key get invalidated across every device without breaking trust in already-distributed, validly-signed content?
2. **Multi-institution model** — does each institution hold its own keypair (clean isolation, but a student at two institutions needs two trust roots), or is there a shared registrar model? Simple isolation is probably right for v1.
3. **LMS ToS/API rate limits** — needs confirming per LMS vendor before committing to a polling cadence or webhook dependency (Mode A only).
4. **Pilot scope** — single course, single residence, before wider rollout. ~~Validate the LAN discovery assumption in real conditions~~ **Resolved for same-Wi-Fi Tier 1: confirmed on two physical laptops on the same Wi-Fi network, connecting within a few seconds and completing a verified transfer.** Still open: cross-network conditions (different Wi-Fi, mobile hotspot, campus NAT/firewall) and whether Tier 2 (local cluster) / Tier 3 (wide DHT) behave the same way.
5. **Business model detail** — per-institution licensing vs. infrastructure-cost-savings pitch for Mode A; different pricing logic likely needed for Mode B since we're hosting real infra. Needs a concrete pilot conversation with one university's IT/library department to validate before generalizing.
6. **Mode B auth/enrollment ownership** — building our own accounts and course rosters from scratch is new surface area Mode A never needed. Needs its own design pass before Mode B work starts; should not block Mode A.
7. ~~**Live classes (future, Mode B only)** — real-time A/V is a different engine (likely WebRTC/SFU) from P2P static-file caching.~~ **Resolved (architecture):** live lesson streams relay chunked segments over the existing Hyperswarm swarm — not a separate WebRTC/SFU engine — since the desktop client isn't browser-WebRTC-constrained the way the surveyed prior art was, and the one-way-broadcast session model tolerates peer-relay's multi-second latency class. See [ADR-0007](./adr/0007-live-lessons-relay-over-hyperswarm-not-webrtc.md) and `.scratch/live-lesson-streaming/`. Still gated in practice on Mode B's file-distribution P2P swarm being validated end-to-end (§13.2) before building live relay on top of it.
8. ~~**Mode A student-side footprint** — does the invisible background agent (§5.5) ship as its own minimal companion app (A2), or embed inside the LMS's own mobile app as a plugin/SDK (A1)?~~ **Resolved: A2**, see [ADR-0001](./adr/0001-mode-a-companion-app-not-lms-plugin.md) and §10. Still open beneath this: the OS-level trigger/scheduling mechanism for the background agent now that it's a standalone app (Android `WorkManager`/foreground service vs. iOS `BGTaskScheduler` constraints) — not yet designed.
9. ~~**Mode A/Mode B origin interop**~~ **Resolved (Phase 2):** found while integration-testing (§13.2), not a design assumption — pointing Mode A's `peer-node.ts --origin` flag at a live `apps/mode-b-api` server didn't work, for two independent reasons: (a) `httpOriginFetcher`/`httpManifestListFetcher` made plain unauthenticated requests against Mode B's session-cookie-gated routes; (b) there was no manifest-sync bridge between the two products' registries. (b) turned out to already be solved by §9's `manifestListFetcher`/`syncManifestsFromOrigin` bridge (tested against Mode B's real route shape) — only (a), the auth half, was the actual gap. Closed by: `auth/auth.ts` now registers better-auth's `bearer()` plugin, so any Mode B route that already accepts a session cookie transparently accepts `Authorization: Bearer <session-token>` too, with zero guard-code changes (`auth/guards.ts` is unchanged). A new unauthenticated `GET /public-key` route (`routes/public-key.ts`) exposes the institution's public key for out-of-band bootstrap (§5.2). `origin.ts`'s `httpOriginFetcher` and `manifest-sync.ts`'s `httpManifestListFetcher` both take an optional `headers` param for this; `apps/mode-a-desktop`'s Settings panel now has a "Sign in to Campvus" flow (`campvus:login-mode-b` IPC handler) that signs in against a live Mode B server, captures the bearer token, and auto-fills `courseIds`/`institutionPublicKeyHex`/`originUrl`/`manifestOriginUrl` from it — a student no longer hand-copies any of those. The CLI gets the same capability via a new `--bearer-token=<token>` flag on `peer-node.ts`.

---

## 13. Current Implementation Status

### 13.1 Mode A spike

What exists today in `packages/engine` (`@campvus/engine`) + `apps/mode-a-headless` (TypeScript, pnpm workspace, run via `tsx`, no build step yet), versus what's still outstanding:

**Built and tested:**
- §5.2 signing/verification (crypto only) — Ed25519 sign/verify with tamper detection. **KMS/HSM custody is not built**; the secret key still lives in a local JSON file, explicitly flagged as spike-only.
- §5.3 manifest & object model — content-hash addressing and dedup, working and tested.
- §5.4 swarm topics — topic derivation (`sha256(courseId)`) works. As of [ADR-0006](./adr/0006-real-discovery-tiers.md), this is no longer a single flat join: `swarm-node.ts` also joins a region-scoped topic (`courseId + ':' + region`) when a region tag is configured (Tier 2).
- §6 trust model — fully implemented and tested: signature check + hash check on receipt, reject and no partial acceptance on either mismatch.
- §5.5 student-agent protocol logic — gossip manifests, diff against local, request missing, verify-on-receipt, become-a-seed; all pure and tested. CLI-only — no real app lifecycle (foreground/background, periodic check-in).
- **Cross-device LAN discovery (§8 Tier 1)** — confirmed on two physical laptops on the same Wi-Fi network: connected within a few seconds, full manifest-gossip → request → download → verify cycle completed. This resolves what the README called the single most important open question. See Open Question #4.
- **§5.6 origin fallback** — `engine/origin.ts`: when content isn't obtained from any peer within a configurable timeout (`--origin-timeout-ms`, default 15s), fetches it from a configured HTTP origin (`--origin=<baseUrl>`) and verifies it against the signed manifest hash exactly like peer-delivered content. Smoke-tested with no peer available at all — the file arrived from origin alone. `httpOriginFetcher` is a generic stand-in; a real Mode A adapter would point this at the LMS's actual file endpoint.
- **§7 seeding rules** — storage eviction is real: `engine/eviction.ts` enforces an LRU-by-last-access cap (`--max-store-bytes`), evicting oldest-accessed content first, smoke-tested. Seed-only-after-completion was already true and remains so. **Metered-connection detection is real on all three desktop platforms (closes gap #10, docs/TODO.md)**: `engine/network-type.ts` shells out to a platform-specific OS call, all fail-safe to `null` (unknown) on any error, matching `networkAwareSeedingPolicy`'s "seed freely whenever undeterminable" default (per [ADR-0004](./adr/0004-desktop-seeds-freely-by-default.md)):
  - **Windows**: PowerShell reaching WinRT's `NetworkInformation`/`GetConnectionCost()` API — smoke-tested on real hardware.
  - **macOS**: a `swift`-run script against `Network.framework`'s `NWPathMonitor` (`isExpensive`/`isConstrained`, the same two signals Windows' `ConnectionCost` bundles) — written against Apple's documented API, but **not verified on real macOS hardware** in this environment; degrades to `null` on a Mac without Xcode Command Line Tools installed (no `swift` binary), not just on error.
  - **Linux**: `ip route` to find the default interface, then `nmcli`'s `GENERAL.METERED` property (NetworkManager's own resolved yes/no) — works wherever NetworkManager is running (most desktop distros), `null` elsewhere (servers, systemd-networkd-only setups).

  `engine/seeding-policy.ts`'s `networkAwareSeedingPolicy` polls whichever of these applies and caches the result so seeding checks stay synchronous. The manual `--seed=on|off` override (`fixedSeedingPolicy`) remains available everywhere as a fallback; `--seed=auto` selects the network-aware policy.
- **§8 discovery — real Tier 1/2/3 separation, per [ADR-0006](./adr/0006-real-discovery-tiers.md)**: Tier 1 (LAN) uses an mDNS advertise/browse layer (`bonjour-service`) — a node advertises a `_campvus._tcp` service carrying the course topic and connects directly over TCP to same-LAN peers it discovers, bypassing the DHT entirely; Tier 2 (local cluster) joins a second Hyperswarm/HyperDHT topic scoped by an operator-set `region` tag (no region configured means Tier 2 is simply not joined); Tier 3 (wide) is the original flat course-wide topic join, unchanged. All applicable tiers are joined immediately and concurrently — no expanding-ring timer (see ADR-0006's rationale). Separately, requests are still deduped per-hash across connected peers regardless of which tier found them (only one peer is asked at a time, with a retry window if it doesn't deliver). `apps/mode-a-desktop` now wires this through too — `main.ts` reads `CAMPVUS_REGION` (same convention as `peer-node.ts --region`) and passes it into `createSwarmNode`, so the Electron client gets Tier 2 whenever an operator sets that env var, not just Tier 1 + Tier 3.
- **§9 offline/sync semantics** — `engine/manifest-sync.ts`'s `syncManifestsFromOrigin` fetches the origin's full current manifest list and runs it through the same verified diff peer gossip already used, closing the gap for a client with zero reachable peers. `httpManifestListFetcher` is a generic stand-in (tested against `apps/mode-b-api`'s actual `GET /courses/:courseId/manifests` shape). **Now wired into a real Mode A adapter**, both the CLI (`--manifest-origin`) and `apps/mode-a-desktop` (Settings panel) — see §9's bridge note above. The auth half (Open Question #9(a)) is still open, so this only actually delivers against an origin that doesn't require a session cookie; there's still no real LMS integration to point it at either.

**Not built yet:**
- §10 real LMS integration — watcher is still a manual CLI trigger; no webhook/polling code exists.
- Real Wi-Fi/mobile-data detection (see above) — needs OS-level APIs, deferred to real mobile packaging.
- Mode B (§3.2) and live classes (§12.7) — untouched, deliberately deferred.

**Open Question #4 is now resolved for Tier 1 (same Wi-Fi):** confirmed on two physical laptops on the same Wi-Fi network — Hyperswarm's DHT bootstrap connected within a few seconds, manifest gossiped, file requested, downloaded, and hash-verified. This was the single highest-priority validation step and it de-risks Mode A's core LAN-first assumption. [ADR-0006](./adr/0006-real-discovery-tiers.md) has since added the actual Tier 1 (mDNS) and Tier 2 (region-scoped topic) mechanisms, replacing the single flat topic join described above.

What's still open on discovery specifically: cross-network conditions (different Wi-Fi networks, mobile hotspot, campus NAT/firewall) haven't been tested for any tier, and Tier 2 hasn't been validated against a real multi-node region deployment — only unit/manual-tested locally, per ADR-0006's own caveat.

### 13.2 Mode B backend + teacher UI

`apps/mode-b-api` (Fastify) and `apps/mode-b-web` (React + Vite):

**Built and tested** (backend: 13 integration tests via Fastify's `.inject()`, no real network port; frontend: typecheck + `vite build` clean, full flow re-driven via curl against a live server hitting the exact routes/payloads the React code uses — **not** visually verified in a real browser, no browser-automation tool was available in this environment):
- Direct-upload ingestion — `POST /courses/:courseId/manifests` (multipart) calls `@campvus/engine`'s `ingestBuffer` directly, teacher-role-gated per course.
- Auth — register/login/logout, DB-backed sessions (revocable, not stateless JWTs), `@node-rs/argon2` password hashing, mandatory email verification before a fresh sign-up returns a session (`auth/auth.ts`'s `requireEmailVerification`).
- **School provisioning is admin-gated, not open (per [ADR-0005](./adr/0005-schools-as-organizations-fixed-roles.md)):** a School is a better-auth Organization, created only via `POST /admin/schools` (env-allowlisted platform admin, `auth/platform-admin.ts` + `auth/guards.ts`'s `requirePlatformAdmin`) or the equivalent CLI script — never self-service. School membership itself is invite-only (any Teacher can invite; one School per person, enforced at invite-accept). Teacher is School-wide (sees/manages every Course in their School); only Students hold a per-course Enrollment row — this replaces the old per-course role model. Raw account creation (`/api/auth/sign-up/email`) stays open by design: a bare account with no School invite has no course access, so this isn't the same gap as "anyone can act as a teacher/student."
- Origin storage — `GET /content/:hash` serves bytes from `@campvus/engine`'s content-store, gated by course enrollment (not just "any valid session"). Hash format validated (`/^[0-9a-f]{64}$/`) before any filesystem lookup — closes off path traversal through this user-controlled route parameter, found and fixed while smoke-testing this pass, not left as a hypothetical.
- Auto-provisioned institution keypair on first boot (no manual `generate` step, unlike Mode A's CLI) — logs the public key.
- Teacher UI (`apps/mode-b-web`) — login/register, create/list courses, upload files, view a course's manifest list, enroll students by email, plus an admin console for platform admins to provision Schools and view rosters. Served same-origin by `apps/mode-b-api` in production (`@fastify/static`, guarded so a fresh checkout without a frontend build still boots), proxied same-origin by Vite in dev.

**Not built:** KMS-backed key custody (same local-file caveat as Mode A). **Platform-admin is itself an env-var email allowlist**, not a real, auditable role system — worth treating as its own follow-up, distinct from School provisioning (which is closed).

**Student client (gap #7, docs/TODO.md) — mostly built via `apps/mode-a-desktop`, real P2P swarming through Mode B not yet validated end to end.** See §3.2 for what's built (sign-in, course sync now with periodic refresh, same swarm engine as Mode A) and what isn't (two Mode-B-authenticated clients have never been run against each other to confirm actual peer discovery/download, as opposed to the already-tested origin-fallback path).

**`drizzle-kit` migrations are now real** (closes gap #8, docs/TODO.md): `db/client.ts` runs `drizzle-orm`'s `migrate()` against `apps/mode-b-api/drizzle/`'s generated SQL on boot, replacing the old hand-written idempotent DDL. `pnpm db:generate` regenerates a migration after a `schema.ts` change.

**Found while integration-testing, now solved (Phase 2):** Mode A's `peer-node.ts --origin` flag was pointed at a live `apps/mode-b-api` server to test whether it could serve as a real origin fallback. It couldn't, for two concrete reasons — see Open Question #9, now resolved: bearer-token auth (`auth/auth.ts`'s `bearer()` plugin, a new unauthenticated `GET /public-key` route) plus header support in `httpOriginFetcher`/`httpManifestListFetcher`, wired end-to-end through `apps/mode-a-desktop`'s new "Sign in to Campvus" flow.

### 13.3 Live lesson streaming (Mode B, per ADR-0007)

Protocol and access-control layers built and unit-tested; no real audio/video capture, encoding,
or UI yet — see `.scratch/live-lesson-streaming/spec.md` for the full design and what's
explicitly deferred.

- **`packages/engine`'s `live-segment-protocol.ts`/`live-segment-origin.ts`** — session-start and
  segment gossip (signed with the same institution keypair as manifests), flood-gossip fan-out,
  and sequence-gap-triggered origin fallback. Pure logic, fully unit-tested (mirrors
  `swarm-protocol.ts`'s existing test pattern).
- **`swarm-node.ts`** — wired the above into real Hyperswarm connections: tracks every connected
  peer (didn't exist before this — only a peer *count* was tracked), relays session-start/segment
  messages to all other connected peers, catches up newly-joined peers on an in-progress session,
  and exposes `startLiveSession()`/`publishSegment()`/`finishLiveSession()` for a teacher's
  client to call. `finishLiveSession()` concatenates every segment this node published for a
  session and runs it through the exact same `ingestBuffer` hash-sign-publish pipeline any other
  course file uses — tested directly (no network needed for these three methods).
- **`apps/mode-b-api`** — `liveSessions` table + `POST`/`GET /courses/:courseId/sessions`
  (schedule / list), gated by the same `requireCourseRole` checks as course files. Tested against
  a real Postgres instance (`test/sessions.test.ts`), passing.
- **Not built:** actual audio/video capture and encoding (no ffmpeg or equivalent dependency yet),
  the teacher/student UI in `apps/mode-a-desktop`/`apps/mode-b-web`, and a real HTTP endpoint
  serving individual segments for origin fallback (`SegmentOriginFetcher` is defined and wired in
  the engine, but nothing in `apps/mode-b-api` implements it yet — the fallback path is
  architecturally complete but has nothing to call).

---

*This consolidates the campus-focused pivot from the earlier general-purpose hybrid search-cache design, now split into two product modes sharing one engine (§3). The trust, signing, and seeding sections above are the parts most load-bearing for a first working version — the LAN discovery spike (open question 4) remains the single highest-priority validation step before deeper build-out on either mode.*
