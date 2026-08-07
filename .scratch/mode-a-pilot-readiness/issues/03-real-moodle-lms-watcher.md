# 03 — Real Moodle LMS watcher

**What to build:** A real poller against Moodle's Web Services REST API, replacing the manual CLI
trigger as the pilot's actual ingestion path. `apps/mode-a-headless/src/moodle-client.ts` calls
`core_course_get_contents` (via `wstoken`-authenticated REST) to list a course's files;
`apps/mode-a-headless/src/moodle-watcher.ts` polls on an interval, diffs against a locally
persisted "seen" set keyed by Moodle's own `(fileurl, timemodified)`, downloads anything new or
changed, and calls the existing `ingestFile`/`ingestBuffer` from `@campvus/engine` — the same call
the manual `watcher.ts` already makes. See `docs/research/moodle-api-integration.md` for the
sourcing behind every decision below.

**Blocked by:** None — independent of tickets 01/02, can start immediately.

**Status:** ready-for-agent

- [ ] `moodle-client.ts`: REST client calling `core_course_get_contents` against
      `<baseUrl>/webservice/rest/server.php?wstoken=<token>&moodlewsrestformat=json&wsfunction=...`,
      returning each file's `fileurl`, `filename`, `timemodified`
- [ ] File bytes are fetched from each `fileurl` with `?token=<wstoken>` appended, per Moodle's
      documented `pluginfile.php` auth pattern
- [ ] `moodle-watcher.ts`: polls on a configurable interval, **defaulting to 3 minutes** (within
      the research's recommended 2–5 minute non-abusive range)
- [ ] A locally persisted "seen" set (keyed by `(fileurl, timemodified)`, not campvus's content
      hash) prevents re-downloading and re-ingesting files already processed
- [ ] New/changed files call the existing `ingestFile`/`ingestBuffer` from `@campvus/engine`
      unchanged — no new ingestion logic, only a new adapter feeding the existing pipeline
- [ ] Config (Moodle base URL, `wstoken`, course-ID mapping, poll interval) via env vars/CLI
      flags, matching the existing `--origin-timeout-ms`-style flag pattern rather than a new
      config format
- [ ] The existing manual `watcher.ts` CLI trigger is left in place, unmodified, for dev/testing —
      this ticket adds a new entrypoint, it doesn't replace the old one
- [ ] `apps/mode-a-headless/test/` created (doesn't exist yet) with tests for `moodle-client.ts`
      and `moodle-watcher.ts` against a fake local HTTP server standing in for Moodle's REST
      shape, run via `tsx --test`, matching every other package's test runner in this repo
- [ ] Webhook-based ingestion (the `tool_trigger` plugin) is explicitly **not** implemented here —
      see spec.md's Out of Scope
