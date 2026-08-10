Type: research
Status: resolved

# Gossip-Based Moderation Precedent

## Question

The map's charting session confirmed the Teacher needs some in-session moderation power (mute a
Student, and/or delete a message) — but flood-gossip delivery (confirmed transport, see [Chat
Message Shape & Delivery Semantics](01-chat-message-shape-and-delivery.md)) has no central broker
to enforce a delete or a mute against once a message has fanned out to peers.

Survey how other gossip-based / eventually-consistent / federated chat systems handle moderation
without a central authority — e.g. Secure Scuttlebutt (append-only logs, no true delete),
Matrix's federation model (redaction events, not real deletion), CRDT-based collaborative text
systems, and any academic or production precedent for "soft delete" / "client-side hide" in a
system where a message has already propagated. What's the realistic ceiling on what "delete" can
mean here, and what do real systems do instead (e.g. a tombstone/redaction message that
downstream clients honor, vs. actually erasing data everywhere)?

Feed findings into [Moderation Model](03-moderation-model.md), which is blocked on this ticket.

## Answer

Surveyed against primary sources (SSB protocol guide + first-party plugins, the Matrix spec +
Matrix.org's own moderation writeup + Synapse's own docs, Yjs/Automerge's own internals docs,
Bluesky's own engineering blog, XMPP MUC's spec). Convergent finding across every gossip/federated
system that lacks a per-room server in the delivery path (SSB, Matrix's *content* redaction,
CRDTs): **delete can only ever be a tombstone/redaction gossip message that well-behaved clients
choose to honor, never a guaranteed erasure** — Matrix's own team calls this "the single biggest
remaining risk to the long-term success of Matrix," and even Synapse (Matrix's own reference
homeserver) keeps unredacted content for 7 days by design. Likewise **mute can only ever be
receiver-side filtering** (every other client drops future messages from a pubkey once it sees a
mute gossip message) — the muted sender's own client keeps broadcasting. The only precedent for
true sender-side enforcement (XMPP MUC ban, Matrix room ban) requires a server-equivalent
component sitting in the delivery path with authority to refuse relay — exactly what Hyperswarm
flood-gossip doesn't have, and introducing one would be a bigger architectural move than a
moderation feature normally implies.

Full findings: [research/gossip-moderation-precedent.md](../research/gossip-moderation-precedent.md).
Also committed on throwaway branch `research/gossip-moderation-precedent` (commit `91c8f77`) if
the citation trail/worktree is wanted later — not merged, safe to delete once this ticket's
answer is trusted.

Feeds [Moderation Model](03-moderation-model.md), which is now unblocked on this half of its two
blockers (still waiting on [Chat Message Shape & Delivery Semantics](01-chat-message-shape-and-delivery.md)).
