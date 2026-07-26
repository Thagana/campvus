# Mode A ships as our own standalone companion app (A2), not an LMS-embedded plugin (A1)

`docs/ARCHITECTURE.md` §10 named two shapes for Mode A's student-side footprint: **A1**, an
LMS plugin/module reusing the LMS's own enrollment/auth directly, or **A2**, a standalone
companion app that syncs against the LMS via its existing API. We're going with **A2**.

A1 assumes we can get our code into the LMS's mobile app. For an off-the-shelf LMS (e.g.
Moodle), that app is a single vendor-owned binary shipped to every installation — the
institution doesn't control its source and can't add a third-party SDK to it. A1 is
realistically only available to an institution that has built its own custom app on top of
the LMS's API, which is rare. A2 trades that away for full control: we own our release
cadence, our background-execution model, and our UX, at the cost of asking students to
install a second app and doing our own enrollment sync against the LMS's API instead of
inheriting it for free.

## Considered Options

- **A1 (LMS plugin/SDK)** — rejected. Deepest integration in theory, but not buildable
  against a vendor-owned app for the common off-the-shelf-LMS case; would only work for
  institutions running a custom in-house LMS client, which isn't the target.
- **A2 (standalone companion app)** — accepted. `apps/campvus` is this app (currently
  scaffolded only, ahead of Mode A's engine work catching up).

## Consequences

Resolves `docs/ARCHITECTURE.md` §12 open question #8. Students must be asked to install a
second app; the trigger/scheduling question for the background agent (OS job scheduling,
foreground-only sync, etc.) is now unblocked to design against A2's actual constraints,
since it's no longer contingent on an LMS host app's lifecycle.
