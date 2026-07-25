# Campus P2P MVP — spike

This validates the two riskiest assumptions from the architecture doc before
building anything further:

1. Content can be hashed, signed by an institution key, and verified by
   anyone holding the public key, with tampering reliably rejected.
2. Two devices can discover each other via Hyperswarm and exchange verified
   content — **this part is NOT yet confirmed and needs to be tested on
   your own machine(s), not in a sandboxed environment.** See "The one
   thing to actually test" below.

This is a TypeScript project run directly via [tsx](https://github.com/privatenumber/tsx) —
there's no compile-to-`dist` build step yet (that's future work once real
deployment is designed). `npx tsc --noEmit` (or `npm run typecheck`)
type-checks without running anything.

## Setup

```
npm install
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

- Manifest signing and verification (`src/engine/crypto-utils.ts`)
- Tamper detection — flip one character in a manifest and verification
  fails
- Content-hash addressing and dedup on re-ingest

## The one thing to actually test: LAN peer discovery

Run this on two different laptops on the same Wi-Fi network:

**Laptop A** (has the file already — acts as first seed):
```
npm install
npx tsx src/identity.ts generate
npx tsx src/watcher.ts COMSCI214 /path/to/some-file.pdf
npx tsx src/peer-node.ts COMSCI214 --content-dir=./content-store
```

**Laptop B** (empty content dir — acts as a student device):

Copy `institution-keys.json`'s public key from Laptop A first (in
production this would be pre-provisioned in the app, not copy-pasted).

```
npm install
npx tsx src/peer-node.ts COMSCI214 --content-dir=./incoming --pubkey=<paste public key hex here>
```

If discovery works, Laptop B should print something like:

```
[peer xxxxxxxx] connected
[peer xxxxxxxx] learned 1 new verified manifest(s)
[peer xxxxxxxx] requesting "some-file.pdf" (abcd1234...)
[peer xxxxxxxx] downloaded and verified "some-file.pdf" — now seeding it too
```

**If it hangs instead** (no "connected" line within ~30 seconds), that's
the critical finding — it means Hyperswarm's default DHT bootstrap isn't
reaching both devices reliably in your network conditions (campus Wi-Fi,
mobile hotspot, NAT/firewall setup, etc.), and Tier 1 discovery in the
architecture needs a different mechanism (raw UDP broadcast, mDNS, a
Hyperswarm relay/rendezvous server you control) before going further.

This test result — works or hangs — is the single most important piece
of information for deciding what to build next. Run it before writing any
more code on top of this.

## What's intentionally not built yet

- LMS webhook/polling integration (watcher is a manual CLI for now)
- KMS-backed signing (secret key sits in a local file — fine for a spike,
  not for anything real)
- Storage eviction / seeding policy (Wi-Fi-only seeding, LRU eviction)
- Tiered discovery (LAN → local cluster → wide DHT) — currently just
  joins one topic and relies on whatever Hyperswarm's default discovery
  does
