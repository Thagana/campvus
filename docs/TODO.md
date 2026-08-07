┌─────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬────────────────────────────────────┐
│  #  │                                                                                       Gap                                                                                       │               Source               │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 1   │ Real LMS integration (webhook/polling) — biggest remaining Mode A gap                                                                                                           │ ARCHITECTURE §13.1                 │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 2   │ Mode A↔B interop: unauthenticated origin fetch vs. session-gated /content/:hash                                                                                                 │ Open Q9                            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 3   │ Mode A↔B interop: no manifest-sync bridge — Mode A never learns a Mode B course's manifests exist                                                                               │ Open Q9                            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 4   │ KMS/HSM key custody (both modes use a local key file)                                                                                                                           │ ARCHITECTURE §13.1/§13.2           │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 5   │ Key rotation/revocation mechanism undefined                                                                                                                                     │ Open Q1                            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 6   │ Multi-institution trust-root model undecided                                                                                                                                    │ Open Q2                            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 7   │ Mode B student UI not built (needs Electron shell)                                                                                                                              │ ARCHITECTURE §3.2/§13.2            │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 8   │ drizzle-kit migrations missing                                                                                                                                                  │ ARCHITECTURE §13.2                 │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 9   │ Institution-controlled account provisioning (registration currently open)                                                                                                       │ ARCHITECTURE §13.2                 │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 10  │ macOS/Linux metered-network detection (isConnectionMetered always null)                                                                                                         │ ARCHITECTURE §13.1                 │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 11  │ Tier 2 region not wired into apps/mode-a-desktop — only the CLI exposes it                                                                                                      │ code (main.ts vs swarm-node.ts:67) │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 12  │ Desktop app has no config UI — env vars only, silently stuck if institution key unset                                                               │ code (main.ts:29-44)               │
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
│ 18  │ Docs drift: ARCHITECTURE.md §11/§13.1 still says Hyperdrive/BLAKE2b and "no real tiering," but code uses plain fileslready implements real Tier 1/2 │ code vs. doc                       │
├─────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────────────────────────────┤
│ 19  │ Housekeeping: apps/mode-b-api/.env has uncommitted, apparently unrelated ("Reimbus") Brevo keys sitting in a tracked                                │ git status                         │
└─────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴────────────────────────────────────┘

Roadmap

Phase 0 — Housekeeping (do before anything else)
- Resolve the stray .env secrets before any commit touches that file
- Reconcile ARCHITECTURE.md §11 and §13.1 with what ADR-0006/code actually do (gap 18)

Phase 1 — Make Mode A pilot-real
- Build the real LMS watcher: webhook where supported, polling fallback (gap 1, needs Open Q3 confirmed first)
- Give the desktop app a real config surface instead of raw env vars (gap 12)
- Wire region (Tier 2) into apps/mode-a-desktop (gap 11)
- Validate Tier 2/3 across real network boundaries — hotspot, separate Wi-Fi, campus NAT (gap 13)

Phase 2 — Mode A ↔ Mode B interop
- Design a service-token credential for machine-to-machine origin fetch (gap 2)
- Build the manifest-sync bridge so Mode A can learn about Mode B-hosted courses (gap 3)

Phase 3 — Complete Mode B
- Build the student client on an Electron/Node shell (gap 7) — likely reuses apps/mode-a-desktop's scaffold
- Add drizzle-kit migrations (gap 8)
- Close open registration with institution-controlled provisioning (gap 9)

Phase 4 — Production hardening (both modes)
- Move key custody to KMS/HSM (gap 4)
- Design key rotation/revocation (gap 5)
- Decide the multi-institution trust-root model (gap 6)
- Add macOS/Linux network-metering detection, or explicitly accept Windows-only for the pilot (gap 10)

Phase 5 — Business validation (parallel, non-blocking)
- Run the single-course/single-residence pilot conversation with a real institution (Open Q4 remainder + gap 16)
- Confirm per-LMS-vendor ToS/rate limits (gap 14)

Deferred / explicitly out of scope for now
- Mobile companion app (ADR-0002 — parked, needs nodejs-mobile or Bare/Pear)
- Live classes / WebRTC SFU (Open Q7 — different engine entirely)
- Partial-piece (BitTorrent-style) seeding (§7 — start simple, revisit later)
- Android/iOS background scheduling (gap 15 — moot until mobile is unparked)
