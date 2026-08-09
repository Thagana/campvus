Type: task
Status: resolved
Blocked by: 05

# Migrate course-files panel

## Question

Migrate `renderer.ts`'s course-files panel (~35 lines, per-course grouped file rows with
an "Open"/status button per file) to a React `CourseFilesPanel` component. Preserve
`course-files-view.ts`'s `groupCourseFiles()` and `formatSize()` exactly as-is (pure
logic layer, unchanged, still DOM-free) — `CourseFilesPanel` should call it and render the
result. Switch icons from the current `@phosphor-icons/web` font-class approach
(`STATUS_ICON_CLASS` string-swapping) to `@phosphor-icons/react` components, matching
`apps/mode-b-web`'s existing usage, per [Migration strategy](04-migration-strategy.md)'s
settled guidance. Preserve the existing IPC-driven `refreshFiles()` fetch behavior.

## Answer

Done. `src/components/CourseFilesPanel.tsx` holds raw `CourseFile[]` in state and calls
`groupCourseFiles()` (unchanged) fresh on every render, matching the original's approach
exactly. Icons switched to `@phosphor-icons/react` (`ArrowLeft` for close, `WarningCircle`
for errors). The refresh behavior is preserved via a `refreshSignal: AppState` prop — a
`useEffect` keyed on it re-fetches files both on mount (panel open) and on every
subsequent state push while the panel stays open, reproducing the original's
`if (currentPanel === 'files') void refreshFiles()` check without needing to replicate the
conditional in the parent.
