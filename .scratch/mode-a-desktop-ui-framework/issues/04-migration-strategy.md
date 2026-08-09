Type: grilling
Status: resolved
Blocked by: 03

# Migration strategy

## Question

Once Framework choice is resolved, should `mode-a-desktop`'s renderer be migrated in one
big-bang rewrite, or incrementally (mounting the new framework for new/touched views while
leaving untouched vanilla-DOM code in place until it's touched)? This decision, combined
with an inventory of the current renderer's views (status view, course-files view,
settings/tray icon rendering), should produce the scoped implementation tickets for the
actual migration.

## Answer

**Big-bang rewrite.** Inventory confirms the renderer is small enough that incremental
adoption isn't worth its coordination cost: `renderer.ts` is 263 lines wiring 3
mutually-exclusive panels (status, settings/login, course-files), `status-view.ts` (36
lines) and `course-files-view.ts` (46 lines) are already pure/DOM-free formatters, state
is just two module-level variables driven by one `onStateChange` IPC listener, and there's
no tray UI in the renderer to complicate the cutover. Total renderer-proper surface is
~553 lines including CSS — confirmed with the user directly given this sizing.

Three fog items from the map settled inline as part of this ticket, given the small scope
made them low-stakes rather than needing their own tickets:

- **Icons**: adopt `@phosphor-icons/react`, matching `mode-b-web`'s already-proven usage
  (per Tooling and ecosystem fit) — replaces the current `@phosphor-icons/web`
  font-class approach.
- **Design-system/CSS**: keep plain CSS imports (`index.css`, `@campvus/design/index.css`)
  exactly as today — `packages/design` is framework-agnostic CSS tokens with no JS, so
  nothing forces CSS Modules or CSS-in-JS, and plain import needs no new tooling.
- **State management**: React's built-in `useState`/`useReducer` in a root `App`
  component is sufficient — two module-level variables and one IPC listener don't
  justify an external store (Redux/Zustand/Context library).

Implementation tickets for the actual migration are created as this ticket's output (per
the map's Notes override): [Renderer tooling setup](05-renderer-tooling-setup.md),
[Migrate status and settings panels](06-migrate-status-and-settings-panels.md),
[Migrate course-files panel](07-migrate-course-files-panel.md),
[State wiring and cutover](08-state-wiring-and-cutover.md).
