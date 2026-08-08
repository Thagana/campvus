┌─────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬────────────────────────────────────┐
│  #  │                                                                                       Gap                                                                                       │               Source               │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 1   │ Real LMS integration (webhook/polling) — biggest remaining Mode A gap                                                                                                           │ ARCHITECTURE §13.1                 │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 2   │ Mode A↔B interop: unauthenticated origin fetch vs. session-gated /content/:hash                                                                                                 │ Open Q9                            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 3   │ PARTIAL — manifest-sync bridge mechanism now built (engine + CLI + desktop Settings); still blocked end-to-end on gap 2 (auth) against a live Mode B server                       │ Open Q9                            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 4   │ KMS/HSM key custody (both modes use a local key file)                                                                                                                           │ ARCHITECTURE §13.1/§13.2           │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 5   │ Key rotation/revocation mechanism undefined                                                                                                                                     │ Open Q1                            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 6   │ Multi-institution trust-root model undecided                                                                                                                                    │ Open Q2                            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 7   │ PARTIAL — desktop app's Mode B sign-in already covers login/course-sync/swarm, now with periodic enrollment refresh. Unvalidated: real P2P swarm between two Mode B clients.    │ ARCHITECTURE §3.2/§13.2            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 8   │ RESOLVED — db/client.ts now runs real drizzle-kit-generated migrations (drizzle/) via migrate(), replacing the old idempotent DDL.                                              │ ARCHITECTURE §13.2                 │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 9   │ RESOLVED — School provisioning is admin-gated + invite-only per ADR-0005 (env-allowlisted admin creates Schools; membership invite-only). Registration stays open by design.    │ ARCHITECTURE §13.2, ADR-0005       │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 10  │ RESOLVED — macOS (swift/NWPathMonitor, unverified on real hardware) and Linux (nmcli GENERAL.METERED) detection added to network-type.ts; both fail-safe to null like Windows │ ARCHITECTURE §13.1                 │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 11  │ RESOLVED — Tier 2 region is wired into apps/mode-a-desktop (main.ts reads CAMPVUS_REGION); doc drift only, fixed in ARCHITECTURE.md §13.1                                       │ code (main.ts vs swarm-node.ts:67) │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 12  │ RESOLVED — desktop app now has a Settings panel (config-store.ts + IPC), persists to desktop-config.json, restarts the engine on save; opens straight to Settings when unconfigured │ code (main.ts:29-44)               │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 13  │ Cross-network discovery unvalidated — different Wi-Fi, hotspot, campus NAT/firewall untested for Tier 2/3                                           │ Open Q4 (partially resolved)       │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 14  │ LMS ToS / API rate limits unconfirmed per vendor                                                                                                    │ Open Q3                            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 15  │ Android/iOS background-agent scheduling undesigned (moot while mobile is parked)                                                                    │ Open Q8 sub-question               │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 16  │ Business model / pricing needs a real pilot conversation                                                                                            │ Open Q5                            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 17  │ Live classes (WebRTC/SFU) — deliberately out of scope, don't let it leak into engine design                                                         │ Open Q7                            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 18  │ RESOLVED — ARCHITECTURE.md §11/§13.1 reconciled with code (plain filesystem store, real Tier 1/2/3, SHA-256, no more Hyperdrive/BLAKE2b mentions)                              │ code vs. doc                       │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 19  │ RESOLVED — investigated: apps/mode-b-api/.env is untracked/gitignored and the Brevo key string never appears anywhere in git history (git log -S confirmed); nothing to scrub. Key rotation still recommended out-of-band since its origin/scope is unclear. │ git status                         │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 20  │ RESOLVED — engine/CLI/desktop were single-course-only (courseId: string); a student is enrolled in several at once. Now courseIds: string[] throughout, one topic/LAN-discovery/region-join per course, one shared manifest map/content-store. Found via user question. │ code (swarm-node.ts)               │
└─────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴────────────────────────────────────┘

Roadmap

Phase 0 — Housekeeping (do before anything else)
- DONE: stray .env secret investigated — never tracked/pushed to git; user rotating the key out-of-band regardless
- DONE: ARCHITECTURE.md §11/§13.1 reconciled with ADR-0006/code (gap 18)

Phase 1 — Make Mode A pilot-real
- Build the real LMS watcher: webhook where supported, polling fallback (gap 1, needs Open Q3 confirmed first)
- DONE: give the desktop app a real config surface instead of raw env vars (gap 12)
- DONE: wire region (Tier 2) into apps/mode-a-desktop (gap 11)
- Validate Tier 2/3 across real network boundaries — hotspot, separate Wi-Fi, campus NAT (gap 13) — needs physical multi-network hardware/access, out of reach in this environment

Phase 2 — Mode A ↔ Mode B interop
- Design a service-token credential for machine-to-machine origin fetch (gap 2)
- PARTIALLY DONE: manifest-sync bridge mechanism now wired on the Mode A side (engine + CLI + desktop Settings), but still blocked end-to-end against a live Mode B server until gap 2 (auth) lands (gap 3)

Phase 3 — Complete Mode B
- Build the student client on an Electron/Node shell (gap 7) — extending apps/mode-a-desktop in place (its existing "Sign in to Campvus" flow already covers most of this)
- DONE: drizzle-kit migrations (gap 8)
- DONE: institution-controlled provisioning (gap 9) — closed by ADR-0005; platform-admin-as-env-allowlist tracked as a smaller follow-up, not blocking

Phase 4 — Production hardening (both modes)
- Move key custody to KMS/HSM (gap 4)
- Design key rotation/revocation (gap 5)
- Decide the multi-institution trust-root model (gap 6)
- DONE: add macOS/Linux network-metering detection (gap 10) — macOS path is unverified on real hardware, flag this if a pilot Mac reports wrong seeding behavior

Phase 5 — Business validation (parallel, non-blocking)
- Run the single-course/single-residence pilot conversation with a real institution (Open Q4 remainder + gap 16)
- Confirm per-LMS-vendor ToS/rate limits (gap 14)

Deferred / explicitly out of scope for now
- Mobile companion app (ADR-0002 — parked, needs nodejs-mobile or Bare/Pear)
- Live classes / WebRTC SFU (Open Q7 — different engine entirely)
- Partial-piece (BitTorrent-style) seeding (§7 — start simple, revisit later)
- Android/iOS background scheduling (gap 15 — moot until mobile is unparked)
