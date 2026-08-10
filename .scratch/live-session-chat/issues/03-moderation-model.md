Type: grilling
Status: open
Blocked by: 01, 02

# Moderation Model

## Question

The map's charting session confirmed moderation is in scope for v1 (the Teacher needs mute and/or
delete power over chat), but left the mechanics open. Once [Chat Message Shape & Delivery
Semantics](01-chat-message-shape-and-delivery.md) has settled on a message shape/id and [Gossip-Based
Moderation Precedent](02-gossip-moderation-precedent.md) has surveyed what "delete" can realistically
mean in a flood-gossip system with no central broker:

- **Delete**: is it a tombstone/redaction message that downstream clients honor (hide, don't
  erase), matching what the research ticket finds real gossip/federated systems do? Who can issue
  one — only the Teacher, or also the original sender retracting their own message?
- **Mute**: does muting a Student stop their client from *sending* (enforced how, with no central
  broker to reject a message?), or just tell every other client to *drop* messages from that
  sender going forward? These have very different trust implications.
- **Scope**: per-session (mute resets next session) or does it need to persist across sessions
  for a given Course?
- **Who can moderate**: Teacher's existing School-wide access, same as everything else in the
  parent spec, or does this need a narrower check?

## Answer

(unresolved)
