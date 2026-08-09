Type: research findings
Status: complete
Feeds: [Media Transport & Control-Plane Boundary Decision](../issues/03-media-transport-boundary-decision.md)
Answers: [Peer-Assisted Relay Feasibility](../issues/02-peer-assisted-relay-feasibility.md)

# Peer-Assisted Relay Feasibility — Research Findings

## Bottom line (read this first)

**Conventional SFU is the sane default for v1.** Every production or research system found below either
(a) explicitly disables P2P relay at low latency, (b) needs an audience one to two orders of magnitude
larger than classroom scale before peer-assist pays for itself, or (c) required years of dedicated,
well-funded protocol engineering that still didn't survive as a product. None of that changes what
`packages/engine` already does well (P2P *file* distribution, tolerant of seconds-to-minutes latency) —
it just means that mission doesn't transfer to sub-second interactive video without rebuilding a
different kind of system from close to zero. Full reasoning in [Bottom-Line Recommendation](#bottom-line-recommendation).
This is a recommendation to inform ticket 03, not an architecture decision — that's ticket 03's call.

---

## 1. Prior art survey

### 1.1 PeerTube + p2p-media-loader / WebTorrent (most directly comparable, in production)

- **What it does:** PeerTube ingests a teacher-equivalent broadcaster's RTMP stream, transcodes to HLS
  with FFmpeg, and serves segments over HTTP. [p2p-media-loader](https://github.com/Novage/p2p-media-loader)
  (Novage) is the browser-side library PeerTube integrates as a custom `hls.js`/`dash.js` loader: it always
  fetches the *first* copy of a segment over HTTP(S), then announces itself on WebTorrent-compatible
  trackers (public infra by default, no extra server needed) so later viewers can pull the same segment
  from a peer's browser over WebRTC instead of the origin. [PeerTube's architecture docs](https://docs.joinpeertube.org/contribute/architecture)
  confirm this HTTP-assisted design and describe live ingestion as RTMP → FFmpeg → HLS, distributed via
  both WebTorrent and p2p-media-loader.
- **Live vs. VOD latency:** PeerTube [explicitly disables P2P in its low-latency live mode](https://github.com/Chocobozzz/PeerTube/issues/5412)
  ("P2P is disabled in low-latency mode anyways") — the maintainers' own open issue is a proposal to
  eventually reconcile LL-HLS with a P2P loader, unresolved as of this research. This is the single most
  load-bearing data point in this survey: the project with the longest production track record of
  peer-assisted *live* streaming turns P2P **off** at exactly the moment latency matters most, and has
  not yet shipped a fix.
- **What happens on peer/source drop:** p2p-media-loader's own FAQ says a viewer whose peers disappear
  "downloads all the segments from HTTP(S)" — i.e. it silently degrades to exactly the no-P2P case.
  Graceful, but it means the HTTP origin must always be provisioned to serve *everyone* on its own; P2P
  is strictly a cost optimization on top of a working origin, never a capacity substitute for one.
- **Scale guidance from the library itself:** the README states "for smaller setups (1,000–2,000
  simultaneous viewers), public trackers alone can handle peer connections" — i.e. the authors' own frame
  of reference for "small" starts an order of magnitude above classroom scale (tens to low hundreds, per
  [ticket 01](../issues/01-live-session-scale.md)). Below that, most segment fetches never find a peer
  that already has the segment, so viewers mostly redo the same HTTP fetch — plus per-viewer WebRTC/ICE
  signaling overhead — for close to zero offload benefit.

### 1.2 Streamroot / Peer5 (commercial hybrid P2P-CDN, production at real scale)

- Both are browser-based hybrid P2P-CDN vendors; Streamroot was used by TF1/Eurosport for live sports
  including World Cup broadcasts, reportedly offloading 60–80% of CDN traffic during peaks; Peer5 claims
  up to 98% offload in some deployments (per vendor and trade-press claims found — no independent
  benchmark was located).
- **Key qualifier: this only works, and is only needed, at CDN scale.** These are traffic-cost
  optimizations layered on top of a full CDN that remains the delivery backbone and the always-correct
  fallback — not a replacement for one. The audiences involved (national broadcast, World Cup) are
  many orders of magnitude above a single classroom.
- Segment relay is still bounded by ordinary HLS segment durations (a few seconds) — "assisted," not
  "sub-second interactive," the same latency posture as PeerTube's non-low-latency mode.

### 1.3 Theta Network (blockchain-incentivized decentralized edge/relay)

- Theta's Edge Nodes cache and relay HLS video segments to nearby viewers, with node operators paid in
  the TFUEL token for contributed bandwidth/storage — a real production network (used for things like
  esports and VR streams).
- **Relevant contrast, not a template:** Theta's core engineering problem isn't the relay mechanics
  (broadly similar to PeerTube's tracker/swarm idea) — it's the *incentive* problem of getting strangers
  to run relay infrastructure for free, solved via a token economy. Campvus doesn't have that problem
  (its trust/participation model is enrollment, not payment, per `docs/ARCHITECTURE.md` §6), but adopting
  anything Theta-shaped would mean building an entire separate incentive/settlement/edge-node-management
  layer that has nothing to do with the classroom use case.

### 1.4 Academic hybrid P2P-CDN research (RICHTER and related)

- [RICHTER](https://dl.acm.org/doi/10.1145/3510450.3517290) (Farahani et al., 2022) and a 2024 NFV/edge
  follow-up ([arXiv:2403.16985](https://arxiv.org/abs/2403.16985)) propose multi-layer P2P-CDN-edge
  architectures with "virtual tracker servers" near end users and an action-tree scheduler choosing
  between peer, edge, and CDN sources per request, validated on research testbeds.
- These confirm low-latency hybrid P2P-CDN live streaming is an **active, unsolved research area** —
  not a mature, packaged solution a small team could drop in. Nothing here ships as adoptable
  open-source infrastructure; it's testbed code accompanying papers.

### 1.5 libp2p gossipsub (a transport primitive, not a live-video system)

- gossipsub is a generic pub/sub messaging protocol; [Circuit Relay v2](https://libp2p.io/) provides NAT
  traversal relaying for peers that can't connect directly. No off-the-shelf "libp2p live-video relay"
  project was found in this research — anyone using it for live media would be building segment
  chunking, backpressure, and mesh-degree tuning from scratch on top of a general messaging layer.
- Not obviously better positioned for campvus than building directly on the Hyperswarm/HyperDHT stack the
  project already uses (`docs/ARCHITECTURE.md` §11) — it's a different P2P toolkit, not a shortcut.

### 1.6 BitTorrent Live (historical — the most direct "pure P2P live video" precedent)

- Bram Cohen (BitTorrent's creator) spent roughly nine years developing a dedicated P2P live-streaming
  protocol (patented swarm topology), launched a beta in the early 2010s, then a multi-channel
  BitTorrent Live app (including an Apple TV app in 2016) — and [the service was shut down in 2017](https://variety.com/2017/digital/news/bittorrent-live-shutting-down-1202402117/)
  after failing to spin out into a standalone viable business.
- **Reading this correctly:** this isn't "nobody tried" — it's a company with about as much dedicated P2P
  protocol expertise as exists anywhere, spending the better part of a decade on exactly this problem,
  that still couldn't make it durable. Strong evidence the difficulty is real, not just under-invested.

### 1.7 Owncast (small-scale self-hosted live streaming — closest audience-size analog to campvus)

- Owncast is a self-hosted live-streaming server aimed at individual streamers/small communities —
  much closer to classroom scale than PeerTube, Streamroot, or Theta. A P2P HLS feature request
  ([owncast/owncast#112](https://github.com/owncast/owncast/issues/112), opened 2020, citing Streamroot
  and p2p-media-loader by name) has sat open and unimplemented for years.
- Circumstantial, but telling: the self-hosted, small-audience live-streaming project structurally
  closest to campvus's classroom use case never judged peer-assisted relay worth building.

### 1.8 Baseline for comparison: naive full-mesh WebRTC

- Not a "peer-relay" system at all, but the naive P2P approach worth naming to rule it out explicitly:
  full mesh WebRTC (every viewer connects directly to every other viewer) tops out around **4–6
  participants** before per-node upload bandwidth and CPU cost (N−1 upstream/downstream duplicated
  streams per participant) make it unusable. This is why no serious system — including every one of the
  hybrid P2P-CDN systems above — relays live video by mesh; they all route through some form of
  tree/swarm overlay with an origin/CDN floor underneath, or through an SFU.

---

## 2. Feasibility at classroom scale, given campvus's current spike-stage tooling

Classroom scale per [ticket 01](../issues/01-live-session-scale.md) is tens to low hundreds of
concurrent viewers per session, from a single teacher source, for the duration of a class period.

- **Every scale data point found sits above this range.** p2p-media-loader's own docs put "smaller
  setups" at 1,000–2,000 viewers; Streamroot/Peer5/Theta operate at broadcast/esports scale; PeerTube
  disables P2P exactly where latency matters, independent of audience size. Nothing in this survey
  suggests peer-assisted relay pays for itself at low-hundreds-of-viewers scale — the swarm is too small
  for meaningful segment reuse before every viewer has probably already pulled the segment via HTTP
  anyway, so the WebRTC/ICE signaling overhead is close to pure cost.
- **This would be new engineering discipline, not an extension of `packages/engine`.** The existing
  engine's P2P mission — manifest gossip, diff-and-fetch, verify-on-receipt, seed-after-complete — is
  built around content that's static and latency-tolerant (seconds to minutes is fine for a file). Live
  media relay needs segment/frame-level chunking, jitter buffers, backpressure, and — critically — a
  relay-tree rebuild the instant a relaying peer disconnects, so that class doesn't freeze for everyone
  downstream of that peer. None of that exists today, and per `docs/ARCHITECTURE.md` §13, even the
  *file*-distribution side of Mode B (cross-network P2P discovery, real swarm participation between two
  Mode-B clients) is still unvalidated end-to-end — building live-media relay reliability on top of an
  already-unproven P2P substrate compounds risk rather than reusing a proven one.
- **The "who relays" population is worse-suited than file-seeding's.** File-seeding tolerates a peer
  going offline mid-transfer (the requester just asks someone else, per §5.5/§9's peer-first,
  origin-fallback resolution) — mildly slower for others, never broken. A relaying peer in a live session
  is a *student's laptop, mid-class*, potentially lid-closed, tab-backgrounded, or on a phone hotspot
  (the same population §7's network-type/metered-connection logic exists to protect) — exactly the peers
  least likely to be a stable relay hop, and a relay dropout doesn't just slow a background sync, it
  visibly freezes the live class for everyone routed through it.
- **Tooling gap compounds this.** The project is currently a TypeScript/Node spike run via `tsx`, no
  build step, no production observability/incident-response tooling yet (per §13's own "not built yet"
  list) — a materially higher bar for the operational reliability a live relay overlay would need
  (detecting a bad relay path in real time, rerouting live viewers, alerting when a class is unwatchable)
  than for the current async file-sync workload, where a stalled peer just means "try again in a bit."

**Conclusion for this section:** building and *operating* a peer-assisted live relay at classroom scale
would be new infrastructure investment, not a reuse of what exists — the opposite of what the ticket
asked to confirm ("without significant new infra investment").

---

## 3. Tradeoff summary: peer-assisted relay vs. conventional SFU

| Dimension | Peer-assisted relay | Conventional SFU (mediasoup / LiveKit OSS self-hosted, or LiveKit Cloud / Daily / Twilio hosted) |
|---|---|---|
| **Latency** | No production system surveyed achieves sub-second interactive latency via P2P relay; PeerTube turns P2P off precisely in its low-latency mode. Best case is "assisted," multi-second-class live latency — workable for one-way lecture broadcast, marginal for live Q&A/interactivity. | Purpose-built for sub-second latency; this is the SFU's whole reason to exist over mesh or relay overlays. |
| **Robustness (relaying peer disconnects mid-class)** | A relaying peer's dropout stalls/freezes every downstream viewer behind it until the overlay detects the failure and reroutes — churn recovery is called out as an open research problem in the RICHTER/hybrid-CDN literature, not a solved library feature. Classroom "relays" (student laptops/hotspots) churn more than dedicated CDN edge nodes. | A student's disconnect only affects that student; the only structurally important link is the teacher's single upload to the SFU, which is exactly the link self-hosted/hosted SFU infra is engineered and monitored to keep up. |
| **Dev complexity** | No adoptable off-the-shelf library targets this scale/stack (`packages/engine` doesn't help here — file-manifest gossip is a different problem class from real-time segment relay with jitter/backpressure/path rerouting). Comparable systems (PeerTube's p2p-media-loader integration, Theta's Edge Node network) each represent years of dedicated engineering by funded teams. | Mature client SDKs and documentation (mediasoup, LiveKit); a small team can integrate in days-to-weeks rather than designing a new distributed system. |
| **Infra / operating cost** | Nominally "free" (no dedicated media server), but every surveyed system still keeps an HTTP/CDN/origin fallback as the correctness floor — P2P never replaces needing a working non-P2P path, so the "no server" framing is misleading; the real cost shows up as engineering time building and debugging a relay overlay on top of a path you needed anyway. | Self-hosted LiveKit OSS reported at roughly $60/month for ~200 concurrent users — comfortably inside classroom scale/budget. Hosted (LiveKit Cloud ≈$0.004–0.024 per track-minute) is trivially cheap at classroom session frequency; Twilio/Daily cost more per participant-minute but remain predictable, bounded, and require no new distributed-systems R&D. |

---

## 4. Bottom-line recommendation

**Conventional SFU is the credible choice for v1; peer-assisted relay is not, at classroom scale, today.**

Reasoning, not just a verdict:

1. **The latency evidence is unambiguous.** The one production system with the longest track record in
   exactly this space (PeerTube + p2p-media-loader) turns P2P *off* when low latency matters, and its
   maintainers still haven't shipped a fix years later. If the project most invested in making this work
   hasn't solved it, treating it as solved for campvus would be optimistic beyond what the evidence
   supports.
2. **The scale evidence points the wrong direction.** Every system surveyed either needs an audience one
   to two orders of magnitude above classroom scale to pay for itself (p2p-media-loader's own 1,000–2,000
   viewer guidance; Streamroot/Peer5/Theta's broadcast/esports deployments) or is a research prototype
   with no adoptable implementation (RICHTER and related work). Classroom scale (tens to low hundreds) is
   squarely below where any of this prior art claims to add value.
3. **This would be new infrastructure, contradicting the ticket's own scoping question.** `packages/engine`'s
   proven strength — manifest gossip, diff-and-fetch, seed-after-complete — solves a different problem
   (static content, latency-tolerant by design) than real-time media relay (chunked, jitter-sensitive,
   needs live path rerouting on churn). Building it would mean a new real-time-media engineering
   discipline layered on top of a P2P substrate whose cross-network reliability is *itself* still
   unvalidated for the easier file-distribution case (`docs/ARCHITECTURE.md` §13.2). That's the opposite
   of "without significant new infra investment."
4. **The most directly comparable precedent (BitTorrent Live) is a cautionary tale, not a blueprint.** A
   team with unusually deep P2P protocol expertise spent close to a decade on live P2P streaming
   specifically and the product still didn't survive commercially. That's a strong prior against assuming
   a small team can do this cheaply as a side effect of an existing file-distribution engine.
5. **The SFU path has no comparable gap.** Latency, robustness, dev complexity, and cost all favor a
   conventional SFU at this scale, whether self-hosted (mediasoup/LiveKit OSS) or a hosted vendor
   (LiveKit Cloud/Daily/Twilio) — see §3's table. This mirrors what `docs/ARCHITECTURE.md` §12 Open
   Question #7 already assumed before this map started ("live A/V is a different engine … likely
   WebRTC/SFU").

**What this doesn't foreclose:** control-plane reuse of Hyperswarm/topics for session
announcement/discovery/access-control (ticket 03's option (a)) is untouched by any of the above — that
question is about the swarm as a signaling/trust layer, not as a media relay, and this research doesn't
argue against it. It also doesn't foreclose revisiting peer-assisted media relay later if session sizes
ever grow into the hundreds-to-thousands range where the cited systems actually operate — just that
classroom scale, as scoped by ticket 01, isn't that regime.

This is a recommendation and a set of findings for **[ticket 03](../issues/03-media-transport-boundary-decision.md)**
to weigh during its grilling session — it does not itself decide the transport boundary.

---

## Sources

- [Novage/p2p-media-loader — GitHub repo & README](https://github.com/Novage/p2p-media-loader)
- [Novage/p2p-media-loader — FAQ.md](https://github.com/Novage/p2p-media-loader/blob/main/FAQ.md)
- [PeerTube — Architecture docs](https://docs.joinpeertube.org/contribute/architecture)
- [PeerTube — "Lower low-latency mode" issue #5412](https://github.com/Chocobozzz/PeerTube/issues/5412)
- [Owncast — "P2P HLS" issue #112](https://github.com/owncast/owncast/issues/112)
- [Variety — "BitTorrent Is Shutting Down Its Live TV Streaming Service"](https://variety.com/2017/digital/news/bittorrent-live-shutting-down-1202402117/)
- [Theta Labs — "Introducing Theta EdgeCast"](https://medium.com/theta-network/introducing-theta-edgecast-the-worlds-first-decentralized-streaming-dapp-for-end-to-end-live-e08c875a7f86)
- [Theta Labs — "Theta Edge Node released"](https://medium.com/theta-network/theta-edge-node-released-7a63557f9612)
- [RICHTER: hybrid P2P-CDN architecture for low latency live video streaming (ACM, Farahani et al. 2022)](https://dl.acm.org/doi/10.1145/3510450.3517290)
- [Towards Low-Latency and Energy-Efficient Hybrid P2P-CDN Live Video Streaming (arXiv:2403.16985)](https://arxiv.org/abs/2403.16985)
- [libp2p — WebRTC / Circuit Relay v2 docs](https://libp2p.io/docs/webrtc-browser-connectivity/)
- [WebRTC mesh/SFU/MCU topology comparison — Red5](https://www.red5.net/blog/webrtc-architecture-p2p-sfu-mcu-xdn/)
- [LiveKit vs Agora vs Twilio cost comparison — CelloIP](https://celloip.com/blog/livekit-vs-agora-vs-twilio-cost/)
- [Daily.co vs building your own — cost/flip-point analysis — Forasoft](https://www.forasoft.com/blog/article/daily-co-alternative)
- Vendor claims on P2P CDN offload (Streamroot/TF1, Peer5) per [Tesseract Academy — "Top Real-World Examples of P2P Streaming in Action"](https://tesseract.academy/top-real-world-examples-of-p2p-streaming-in-action-a-practical-guide/) and [LightReading — "CenturyLink Taps Streamroot for P2P Assist"](https://www.lightreading.com/services/centurylink-taps-streamroot-for-p2p-assist) — vendor-reported figures, no independent benchmark found; treated as directional evidence of scale, not precise numbers.
