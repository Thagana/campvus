# Moodle Web Services API — Integration Research

**Purpose:** Answers Open Question #3 from `docs/ARCHITECTURE.md` §12 ("LMS ToS/API rate limits — needs confirming per LMS vendor before committing to a polling cadence or webhook dependency") for the chosen target LMS, Moodle. This informs the real LMS integration that will replace the manual CLI trigger in `apps/mode-a-headless/src/watcher.ts`.

**Method:** Primary sources only — moodledev.io, docs.moodle.org, moodle.org (community forum, and the plugin listings which now live at marketplace.moodle.com after a 2024 platform migration). Third-party blog summaries were used only to generate search leads, never as cited evidence.

**Date of research:** 2026-07-27.

---

## 1. Does Moodle core impose rate limits on the Web Services API?

**Finding: No documented hard rate limit in Moodle core.**

- `docs.moodle.org/dev/Web_service_API_functions` — the reference page for web service/external functions — contains no mention of call-frequency limits, quotas, or throttling. It documents function naming, protocol support (REST, SOAP, XML-RPC), and per-version function availability only.
  Source: https://docs.moodle.org/dev/Web_service_API_functions
- `docs.moodle.org/dev/External_services_security` — the security model for external services — documents token scoping (per-user, per-context, `contextid` restriction, IP restriction on tokens), but nothing about request-rate throttling.
  Source: https://docs.moodle.org/dev/External_services_security
- `docs.moodle.org/502/en/Using_web_services` (the current stable-version admin guide to enabling/using web services) likewise has no rate-limit or quota section.
  Source: https://docs.moodle.org/502/en/Using_web_services
- Community confirmation: a moodle.org forum thread titled "Moodle Max API Limit" (started Dec 2016) asks exactly this question; the answer given is that there is **no limit other than server resources**. This is a community forum response, not an official policy statement from Moodle HQ, but it is consistent with the absence of any rate-limit code path documented anywhere else, and moodle.org is Moodle's own official community site.
  Source: https://moodle.org/mod/forum/discuss.php?d=344332

**Conclusion:** Any throttling a caller experiences against a real Moodle site comes from the **hosting environment** (PHP `max_execution_time`, web-server/reverse-proxy connection limits, shared-hosting CPU/process caps), not from Moodle application code itself. Moodle core does not ship a webservice-specific rate limiter, API gateway, or per-token quota system.

**Confidence: well-documented (for the negative claim — "core imposes no rate limit").** The absence of a feature is harder to prove exhaustively than its presence, but three independent primary-source pages (API reference, security model, admin guide) are silent on it, and the direct community Q&A on the topic confirms the same reading. Treat this as strong evidence, not absolute proof — it remains possible a rate-limit-shaped capability was added in a version-specific plugin or a very recent core release not indexed by these pages.

---

## 2. Does Moodle core have a native webhook / real-time event-notification mechanism?

**Finding: No. Moodle core's Events API is internal-only (in-process PHP observers), not a webhook system.**

- `docs.moodle.org/dev/Events_API` describes Moodle's event system as PHP-level "observers" registered in each plugin's `db/events.php`, dispatched in-process when actions (including file-related events) occur. Explicitly: "Event observers can not modify event data or interrupt the dispatching of events, it is a one way communication channel" — this is an internal callback mechanism within the same PHP request/codebase, not an outbound HTTP call to a third party.
  Source: https://docs.moodle.org/dev/Events_API

There is **no core mechanism** that turns an internal event (e.g., a new file added to a course) into an outbound HTTP POST to an external service. That capability only exists via third-party plugins.

### Third-party plugins that add this capability (from Moodle's official plugin directory)

Moodle's plugin directory moved from `moodle.org/plugins/*` to `marketplace.moodle.com/plugins/*` (moodle.org now 303-redirects there); listings below are from the plugin's own marketplace.moodle.com page.

1. **WebHooks** (`local_webhooks`)
   - Purpose: lets external applications receive POST-callback notifications when configured Moodle "topics"/fields change.
   - Maintenance status: **Latest release: 6 years ago** (i.e., stale as of this research). **Supports Moodle 3.2–3.8** — well behind current Moodle (5.x line as of 2026). 856 total installs, only 237 downloads in the last 90 days at time of check.
   - Source: https://marketplace.moodle.com/plugins/local_webhooks (redirected from https://moodle.org/plugins/local_webhooks)
   - **Verdict: not viable for a new integration** — does not list support for any Moodle version campvus would realistically target.

