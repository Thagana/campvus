Type: grilling
Status: resolved
Blocked by: 01, 02

# Framework choice

## Question

Given the findings from Bundle size and runtime comparison and Tooling and ecosystem fit,
plus the fact that React is already used elsewhere in the repo (`mode-b-web`, `campvus`)
while Svelte is unused anywhere in the repo today — which framework should
`mode-a-desktop`'s renderer adopt?

## Answer

**React.** Bundle size doesn't discriminate between candidates (Bundle size and runtime
comparison), so the decision rests on tooling fit and consistency — both favor React:
Svelte's type-checker is currently broken under this repo's pinned `typescript@^7.0.2`
with no workaround, `@testing-library/svelte` would force in a Vitest dependency this app
doesn't have, and Phosphor Icons only ships an official package for React (already proven
in-repo via `mode-b-web`). React is also already used elsewhere in the monorepo
(`mode-b-web`, `campvus`), so this keeps the whole repo on one framework rather than
introducing a second. No countervailing reason to prefer Svelte was raised — confirmed
directly with the user.

Preact and Solid were considered (per the research) but not chosen: both have weaker or no
Phosphor Icons support, and neither carries the consistency benefit React already has in
this repo.
