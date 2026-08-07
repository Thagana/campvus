# 04 — Cross-network discovery field validation

**What to build:** Not a code change. A written test plan (and a place to record results) for
confirming Tier 2 and Tier 3 discovery actually work under real cross-network conditions, closing
the remaining half of Open Question #4. Tier 1 (same-Wi-Fi LAN) is already confirmed per
`docs/ARCHITECTURE.md` §13.1. This uses the existing `peer-node.ts` CLI directly (it already
supports `--region`), so it does not need tickets 01/02 built first.

**Blocked by:** None.

**Status:** ready-for-human — requires physical machines on genuinely separate networks; not
something an AFK coding agent can execute.

- [ ] Test plan covers, at minimum:
      - Tier 2: two machines on **different** LANs, same `--region` tag, confirm they find each
        other via the region-scoped topic
      - Tier 3: two machines on genuinely separate networks (different home/campus Wi-Fi) with no
        shared region, confirm wide-DHT discovery still connects them
      - A mobile-hotspot peer reaching a peer on a fixed network
      - Campus NAT/firewall conditions, if a campus network is available to test against — note
        if this specific condition can't be tested yet and needs the actual pilot institution's
        network
- [ ] Each scenario records: time-to-connect, whether the full gossip → request → download →
      verify cycle completed, and any errors encountered
- [ ] Results are appended to `docs/ARCHITECTURE.md` Open Question #4, in the same style the
      confirmed same-Wi-Fi Tier 1 result was already recorded there
- [ ] If any scenario fails, the failure is captured as a new gap/ticket rather than silently
      left unresolved
