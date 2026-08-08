import type { CourseFile } from './preload-api'

// Pure formatting of CourseFile[] into display-ready groups — kept
// separate from renderer.ts's DOM wiring, same split as status-view.ts.

export interface CourseFileRow {
  hash: string
  filename: string
  sizeLabel: string
  statusLabel: string
  canOpen: boolean
}

export interface CourseFileGroup {
  courseId: string
  files: CourseFileRow[]
}

function formatSize (bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function groupCourseFiles (files: CourseFile[]): CourseFileGroup[] {
  const byCourse = new Map<string, CourseFileRow[]>()
  for (const file of files) {
    const rows = byCourse.get(file.courseId) ?? []
    rows.push({
      hash: file.hash,
      filename: file.filename,
      sizeLabel: formatSize(file.size),
      statusLabel: file.downloaded ? 'Downloaded' : 'Syncing…',
      canOpen: file.downloaded
    })
    byCourse.set(file.courseId, rows)
  }

  return [...byCourse.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([courseId, rows]) => ({
      courseId,
      files: rows.sort((a, b) => a.filename.localeCompare(b.filename))
    }))
}
