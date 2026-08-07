# 02 — Wire Tier 2 region into the desktop app

**What to build:** Extend the config file/settings screen from ticket 01 with an optional
`region` field, and pass it through to `createSwarmNode({ ..., region })` in `main.ts`'s
`startEngine`. Today the engine already supports Tier 2 (`SwarmNodeOptions.region`,
`swarm-node.ts:67`, joined via `topicForCourseAndRegion` when set) and the CLI already exposes it
(`peer-node.ts --region=<tag>`), but `apps/mode-a-desktop` has no way to set it at all — this
ticket closes that gap so the desktop app can actually reach Tier 2 peers (e.g. same residence,
different exact Wi-Fi network), not just Tier 1 (LAN) and Tier 3 (wide DHT).

**Blocked by:** 01 (needs the config file/settings screen to exist before adding a field to it)

**Status:** ready-for-agent

- [ ] `region` (optional, freeform string) is a field in the config file and settings screen
      introduced in ticket 01
- [ ] `startEngine` passes `region` through to `createSwarmNode`
- [ ] Whether a region topic was actually joined is surfaced in the status view (detail text or
      tooltip) — not left silently invisible the way it is today, since that invisibility is part
      of why Tier 2 went unwired from the desktop app in the first place
- [ ] Leaving the region field empty behaves exactly as today (no Tier 2 topic joined, Tier 1/3
      unaffected) — confirm no regression to existing LAN/DHT behavior
- [ ] Tests cover that `region` is threaded from saved config through to the `createSwarmNode`
      call (a unit test at the config/wiring boundary, not a real Hyperswarm integration test —
      that's ticket 04's job, on real networks)
