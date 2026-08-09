Type: research
Status: resolved

# Peer-Assisted Relay Feasibility

## Question

Investigate prior art and feasibility for peer-assisted live video relay/distribution — as
opposed to conventional client-server WebRTC/SFU — for a teacher live lesson stream:

- Approaches such as P2P-assisted HLS/DASH live streaming (e.g. PeerTube's `p2p-media-loader`),
  WebTorrent-style live extensions, or libp2p/gossip-based segment relay.
- How each handles live latency vs. VOD (peer-assisted approaches are typically built for VOD or
  high-latency live, not sub-second interactive latency).
- What overlay/topology they use to relay media between peers, and what happens to viewers when
  the source (teacher) or early relaying peers drop.
- Whether any approach is realistic to build and operate for classroom scale (roughly tens to
  low hundreds of concurrent viewers per session — see
  [Typical Live Session Scale](01-live-session-scale.md)) without significant new infra
  investment, given this project's current spike-stage tooling (`packages/engine`, plain Node,
  `tsx`, no build step yet).
- Summarize tradeoffs — latency, robustness, dev complexity, infra/operating cost — against a
  conventional SFU (e.g. mediasoup, LiveKit).

This directly feeds
[Media Transport & Control-Plane Boundary Decision](03-media-transport-boundary-decision.md).

## Context pointer

Findings: `.scratch/live-lesson-streaming/research/peer-assisted-relay-feasibility.md`

## Answer

Full findings and citations: [research/peer-assisted-relay-feasibility.md](../research/peer-assisted-relay-feasibility.md).

Gist: no peer-assisted live-relay system surveyed (PeerTube/p2p-media-loader, Streamroot/Peer5, Theta
Network, academic hybrid P2P-CDN research, BitTorrent Live's history, Owncast's unbuilt P2P request)
achieves sub-second interactive latency or pays off at classroom scale (tens–low hundreds of viewers) —
PeerTube itself disables P2P in low-latency mode, and p2p-media-loader's own docs put useful scale at
1,000+ viewers. Building it would be new real-time-media infrastructure, not a reuse of
`packages/engine`'s file-distribution strengths. Recommendation for ticket 03: a conventional SFU
(mediasoup/LiveKit OSS self-hosted, or LiveKit Cloud/Daily/Twilio hosted) is the credible v1 choice on
latency, robustness, dev complexity, and cost; peer-assisted media relay isn't ruled out forever, just not
justified at this scale today. Doesn't preclude control-plane-only reuse of Hyperswarm/topics (ticket 03
option (a)), which is a separate question this research doesn't speak against.
