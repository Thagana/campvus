## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line on each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the repo root, even though this is a pnpm monorepo. See `docs/agents/domain.md`.

### Releases

Branch model (`master` ← `release/vX.Y.Z` ← `feature/*`), single-synced versioning via `pnpm version:set X.Y.Z`, and tagging (`vX.Y.Z`) to trigger desktop build artifacts. See `docs/agents/release-process.md`.
