Type: grilling
Status: open

# Chat Message Shape & Delivery Semantics

## Question

The map's charting session confirmed chat rides the same Hyperswarm swarm topic as video
segments/manifests (flood-gossip, per ADR-0007), not a separate server-mediated mechanism — but
left the specifics open:

- **Message shape**: what does a chat message carry (sender identity, timestamp, text, a
  message id for dedup)? Does it need a signature like manifests do, or is that overkill for
  ephemeral live chat?
- **Ordering**: flood-gossip has no guaranteed delivery order across peers — does the UI need to
  reorder by a logical/session-relative timestamp, or is "whatever order it arrives in" fine at
  classroom scale?
- **Dedup**: same flood-gossip fan-out that makes video segments resilient to relay dropout also
  means a peer may receive the same chat message from multiple upstream peers — what's the
  dedup key?
- **Late-join backlog**: if a Student joins mid-session, do they see chat history from session
  start, or only messages from their join point onward? (Distinct from post-hoc replay via
  recording — this is about the *live* in-session view.)

This is the foundation ticket other chat tickets build on — [Moderation
Model](03-moderation-model.md) needs a message id to delete/reference, and [Chat Recording &
Replay Integration](04-chat-recording-and-replay-integration.md) needs to know what's being
persisted.

## Answer

(unresolved)
