Type: task
Status: resolved
Blocked by: 05

# Migrate status and settings panels

## Question

Migrate `renderer.ts`'s status panel (~20 lines) and settings/login panel (~55 lines,
two forms: "Sign in to Campvus" and the settings form) to React components — a
`StatusPanel` and a `SettingsPanel`. Preserve `status-view.ts`'s `describeState()` exactly
as-is (pure logic layer, unchanged, still DOM-free and covered by
`test/status-view.test.ts`) — `StatusPanel` should just call it and render the result.
Preserve the existing `saveConfig`/`loginModeB` calls and form fields (courseIds,
institutionPublicKeyHex, originUrl, manifestOriginUrl, region, maxStoreBytes,
modeBUrl/email/password with visibility toggle) as-is; only the DOM-wiring layer changes.
Use plain CSS imports for styling (`index.css`, `@campvus/design/index.css`) — no CSS
Modules/CSS-in-JS, per [Migration strategy](04-migration-strategy.md)'s settled guidance.

## Answer

Done. `src/components/StatusPanel.tsx` calls `describeState()` (unchanged) and renders its
output; `src/components/SettingsPanel.tsx` covers both forms with controlled inputs
(`useState`) rather than the original's uncontrolled-DOM + `FormData` read, since that's
the idiomatic React pattern for this — a new pure `src/settings-form.ts` module
(`toFormValues`/`toConfig`) replaces the original's `populateForm`/`readForm` DOM
functions, written test-first (`test/settings-form.test.ts`, 8 cases) as a natural
extension of the existing pure-logic-module pattern. All existing form fields,
`saveConfig`/`loginModeB` calls, and the password-visibility toggle are preserved
behaviorally. Icons use `@phosphor-icons/react` (`Eye`/`EyeSlash`/`WarningCircle`/`Check`),
matching `mode-b-web`'s usage pattern exactly (e.g. `{showPassword ? <EyeSlash /> : <Eye />}`
mirrors `mode-b-web`'s `LoginPage.tsx`). Plain CSS imports carried over unchanged; class
names preserved exactly so `index.css`/`@campvus/design/index.css`'s existing selectors
still match (confirmed no ID-based CSS selectors were broken — only `#files-list` exists,
preserved in the files panel).
