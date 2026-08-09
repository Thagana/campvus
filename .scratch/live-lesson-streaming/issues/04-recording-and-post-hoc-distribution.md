Type: grilling
Status: resolved

# Recording & Post-Hoc Distribution

## Question

Should a live lesson be recorded? If so, does the recording become a regular manifest object,
distributed afterward through the existing P2P file-distribution engine using the same
hash-sign-publish pipeline as any other course file (§5.1-§5.3 of `docs/ARCHITECTURE.md`)?

Decide:

- Whether recording is in scope for this spec at all, versus a deliberate follow-on effort.
- If in scope, where the raw recording lives before it becomes a signed manifest (the teacher's
  own device, Mode B origin storage, an intermediate service) and who triggers the
  hash-sign-publish step.

This is largely independent of
[Media Transport & Control-Plane Boundary Decision](03-media-transport-boundary-decision.md) — a
recording can be produced and distributed as a file regardless of how the live media itself was
transported — so it doesn't need to wait on that decision.

## Answer

**In scope: yes, record and distribute via the existing engine.** After the session ends, the
recording is hashed, signed, and published as a manifest exactly like any other course file —
students who missed the live session, or want to rewatch, get it through the same
peer-first/origin-fallback path (§5.5/§5.6) as any other file. No separate rewatch mechanism.

**Pipeline: the teacher's client records and auto-publishes.** The teacher's desktop/Electron
client is already the segment source for the live relay (per
[Media Transport & Control-Plane Boundary Decision](03-media-transport-boundary-decision.md)),
so it also writes the raw recording locally as it streams. The moment the session ends, that
client runs the recording through the same hash → sign → publish pipeline §5.1-§5.3 already
defines for any ingested file — no separate upload step, no new server-side recording path.
Mode B's origin storage still ends up holding the published object (as the fallback tier), the
same as any other manifest's file bytes, but the server never has to record or transcode a live
stream itself.

**Not decided here, left for the spec/implementation:** exact storage location/retention on the
teacher's machine before publish, and recording format/encoding — these are implementation
details downstream of this decision, not architecture-level questions this ticket needs to
settle.