2. **Event Trigger / Workflows** (`tool_trigger`)
   - Purpose: lets administrators trigger external actions (HTTP request, email, etc.) when Moodle events fire, with filter conditions before the action runs. Moodle's file/resource-creation events are part of its general event catalogue, so this plugin can be configured to POST a webhook when a file is added to a course.
   - Maintenance status: **Latest release: 1 year ago**, **Supports Moodle 4.4–4.5**. Maintained by Catalyst IT (a "Premium Certified Partner" per the marketplace listing) — actively maintained, current-version support. 756 installs, 211 downloads in the last 90 days.
   - Source: https://marketplace.moodle.com/plugins/tool_trigger (redirected from https://moodle.org/plugins/tool_trigger)
   - **Verdict: the credible option** if a webhook-style push were chosen over polling — actively maintained and version-current, unlike `local_webhooks`. Still a third-party plugin the target institution's Moodle admin would have to install; not something campvus can assume is present on every Moodle install we integrate with.

**Confidence: well-documented for "no core webhook mechanism" (direct quote from the Events API doc). Well-documented for plugin existence/maintenance status (directly quoted from each plugin's own listing page). Moderately confident, not verified hands-on, that `tool_trigger`'s event catalogue actually includes a granular "file added to course" trigger** — the marketplace page describes the general capability, but campvus would need to check the plugin's own event-filter list (or its GitHub source) before relying on it for the specific "new file uploaded" case.

---

## 3. What polling interval is reasonable/non-abusive given Moodle's deployment model?

**Finding: Moodle's own guidance is about its internal cron, not external API polling — there is no published Moodle guidance for third-party API polling cadence.** The cron guidance is nonetheless the best proxy available from a primary source, since it reflects Moodle's own stated tolerance for "how often is it safe/sane to hit this application repeatedly on typical (including shared) hosting."

- `docs.moodle.org/502/en/Cron`: **"It is recommended that the cron is run every minute"** (tied to recycle-bin async deletion and other time-sensitive features like completion tracking/access restrictions). Moodle's own docs note the counter-intuitive point that running cron *more* often makes each run *lighter* (less backlog to process per run), not heavier.
  Source: https://docs.moodle.org/502/en/Cron
- Community discussion (`moodle.org/mod/forum/discuss.php?d=420126`, title "Shared Hosting limits CRON to 15 minutes minimum") indicates some shared hosts cap cron scheduling at 15-minute granularity regardless of what Moodle itself recommends — a real-world hosting-environment constraint, not a Moodle-imposed one.
  Source: https://moodle.org/mod/forum/discuss.php?d=420126 (community forum; not independently re-verified per-host, cited as a hosting-environment data point rather than Moodle policy)

**Conclusion / recommendation for campvus:** Since (a) Moodle imposes no documented rate limit, but (b) many real deployments are self-hosted or shared-hosting installs where CPU/process budget is genuinely scarce, and (c) Moodle's own 1-minute cron guidance implies the *application* is fine being touched that often, a reasonable non-abusive default for an external polling client is **in the low-single-digit-minutes range (e.g., every 2–5 minutes)** — frequent enough to feel near-real-time for course content, well below Moodle's own 1-minute cron cadence (so it never becomes the dominant load on the box), and safely above the 15-minute floor some shared hosts impose on their *own* cron (this is an external HTTP poll, not a cron registration, so that floor doesn't technically apply, but it's a useful proxy for "what this class of hosting environment tolerates well"). This interval should be configurable per-institution (matching the CLI-flag pattern already used for `--origin-timeout-ms` etc. in the engine), since actual tolerance depends on the specific host's resources, not on anything Moodle itself dictates.

**Confidence: inferred, not directly documented.** Moodle publishes no polling-cadence guidance for external API consumers — this recommendation is campvus's own reasoning from Moodle's cron guidance plus the shared-hosting forum data point, not a quoted Moodle policy. Open Question #3 should be considered **partially open** on this specific point pending real experimentation against a live Moodle instance (ideally the pilot institution's actual host).

---

## 4. What authentication mechanism does a headless external service use?

**Finding: Confirmed token-based, tied to a dedicated service-account user — matches the assumption in the question.**

- `docs.moodle.org/dev/External_services_security`: **"The authentication is based on security tokens (user, context and purpose specific) that are generated in normal Moodle interface"**; tokens have a `tokentype` (permanent/no-session, session-linked, or permanent-with-emulated-session) and can be scoped to a `contextid`.
  Source: https://docs.moodle.org/dev/External_services_security
- Same page, on the service-account pattern for non-interactive callers: **"It is recommended to create separate user for each external application. The benefit of this auth type is that it can not be used for normal log-in from the web interface."** — i.e., Moodle's own guidance is to provision a dedicated, non-browser-login user per external integration and issue that user a token, exactly the "service-account user" model assumed in the question.
  Source: https://docs.moodle.org/dev/External_services_security
- `docs.moodle.org/502/en/Using_web_services`: operational path — an admin enables the `moodle/webservice:createtoken` capability (or creates the token directly under **Site administration > Plugins > Web services > Manage tokens**), and the resulting token is passed as `wstoken` on every REST call (`/webservice/rest/server.php?wstoken=TOKEN&moodlewsrestformat=JSON&wsfunction=...`).
  Source: https://docs.moodle.org/502/en/Using_web_services

**On OAuth2:** Moodle does have an OAuth2 subsystem (`core/oauth2`), but it exists for a different purpose — Moodle acting as an OAuth2 **client** to external identity providers (Google, Microsoft, etc.) for user login/SSO and for services like badge issuing — not as an OAuth2 **authorization-server grant type** for external headless services calling Moodle's own web-service functions. No page in the External API / web-services documentation tree (`docs.moodle.org/dev/External_services_security`, `moodledev.io/docs/5.0/apis/subsystems/external`, `moodledev.io/docs/5.0/apis/subsystems/external/security`) mentions OAuth2 client-credentials as an alternative to `wstoken` for calling functions like `core_course_get_contents`.
  Sources: https://moodledev.io/docs/5.0/apis/subsystems/external, https://moodledev.io/docs/5.0/apis/subsystems/external/security

**Conclusion:** Token-based auth via a dedicated service-account Moodle user is correct and is Moodle's own recommended pattern for exactly this use case (external, non-interactive application). No OAuth2 client-credentials path exists for this purpose in Moodle core.

**Confidence: well-documented.** Directly quoted from two independent official Moodle documentation pages, with the service-account recommendation explicitly stated in Moodle's own words.

---

## Summary Table

| # | Question | Answer | Confidence |
|---|---|---|---|
| 1 | Core rate limits on Web Services API | None documented in core; any throttling is host/PHP/webserver-imposed | Well-documented (strong negative evidence across 3 primary pages + community confirmation) |
| 2 | Native webhook mechanism | None in core (Events API is internal-only observers); `tool_trigger` (actively maintained, Moodle 4.4–4.5) is the credible third-party option, `local_webhooks` is stale (6 yrs old, Moodle 3.2–3.8 only) | Well-documented for core absence and plugin metadata; moderate confidence on `tool_trigger`'s exact file-upload event granularity (not hands-on verified) |
| 3 | Reasonable polling interval | No Moodle guidance for external polling exists; recommend 2–5 min based on Moodle's own 1-minute cron guidance as a proxy, configurable per institution | Inferred/uncertain — genuinely undocumented, flagged as still-open |
| 4 | Auth mechanism for headless service | Token-based (`wstoken`) tied to a dedicated non-login service-account user, per Moodle's own recommended pattern; OAuth2 client-credentials does not apply here | Well-documented (direct quotes from official docs) |

## Residual open items (Open Question #3 remains partially open)

- No real Moodle instance was tested against; all findings are documentation-only. Actual behavior under the pilot institution's specific hosting (§13 of `docs/ARCHITECTURE.md` — single course, single residence pilot) should be spot-checked once a Moodle test instance is available, particularly:
  - Confirm `tool_trigger`'s event catalogue actually exposes a course-file-added event with enough discriminating data (course ID, file hash/URL) to drive campvus's ingestion, before committing to it as a webhook source.
  - Confirm the pilot host's actual PHP/webserver tolerances (timeout, concurrent-connection limits) empirically, since Moodle core sets no ceiling itself.
