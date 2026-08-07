# @campvus/mode-a-headless — Mode A spike

This validates the two riskiest assumptions from the architecture doc before
building anything further:

1. Content can be hashed, signed by an institution key, and verified by
   anyone holding the public key, with tampering reliably rejected.
2. Two devices can discover each other via Hyperswarm and exchange verified
   content — **confirmed on two physical laptops on the same Wi-Fi network,
   connecting within a few seconds.** See "LAN peer discovery" below. Cross-network
   conditions (different Wi-Fi, mobile hotspot, campus NAT/firewalls) and the
   local-cluster/wide-DHT tiers are still untested.

This app is CLI-only (no UI of our own — that's the point of Mode A) and calls into
the shared engine at [`@campvus/engine`](../../packages/engine). It's a TypeScript
project run directly via [tsx](https://github.com/privatenumber/tsx) — no compile-to-`dist`
build step yet (future work once real deployment is designed).

All commands below assume your shell's working directory is `apps/mode-a-headless`
(this app's runtime state — `registry.json`, `institution-keys.json`, `content-store/` —
lives alongside its own code, not at the workspace root).

## Setup

From the repo root, once: `pnpm install`. Then, from this directory:

```
npx tsx src/identity.ts generate
```

This writes `institution-keys.json` (public + secret key — in production
the secret half lives in KMS, never on disk like this) and prints the
public key. Anyone verifying content needs that public key.

## Simulate a lecturer upload

```
npx tsx src/watcher.ts COMSCI214 /path/to/some-file.pdf
```

This hashes the file, signs a manifest with the institution key, appends
it to `registry.json`, and copies the file into `content-store/<hash>`.
Run it again with the same file and you'll see the dedup check kick in.

## What's already proven (works today, tested)

- Manifest signing and verification (`@campvus/engine`'s `crypto-utils.ts`)
- Tamper detection — flip one character in a manifest and verification
  fails
- Content-hash addressing and dedup on re-ingest
- **Cross-device LAN peer discovery and file transfer** — confirmed on two
  real laptops on the same Wi-Fi network: connected within a few seconds,
  manifest gossiped, file requested, downloaded, and hash-verified.
- **Origin fallback** — if no peer delivers a file within a timeout, it's
  fetched from a configured HTTP origin and verified the same way as
  peer-delivered content. Smoke-tested with zero peers available.
- **Storage eviction** — LRU-by-last-access cap, smoke-tested.
- **Peer-request dedup** — only one peer is asked for a given file at a
  time (with a retry window), instead of requesting it from every
  connected peer in parallel.

## LAN peer discovery

Confirmed working on two laptops on the same Wi-Fi network (see above). To
repeat it yourself:

**Laptop A** (has the file already — acts as first seed):
```
pnpm install
npx tsx src/identity.ts generate
npx tsx src/watcher.ts COMSCI214 /path/to/some-file.pdf
npx tsx src/peer-node.ts COMSCI214 --content-dir=./content-store
```

**Laptop B** (empty content dir — acts as a student device):

Copy `institution-keys.json`'s public key from Laptop A first (in
production this would be pre-provisioned in the app, not copy-pasted).

```
pnpm install
npx tsx src/peer-node.ts COMSCI214 --content-dir=./incoming --pubkey=<paste public key hex here>
```

`<courseId>` is actually `<courseIds>` — a student is normally enrolled in
several courses at once, so `peer-node` takes a comma-separated list (e.g.
`npx tsx src/peer-node.ts COMSCI214,MATH101 --content-dir=./incoming
--pubkey=...`) and joins one swarm topic per course, tracking all their
manifests in the same run.

Extra flags on `peer-node`, all optional:

- `--origin=<baseUrl>` — fall back to `GET <baseUrl>/<hash>` if no peer
  delivers the file within `--origin-timeout-ms` (default 15000).
- `--manifest-origin=<baseUrl>` — the manifest-sync bridge (§9): fetches
  `GET <baseUrl>/courses/<courseId>/manifests` once per enrolled course on
  start, runs each course's list through the same signature-verified diff
  as peer gossip, and schedules origin-fallback fetches (via `--origin`, if
  also set) for anything it learns about that isn't local yet. This is what
  lets a node with zero reachable peers catch up on manifests published
  while offline — origin fallback alone only ever fetched bytes by hash,
  never the list of what exists. Separate base URL from `--origin` since a
  real origin (e.g. `apps/mode-b-api`) serves these from different routes.
- `--manifest-sync-interval-ms=<n>` — repeat the manifest-origin check on
  this interval instead of only once at start.
- `--max-store-bytes=<n>` — cap local storage; evicts the least-recently-accessed
  content first once exceeded.
- `--seed=off` — stop responding to other peers' requests (default: seed
  freely — real Wi-Fi-vs-mobile-data detection isn't implementable in
  plain Node.js on a laptop, so this is a manual override, not real
  network-type detection).

If discovery works, Laptop B should print something like:

```
[peer xxxxxxxx] connected
[peer xxxxxxxx] learned 1 new verified manifest(s)
[peer xxxxxxxx] requesting "some-file.pdf" (abcd1234...)
[peer xxxxxxxx] downloaded and verified "some-file.pdf" — now seeding it too
```

**If it hangs instead** (no "connected" line within ~30 seconds) on a
different network setup than "same Wi-Fi" — e.g. two separate Wi-Fi
networks, one on mobile hotspot, or behind a campus firewall/NAT — that's
a real finding: it means Hyperswarm's default DHT bootstrap isn't reaching
both devices reliably in that condition, and Tier 1/2 discovery in the
architecture needs a different mechanism (raw UDP broadcast, mDNS, a
Hyperswarm relay/rendezvous server you control) for that case.

Same-Wi-Fi discovery is now proven. What's still open is whether it holds
across the messier real-world conditions above, and whether Tier 2 (local
cluster, not same LAN) and Tier 3 (wide DHT) behave the same way.

## What's intentionally not built yet

- LMS webhook/polling integration (watcher is a manual CLI for now)
- KMS-backed signing (secret key sits in a local file — fine for a spike,
  not for anything real)
- Real Wi-Fi-vs-mobile-data detection for seeding (the policy hook exists
  and is enforced; the actual network-type decision is a manual
  `--seed=on|off` flag, not real detection — see `@campvus/engine`'s
  `seeding-policy.ts`)
- A real credential for `--origin`/`--manifest-origin` against a live
  `apps/mode-b-api` server — both flags make plain unauthenticated
  requests today, but Mode B's matching routes are session-cookie-gated,
  so pointing them at a live Mode B instance doesn't work yet
  (docs/ARCHITECTURE.md Open Question #9(a)).

Real tiered discovery (LAN via mDNS → local cluster via a region-scoped
topic → wide DHT) and the manifest-sync bridge (`--manifest-origin`,
above) are both built now — see docs/ARCHITECTURE.md §8/§13.1 and §9 for
the up-to-date status; this README only tracks what's specific to the
CLI shim here.
