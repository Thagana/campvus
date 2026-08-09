# Teacher live lesson streams relay over Hyperswarm, not WebRTC/SFU

`docs/ARCHITECTURE.md` §12 Open Question #7 assumed live A/V would need a separate engine
(likely WebRTC/SFU) from the P2P file-distribution engine. Researching peer-assisted live relay
(`.scratch/live-lesson-streaming/`, ticket 02) found every browser-based system surveyed
(PeerTube/p2p-media-loader, Streamroot, Theta, BitTorrent Live) either disables P2P at low
latency or only pays off at 1,000+ viewer scale, and recommended a conventional SFU for
classroom scale (30-150 students, ticket 01).

## Decision

Reject that recommendation, for a documented reason. Live lesson streams relay chunked segments
over the existing Hyperswarm swarm — the same transport, topic, and enrollment-derived trust
model `packages/engine` already uses for file distribution — with an HTTP origin fallback as the
correctness floor, mirroring §5.5/§5.6's existing peer-first/origin-fallback pattern. No WebRTC,
no SFU, no third-party media-server vendor.

Why:

1. **The product's core value proposition is avoiding student data cost** (§1's problem
   statement) — peer relay serves that directly; a conventional SFU (every viewer streaming from
   a managed media server) does not, regardless of which vendor hosts it.
2. **The browser-WebRTC constraint the surveyed systems had doesn't apply here.** PeerTube,
   Streamroot, and p2p-media-loader are forced into WebRTC because a browser tab cannot open a
   raw socket to another browser tab — WebRTC is the only P2P primitive available to them.
   Campvus's actual client is a Node/Electron desktop app already doing raw TCP/Noise P2P over
   Hyperswarm for files, so that forcing constraint is absent.
3. **The session model is one-way broadcast** — teacher streams, students watch, text chat only
   (confirmed while resolving ticket 03) — which tolerates the multi-second "assisted" latency
   class the research found workable for broadcast. SFU's whole reason to exist over a relay
   overlay is sub-second interactive latency, which this use case doesn't need.

## Considered Options

- **Conventional SFU** (mediasoup/LiveKit self-hosted, or hosted LiveKit Cloud/Daily/Twilio) —
  the research's own recommendation: mature, well-supported, sub-second latency, ~$60/mo at this
  scale self-hosted. Rejected anyway because it requires WebRTC media delivery to a managed
  server, working directly against the P2P/data-savings mission that is this whole product's
  reason to exist, and that a real alternative was available given this client isn't
  browser-sandboxed.
- **Full-mesh WebRTC** (every viewer connects to every other viewer) — rejected outright, tops
  out around 4-6 participants, ruled out by ticket 01's 30-150 scale before latency even enters
  the picture.

## Consequences

- New engineering discipline `packages/engine` doesn't have yet: segment chunking, live
  session announcement (distinct from static hash-addressed manifests), relay-tree rebuild when
  a relaying peer disconnects mid-class, jitter/backpressure handling. None of this is
  off-the-shelf per the research — see `.scratch/live-lesson-streaming/research/peer-assisted-relay-feasibility.md`.
- Real risk carried forward, not resolved by this decision: per `docs/ARCHITECTURE.md` §13.2,
  Mode B's real cross-client P2P swarm participation is itself still unvalidated end-to-end —
  building live relay on top of an unproven substrate compounds that risk rather than reusing a
  proven one.
- Resolves Open Question #7's "different engine (likely WebRTC/SFU)" framing: that engine is not
  being built. Live streaming instead extends the existing swarm engine. §3.2's similar framing
  needs the same update.
- If session sizes ever grow past classroom scale (hundreds-to-thousands), the SFU tradeoff
  should be revisited — this decision is scoped to the 30-150 range from ticket 01, not a
  permanent ruling.
