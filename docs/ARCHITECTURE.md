# Campus P2P Content Distribution Platform — Architecture (Draft v0.6)

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
- **`apps/mode-a-desktop`** (Electron) is the actual near-term **Mode A companion app** (shape A2 from §10, per [ADR-0001](./adr/0001-mode-a-companion-app-not-lms-plugin.md), which resolves Open Question #8) — it wraps `packages/engine` directly, since Hyperswarm/Hypercore already run natively on desktop Node with no native-mobile complications (see [ADR-0002](./adr/0002-electron-desktop-client-mobile-parked.md)).

### 3.2 Mode B — Full App (we deploy infra, own both ends)

For institutions with no LMS integration, or where deeper product ownership is the pitch.

- **Ingestion collapses**: there's no external system to watch — a teacher's upload through our own UI *is* the ingestion event, calling straight into the same hash → sign → publish pipeline Mode A's watcher calls after it detects a file.
- **We own identity/enrollment** — course rosters, auth, access control. This is genuinely new work Mode A gets for free from the LMS.
- **We own origin fallback** — our own storage becomes the "always works" fallback tier instead of the LMS's.
- **We build UI** for two audiences: teachers (upload, manage course files) and students (browse, download, see sync/seed status).
- **Live classes** is a plausible future feature once this exists, but it is a *different engine* — real-time audio/video (likely WebRTC/SFU), not P2P static-file caching. It should not be designed into the content-distribution engine; track it as a separate future phase (§12).
- **Backend built:** `apps/mode-b-api` (Fastify) implements the direct-upload API, auth/enrollment, and origin storage — see §13. No UI yet.

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

- **Seeding default is per-product-surface, not global.** See [ADR-0004](./adr/0004-desktop-seeds-freely-by-default.md): `apps/mode-a-desktop` **seeds freely by default** (opt-out for tethered/hotspot connections) since laptops normally sit on unmetered home/campus Wi-Fi or ethernet. The parked mobile client (ADR-0002) keeps the original **Wi-Fi/LAN-only-by-default** rule — never seed over mobile data unless the student explicitly opts in — since that's where metered cellular plans actually make seeding costly to the seeder. Either default is only meaningful once network-type detection is real; today it's a manual override stub (§13).
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
| Content storage & transfer | Hyperdrive / Hypercore |
| Peer discovery | Hyperswarm + HyperDHT, tiered (LAN → local cluster → wide) |
| Cryptography | Ed25519 signing, BLAKE2b content hashing, Noise transport (via Hyperswarm) |
| Key custody | AWS KMS (or on-prem HSM per institutional requirement) |
| Mode A ingestion | LMS-native webhooks where available; REST API polling fallback |
| Mode B ingestion | Direct upload API — Fastify, `apps/mode-b-api`, calls `@campvus/engine`'s `ingestBuffer` directly |
| Mode B infra | Own auth/enrollment: SQLite via `node:sqlite` (not `better-sqlite3` — native compile fails without VS build tools) through Drizzle's `sqlite-proxy` driver, DB-backed sessions, `@node-rs/argon2` password hashing. Own origin storage: local filesystem via `@campvus/engine`'s content-store, served over HTTP (`GET /content/:hash`), gated by course enrollment. Teacher + student **UI still TBD, not yet designed** — backend only so far. |
| Mobile packaging | **Parked** — Bare mobile tooling / Pear vs. bare-RN + `nodejs-mobile` both viable in theory, neither chosen; see [ADR-0002](./adr/0002-electron-desktop-client-mobile-parked.md) |
| Desktop packaging | Electron (`apps/mode-a-desktop`), wraps `packages/engine` directly — no native-mobile bindings needed, Node runs Hyperswarm/Hypercore natively |
| Repo structure | pnpm workspace (`packages/engine`, `apps/mode-a-headless` CLI spike, `apps/mode-a-desktop` Electron client, `apps/mode-b-api` backend); `apps/campvus` (Expo/React Native) is the parked mobile scaffold, unwired |

---

## 12. Open Questions

1. **Key rotation/revocation** — how does a compromised or rotated institution key get invalidated across every device without breaking trust in already-distributed, validly-signed content?
2. **Multi-institution model** — does each institution hold its own keypair (clean isolation, but a student at two institutions needs two trust roots), or is there a shared registrar model? Simple isolation is probably right for v1.
3. **LMS ToS/API rate limits** — needs confirming per LMS vendor before committing to a polling cadence or webhook dependency (Mode A only).
4. **Pilot scope** — single course, single residence, before wider rollout. ~~Validate the LAN discovery assumption in real conditions~~ **Resolved for same-Wi-Fi Tier 1: confirmed on two physical laptops on the same Wi-Fi network, connecting within a few seconds and completing a verified transfer.** Still open: cross-network conditions (different Wi-Fi, mobile hotspot, campus NAT/firewall) and whether Tier 2 (local cluster) / Tier 3 (wide DHT) behave the same way.
5. **Business model detail** — per-institution licensing vs. infrastructure-cost-savings pitch for Mode A; different pricing logic likely needed for Mode B since we're hosting real infra. Needs a concrete pilot conversation with one university's IT/library department to validate before generalizing.
6. **Mode B auth/enrollment ownership** — building our own accounts and course rosters from scratch is new surface area Mode A never needed. Needs its own design pass before Mode B work starts; should not block Mode A.
7. **Live classes (future, Mode B only)** — real-time A/V is a different engine (likely WebRTC/SFU) from P2P static-file caching. Explicitly out of scope until Mode B's file distribution is proven; do not let it influence the shared engine's design now.
8. ~~**Mode A student-side footprint** — does the invisible background agent (§5.5) ship as its own minimal companion app (A2), or embed inside the LMS's own mobile app as a plugin/SDK (A1)?~~ **Resolved: A2**, see [ADR-0001](./adr/0001-mode-a-companion-app-not-lms-plugin.md) and §10. Still open beneath this: the OS-level trigger/scheduling mechanism for the background agent now that it's a standalone app (Android `WorkManager`/foreground service vs. iOS `BGTaskScheduler` constraints) — not yet designed.
9. **Mode A/Mode B origin interop** — found while integration-testing (§13.2), not a design assumption: pointing Mode A's `peer-node.ts --origin` flag at a live `apps/mode-b-api` server doesn't actually work today, for two independent reasons. (a) `httpOriginFetcher` makes a plain unauthenticated request; Mode B's `/content/:hash` requires a session cookie — a machine-to-machine origin fetch needs its own credential story (a service token, most likely), not a student's session. (b) There's no manifest-sync bridge between the two products' registries at all — `peer-node` only acts on manifests it already knows about (its own `registry.json`, or gossiped from a peer), so it has no way to learn a Mode B course's manifests exist to know there's anything to fetch. Neither is solved; both are real design work, not yet scoped, for whenever Mode A/Mode B interop is actually needed (today they're independent, not required to talk to each other).

---

## 13. Current Implementation Status

### 13.1 Mode A spike

What exists today in `packages/engine` (`@campvus/engine`) + `apps/mode-a-headless` (TypeScript, pnpm workspace, run via `tsx`, no build step yet), versus what's still outstanding:

**Built and tested:**
- §5.2 signing/verification (crypto only) — Ed25519 sign/verify with tamper detection. **KMS/HSM custody is not built**; the secret key still lives in a local JSON file, explicitly flagged as spike-only.
- §5.3 manifest & object model — content-hash addressing and dedup, working and tested.
- §5.4 swarm topics — topic derivation (`sha256(courseId)`) works, but it's a single flat Hyperswarm join; no tiering.
- §6 trust model — fully implemented and tested: signature check + hash check on receipt, reject and no partial acceptance on either mismatch.
- §5.5 student-agent protocol logic — gossip manifests, diff against local, request missing, verify-on-receipt, become-a-seed; all pure and tested. CLI-only — no real app lifecycle (foreground/background, periodic check-in).
- **Cross-device LAN discovery (§8 Tier 1)** — confirmed on two physical laptops on the same Wi-Fi network: connected within a few seconds, full manifest-gossip → request → download → verify cycle completed. This resolves what the README called the single most important open question. See Open Question #4.
- **§5.6 origin fallback** — `engine/origin.ts`: when content isn't obtained from any peer within a configurable timeout (`--origin-timeout-ms`, default 15s), fetches it from a configured HTTP origin (`--origin=<baseUrl>`) and verifies it against the signed manifest hash exactly like peer-delivered content. Smoke-tested with no peer available at all — the file arrived from origin alone. `httpOriginFetcher` is a generic stand-in; a real Mode A adapter would point this at the LMS's actual file endpoint.
- **§7 seeding rules (partial)** — storage eviction is real: `engine/eviction.ts` enforces an LRU-by-last-access cap (`--max-store-bytes`), evicting oldest-accessed content first, smoke-tested. Seed-only-after-completion was already true and remains so. **Wi-Fi-only gating is a deliberate stub** (`engine/seeding-policy.ts`): plain Node.js on a laptop has no portable API to detect Wi-Fi vs. metered mobile data, so the policy interface is real and pluggable (`--seed=on|off`) but the actual network-type decision is a manual override, not real detection — that requires whatever mobile packaging (Bare/Pear) eventually runs on-device.
- **§8 discovery (peer preference, not real tiering)** — confirmed Hyperswarm/HyperDHT have no API to scope discovery to "LAN only" (read directly from both libraries' docs); real Tier 1/2/3 separation would need a separate mechanism (UDP broadcast/mDNS) alongside Hyperswarm, deliberately out of scope for this pass. What's built instead: requests are deduped per-hash across connected peers (only one peer is asked at a time, with a retry window if it doesn't deliver) rather than requesting the same file from everyone in parallel — a cheap improvement, not real tiering.

**Not built yet:**
- §9 offline/sync semantics — no "catch up on everything published while away" behavior distinct from live gossip.
- §10 real LMS integration — watcher is still a manual CLI trigger; no webhook/polling code exists.
- Real Tier 1/2/3 discovery separation (see above) — would need a supplementary local-network discovery mechanism, not just Hyperswarm.
- Real Wi-Fi/mobile-data detection (see above) — needs OS-level APIs, deferred to real mobile packaging.
- Mode B (§3.2) and live classes (§12.7) — untouched, deliberately deferred.

**Open Question #4 is now resolved for Tier 1 (same Wi-Fi):** confirmed on two physical laptops on the same Wi-Fi network — Hyperswarm's DHT bootstrap connected within a few seconds, manifest gossiped, file requested, downloaded, and hash-verified. This was the single highest-priority validation step and it de-risks Mode A's core LAN-first assumption.

What's still open on discovery specifically: cross-network conditions (different Wi-Fi networks, mobile hotspot, campus NAT/firewall) haven't been tested, and neither has Tier 2 (local cluster, not same LAN) or Tier 3 (wide DHT) — both still just theoretical per §8, with only the single flat topic join actually implemented.

### 13.2 Mode B backend

`apps/mode-b-api` (Fastify) — backend only, no UI:

**Built and tested** (12 integration tests via Fastify's `.inject()`, no real network port):
- Direct-upload ingestion — `POST /courses/:courseId/manifests` (multipart) calls `@campvus/engine`'s `ingestBuffer` directly, teacher-role-gated per course.
- Auth — register/login/logout, DB-backed sessions (revocable, not stateless JWTs), `@node-rs/argon2` password hashing.
- Enrollment — per-course role (teacher/student), enforced on every course-scoped route.
- Origin storage — `GET /content/:hash` serves bytes from `@campvus/engine`'s content-store, gated by course enrollment (not just "any valid session"). Hash format validated (`/^[0-9a-f]{64}$/`) before any filesystem lookup — closes off path traversal through this user-controlled route parameter, found and fixed while smoke-testing this pass, not left as a hypothetical.
- Auto-provisioned institution keypair on first boot (no manual `generate` step, unlike Mode A's CLI) — logs the public key.

**Not built:** teacher/student UI, KMS-backed key custody (same local-file caveat as Mode A), `drizzle-kit` migrations (DDL applied idempotently on boot instead), institution-controlled account provisioning (registration is currently open).

**Found while integration-testing, not yet solved:** Mode A's `peer-node.ts --origin` flag was pointed at a live `apps/mode-b-api` server to test whether it could serve as a real origin fallback. It can't yet, for two concrete reasons — see Open Question #9.

---

*This consolidates the campus-focused pivot from the earlier general-purpose hybrid search-cache design, now split into two product modes sharing one engine (§3). The trust, signing, and seeding sections above are the parts most load-bearing for a first working version — the LAN discovery spike (open question 4) remains the single highest-priority validation step before deeper build-out on either mode.*
