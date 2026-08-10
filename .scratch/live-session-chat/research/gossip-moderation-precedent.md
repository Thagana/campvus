Type: research
Status: resolved

# Gossip-Based Moderation Precedent

Research for [Gossip-Based Moderation Precedent](../issues/02-gossip-moderation-precedent.md),
feeding [Moderation Model](../issues/03-moderation-model.md). Question: once a chat message has
flood-gossiped across Campvus's Hyperswarm swarm with no central broker, what can a Teacher's
"delete" or "mute" realistically *mean*, architecturally? Surveyed against primary sources: the
SSB protocol guide and first-party plugin source, the Matrix spec and Matrix.org's own moderation
writeup, Yjs/Automerge's own docs on deletion, Bluesky/AT Protocol's own engineering blog, and
XMPP MUC's spec — plus IRC as an old-school negative control (a system that fakes "true" removal
by having a server that gates room membership).

## 1. Secure Scuttlebutt: append-only logs, no true delete, ever

SSB's own protocol guide is unambiguous: feeds are "an append-only log, meaning that once a
message is posted it cannot be modified" — messages are hash-referenced and signed, so nothing
downstream can be retroactively altered once gossiped.
([Scuttlebutt Protocol Guide](https://ssbc.github.io/scuttlebutt-protocol-guide/))

The SSB community handbook says this plainly for end users, not just implementers: "when
something is posted it is not possible to delete or edit that content as it has already been
propagated to your peers" — SSB is "a decentralised append only database," and there is **no
true delete** at any layer.
([Scuttlebutt Handbook — Privacy FAQ](https://handbook.scuttlebutt.nz/faq/misc/privacy))

What SSB clients actually do instead is entirely local and receiver-side:

- **`ssb-friends`** (the official social-graph plugin) implements `block()`, which "publish[es] a
  contact message asserting your current blocking state for `feedId`" — this is just a normal
  signed message the blocker writes to *their own* log, recorded as a `-1` edge weight in the
  social graph. It does nothing to the blocked party's ability to publish.
  ([ssbc/ssb-friends](https://github.com/ssbc/ssb-friends))
- Blocking only changes what the *blocker* chooses to replicate going forward (blocks beat
  friend-of-friend follows when a client's replication logic walks the social graph), and
  **`ssb-lists`** confirms the mechanism explicitly: "anyone blocked on a list you have subscribed
  to will not be replicated" — again, a local replication decision, not a network-wide removal.
  ([ssbc/ssb-lists](https://github.com/ssbc/ssb-lists))
- **`ssb-friends-purge`** goes one step further and deletes *already-downloaded* messages from
  blocked/negative-hop feeds out of the local database (via `ssb-db2`'s per-feed delete +
  compaction) — but this is explicitly local-only: "each peer independently manages deletions of
  blocked feeds in its own database," with no propagation to other peers.
  ([ssbc/ssb-friends-purge](https://github.com/ssbc/ssb-friends-purge))
- A community-documented "flag" convention exists as a strong social signal ("if trusted users
  have flagged the target, then it is a bad actor") layered on top of the same block/follow
  primitives, not a protocol-level takedown.

**Bottom line**: SSB has zero delete primitive at any layer. Its only moderation primitive is a
signed "block" message that is 100% advisory to everyone except the publisher's own client, which
uses it to decide what to stop *replicating to itself* and, optionally, purge from its own local
store. The blocked identity keeps publishing and keeps being replicated by every peer that hasn't
blocked them.

## 2. Matrix: redaction is real at the protocol level, but explicitly "best-effort" everywhere else

Matrix does have a real, spec-defined content-stripping mechanism — this is the strongest "delete
primitive" of anything surveyed. Room version 11's authorization/redaction algorithm is explicit
about what a redaction event actually does: on receipt, "the server must strip off any keys not
in" a fixed allow-list (`event_id, type, room_id, sender, state_key, content, hashes, signatures,
depth, prev_events, auth_events, origin_server_ts`), and "the content object must also be
stripped of all keys" except for a handful of event-type-specific exceptions (e.g.
`m.room.member`, `m.room.create`, `m.room.power_levels` keep specific fields).
([Matrix Spec — Room Version 11](https://spec.matrix.org/latest/rooms/v11/))

Two important caveats straight from Matrix.org's own docs and issue tracker, though:

- **Redaction is explicitly a best-effort convention, not a guarantee, once federation is in
  play.** Matrix.org's own moderation writeup: "Redactions are a best-effort system — there is no
  way to force other servers or clients to actually uphold them, and indeed if a room is bridged
  to a system which doesn't support them (e.g. IRC) then the messages will inevitably remain
  visible." It also names this as "the single biggest remaining risk to the long-term success of
  Matrix."
  ([Matrix.org — Moderation in Matrix](https://matrix.org/docs/older/moderation/))
- **Even the reference homeserver doesn't erase on redact.** Synapse (Matrix.org's own homeserver
  implementation) keeps the unredacted content in its database after a redaction — by design.
  Synapse's own config docs describe `redaction_retention_period`: "How long to keep redacted
  events in unredacted form in the database. After this period redacted events get replaced with
  their redacted form in the DB" — default **7 days**, and even that runs on a 5-minute polling
  loop, not immediately.
  ([Synapse Configuration Manual](https://matrix-org.github.io/synapse/latest/usage/configuration/config_documentation.html))
  Matrix.org's moderation page confirms this is deliberate, not a bug: "It is common for servers
  not to immediately delete redacted messages from their database — this is a deliberate
  moderation feature, letting server admins handle redaction-abuse (e.g. users sending and then
  immediately redacting obnoxious messages) by checking their databases if needed."
  ([Matrix.org — Moderation in Matrix](https://matrix.org/docs/older/moderation/)) A tracked
  Synapse issue titled exactly this — "Redact does not actually redact all content" — reports that
  "When we redact an event, its content still hangs around in the database."
  ([synapse#3211](https://github.com/matrix-org/synapse/issues/3211))

**Bottom line**: Matrix's redaction is a real wire-level event type with a spec-mandated
stripping algorithm — the strongest thing surveyed — but it is a *convention every participant
must choose to honor*, not an erasure that's structurally guaranteed once an event has already
reached other homeservers, bridges, or clients. Matrix's own team describes this as unavoidable
given federation, not a Matrix-specific shortcoming. Matrix's federation model is also *not* pure
flood-gossip to begin with — homeservers do maintain shared, authoritative room state (membership,
power levels) via a DAG + auth-rules state-resolution algorithm, which is a meaningfully stronger
substrate than Hyperswarm flood-gossip has. Even so, redaction of *content* is advisory once it
has left the originating homeserver.

## 3. CRDT text/chat systems: tombstones, not removal — by design, not oversight

Both major CRDT text libraries treat "delete" as append-only too, for the same convergence reason
gossip systems can't truly delete: every replica must be able to merge concurrent operations
(including a concurrent insert next to something another replica deleted) without central
coordination.

- **Yjs**, straight from its own internals doc: "When an item has been deleted by any peer, at
  any point in history, it is flagged as deleted on the item" rather than removed. Without garbage
  collection, "deleted items remain in memory as tombstones." Deletions are tracked in a **Delete
  Set** (ranges like `client:(1..100)`) that's included in every sync message, "usually tiny in
  practice" even for large documents. Garbage collection is a separate, opt-in step that discards
  tombstone *content* but still can't discard the tombstone's identity/position without breaking
  ordering guarantees for concurrent inserts.
  ([yjs/yjs — INTERNALS.md](https://github.com/yjs/yjs/blob/main/INTERNALS.md))
- **Automerge**'s own docs describe the merge outcome for concurrent delete-vs-update on a list
  element ("If `A` deletes element at index `i` and `B` updates the element at `i` then set the
  value of `i` to the updated value from `B`") — i.e. a delete doesn't unconditionally win, which
  is only possible because the deleted identity is still tracked, not physically gone.
  ([Automerge — Merge Rules](https://automerge.org/docs/reference/under-the-hood/merge-rules/))
  A third-party technical walkthrough of Automerge's model states this explicitly: "Deleted items
  leave tombstones to ensure consistent deletion across replicas," and that document size grows
  with operation count, not current content, specifically because history (including tombstones)
  is preserved to enable future merges.
  ([Automerge CRDT Concepts (Posit automerge-r bindings docs)](https://posit-dev.github.io/automerge-r/articles/crdt-concepts.html))

**Bottom line**: every CRDT surveyed treats deletion as "mark and hide," never "erase," for the
identical structural reason SSB/Matrix can't guarantee erasure — a replica that hasn't seen the
delete yet, or that concurrently inserted next to the deleted content, needs the tombstone to
converge correctly. This is the same shape of answer as SSB and Matrix, arrived at independently
for a different reason (merge correctness vs. federation trust), which is a meaningful convergence
of precedent.

## 4. Mute precedent: receiver-side filtering is what decentralized systems actually ship; sender-side suppression requires a central gatekeeper somewhere

- **SSB block** (above) is receiver-side by construction: it's a message the *blocker* signs
  into their own log to change their own replication behavior. The blocked peer is never told and
  is not stopped from publishing or being replicated by anyone else.
  ([ssbc/ssb-friends](https://github.com/ssbc/ssb-friends))
- **Matrix's personal "ignore"** is documented as exactly this too — a client-side/personal
  preference list, distinct from room-level "ban" (which *is* enforced more centrally, but only
  because Matrix rooms have homeserver-checked authoritative state — see below).
- **Bluesky/AT Protocol's block**, despite looking more "enforced" than a personal mute, is still
  fundamentally receiver/relay-side, not sender-side — straight from Bluesky's own engineering
  blog: block enforcement happens because "blocks are primarily enforced by other nodes and
  services — personal data servers (PDS), App Views, and clients," and block records must be
  public specifically *because* "servers must know which accounts you have blocked in order to be
  able to enforce that relationship." The blocking user's own repo just publishes a public record;
  every other party (PDS, AppView, client) has to voluntarily read and honor it.
  ([Bluesky — Why are blocks on Bluesky public?](https://docs.bsky.app/blog/block-implementation))
  This is architecturally the closest analog to Campvus's situation of anything surveyed: a
  semi-central AppView plus every client independently choosing to honor a published block record
  — not the blocked account's own device refusing to send.
- **Where true sender-side suppression *does* exist**, it's because there's a central-enough
  authority sitting in the message's path that can refuse to relay before it reaches anyone else:
  - XMPP Multi-User Chat (XEP-0045): banning is enforced by the **room's MUC service** itself — "If
    the user has been banned from the room (i.e., has an affiliation of 'outcast'), the service
    MUST deny access to the room and inform the user of the fact that they are banned." That's a
    server in the room's path with the authority (and the obligation) to refuse.
    ([XEP-0045: Multi-User Chat](https://xmpp.org/extensions/xep-0045.html))
  - Matrix's room-level **ban** is stronger than personal "ignore" for a similar reason: rooms
    have homeserver-checked, authoritative shared state (membership, power levels) resolved via a
    DAG + auth-rules algorithm — a lightweight but real point of centralized-enough enforcement
    per room, distinct from Matrix's pure-advisory redaction of message *content*.

**Bottom line**: across every gossip/federated system surveyed that has no per-room server sitting
in the delivery path, mute/block is receiver-side filtering — a client- or relay-side choice to
stop *accepting* from a given identity, never a mechanism that stops that identity from
*broadcasting*. The only counter-examples (XMPP MUC ban, Matrix room ban) both work because a
server component with real authority over that room's membership sits in the path and can refuse
to relay — which is precisely the piece a Hyperswarm flood-gossip swarm with no room server
doesn't have.

## Implications for Campvus

Translating the precedent onto Campvus's actual substrate (Hyperswarm flood-gossip, `manifests`
verified by Ed25519 signature per `packages/engine/src/swarm-protocol.ts`, no central broker in
the message path per ADR-0007):

- **"Delete" can only realistically mean a tombstone/redaction message that well-behaved clients
  choose to honor** — structurally the same shape as Matrix's redaction event and SSB's
  block-and-purge pattern, and the same reason CRDTs never physically erase either. A Teacher's
  "delete" action would be a new signed gossip message (e.g. `{type: 'delete', messageId,
  by: teacherPubKey}`) that every client applies locally: stop rendering, maybe purge from local
  chat history/recording. It cannot force removal from a peer that already logged/relayed the
  original, already has it cached, or runs modified/non-compliant client code — same ceiling
  Matrix's own team names as unavoidable, not a Campvus-specific gap.
- **A Campvus "delete" is actually on firmer ground than Matrix's redaction in one respect**:
  Matrix's redaction has to defend against *other homeservers* under different operators
  potentially not cooperating. Campvus's peers all run the same first-party client against the
  same enrollment-gated swarm (per ADR-0007's trust model) — closer to "everyone's on the
  reference client" than federation. That raises the *realistic* compliance rate but doesn't change
  the architectural ceiling: a modified client (or a student who screenshots/saves before the
  delete propagates) still defeats it, exactly as bridged/non-compliant Matrix homeservers do.
- **"Mute" can only realistically mean receiver-side filtering** — every other client independently
  drops future messages from the muted sender's pubkey once it sees the mute gossip message,
  mirroring SSB's `ssb-friends` block and Bluesky's block-enforced-by-every-PDS/AppView/client
  pattern. The muted Student's own client is not prevented from continuing to gossip messages, and
  nothing stops a modified/non-compliant client from ignoring the mute and still rendering that
  student's messages locally for whoever's running it.
- **What would have to change for sender-side mute/delete enforcement to become real**: precedent
  says you need a server-equivalent component sitting in the message's actual delivery path with
  authority to refuse relay — XMPP's MUC service and Matrix's per-room homeserver state-resolution
  both work for this reason. That would mean introducing something Campvus's flood-gossip model
  deliberately doesn't have for chat (per this map's standing "chat rides the same Hyperswarm
  topic, not a separate server-mediated mechanism" decision) — e.g. a Teacher-side relay/gate that
  every peer routes chat through instead of pure flood-gossip, or a Teacher-signed "session chat
  policy" that peers structurally refuse to relay past (closer to Matrix's auth-rules model than
  its redaction model). Either is a bigger architectural move than a moderation feature normally
  implies, and is exactly the kind of tradeoff [Moderation Model](../issues/03-moderation-model.md)
  should weigh explicitly rather than assume away.
- **Both mechanisms depend on well-behaved clients** for anything beyond "the Teacher's own view
  looks moderated." That's the realistic ceiling across every precedent surveyed here, not a gap
  specific to Campvus's design.
