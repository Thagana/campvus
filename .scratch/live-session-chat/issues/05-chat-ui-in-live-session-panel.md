Type: prototype
Status: open

# Chat UI in LiveSessionPanel

## Question

Chat's UI surface lives in `apps/mode-a-desktop`'s `LiveSessionPanel.tsx` — the same shared
Electron client that already renders the live video (per this map's Notes). What should the
chat UI actually look like and how should it behave: docked sidebar vs. overlay, how a Teacher's
moderation actions (mute/delete, per [Moderation Model](03-moderation-model.md)) are surfaced
inline, how a newly-joined Student's backlog view reads, and how it reads on rewatch (chat
scrolling alongside recorded video, per [Chat Recording & Replay
Integration](04-chat-recording-and-replay-integration.md)).

Use the `/prototype` skill to build a cheap, rough, concrete artifact (stub UI or a rough mockup)
to react to, rather than deciding this in the abstract.

## Answer

(unresolved)
