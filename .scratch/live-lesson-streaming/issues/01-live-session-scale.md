Type: grilling
Status: resolved

# Typical Live Session Scale

## Question

What's the typical and maximum number of students expected to join a single teacher's live
lesson session at once? Does this vary meaningfully by course size (e.g. a small seminar vs. a
large lecture course), or should the spec assume one worst-case number (e.g. the largest course
this product expects to serve)?

This figure is a direct input to
[Media Transport & Control-Plane Boundary Decision](03-media-transport-boundary-decision.md):
mesh WebRTC realistically tops out around 4-6 peers, a conventional SFU comfortably handles
hundreds, and peer-assisted relay approaches (see
[Peer-Assisted Relay Feasibility](02-peer-assisted-relay-feasibility.md)) have their own scaling
curves depending on overlay topology. Getting this number roughly right before that decision
avoids designing for the wrong regime.

## Answer

Assume lecture-sized sessions: roughly 30-150 students per live session, matching a typical
university lecture course rather than a small seminar or a large gen-ed lecture hall. This is a
working assumption, not pilot-validated data — no real pilot school's course-size distribution
exists yet.

Implication for [Media Transport & Control-Plane Boundary Decision](03-media-transport-boundary-decision.md):
this range sits comfortably inside a conventional SFU's normal operating range (mediasoup/LiveKit
handle this without exotic scaling work) and stays well past WebRTC mesh's realistic ceiling
(~4-6 peers). Combined with
[Peer-Assisted Relay Feasibility](02-peer-assisted-relay-feasibility.md)'s finding that
peer-assisted relay only pays off past ~1,000 viewers, scale alone doesn't create any pressure
toward peer-assisted relay for v1 — it reinforces the SFU conclusion rather than complicating it.
