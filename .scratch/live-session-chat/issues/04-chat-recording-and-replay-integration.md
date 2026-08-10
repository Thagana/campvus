Type: grilling
Status: open
Blocked by: 01

# Chat Recording & Replay Integration

## Question

The map's charting session confirmed chat is recorded and replayed alongside the session
recording, not live-only. The parent spec's recording model: the Teacher's client (already the
segment source) records the video locally and auto-publishes through the existing
hash-sign-publish pipeline the instant the session ends (`.scratch/live-lesson-streaming/spec.md`
§Solution). Once [Chat Message Shape & Delivery Semantics](01-chat-message-shape-and-delivery.md)
has settled what a chat message actually contains:

- **Storage**: does the Teacher's client accumulate chat messages into a sidecar file (e.g. a
  timestamped transcript) published alongside the video manifest, or does chat become part of
  the same signed manifest as the video?
- **Sync**: how does a message's timestamp map to playback position in the recording, given
  flood-gossip delivery has no guaranteed ordering (per ticket 01)?
- **Moderation interaction**: if a message was deleted/redacted during the live session (per
  [Moderation Model](03-moderation-model.md)), does the replay show the tombstone, hide the
  message entirely, or does this ticket need to wait on that one resolving first? (Currently
  blocked only on 01 — revisit if 03's answer changes that.)

## Answer

(unresolved)
