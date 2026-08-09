import { useEffect, useState } from 'react'
import { ArrowLeft, WarningCircle } from '@phosphor-icons/react'
import { groupCourseFiles, type CourseFileRow } from '../course-files-view'
import type { AppState, CourseFile } from '../preload-api'

export function CourseFilesPanel ({ refreshSignal, onClose }: {
  // Re-fetches whenever a new AppState arrives while this panel is open —
  // mirrors renderer.ts's `if (currentPanel === 'files') void refreshFiles()`
  // on every onStateChange push, so file rows pick up progress as syncing
  // continues. The value itself isn't read, only its identity.
  refreshSignal: AppState
  onClose: () => void
}) {
  const [files, setFiles] = useState<CourseFile[]>([])
  const [filesError, setFilesError] = useState<string>()
  const [openingHash, setOpeningHash] = useState<string>()

  useEffect(() => {
    window.campvus.getCourseFiles().then(setFiles)
  }, [refreshSignal])

  async function handleOpen (file: CourseFileRow): Promise<void> {
    setFilesError(undefined)
    setOpeningHash(file.hash)
    const result = await window.campvus.openCourseFile(file.hash)
    setOpeningHash(undefined)
    if (!result.ok) {
      setFilesError(result.error ?? 'Could not open this file.')
    }
  }

  const groups = groupCourseFiles(files)

  return (
    <section className="card files-card">
      <h2>Course files</h2>
      {groups.length === 0 && <p className="muted">No files yet — check back once syncing finds some.</p>}
      <div id="files-list">
        {groups.map((group) => (
          <div key={group.courseId}>
            <div className="eyebrow">{group.courseId}</div>
            {group.files.map((file) => (
              <div className="detail-row" key={file.hash}>
                <span className="muted">{file.filename} · {file.sizeLabel}</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!file.canOpen || openingHash === file.hash}
                  onClick={() => { void handleOpen(file) }}
                >
                  {file.canOpen ? 'Open' : file.statusLabel}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      {filesError !== undefined && <p className="error"><WarningCircle aria-hidden /> <span>{filesError}</span></p>}
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={onClose}><ArrowLeft aria-hidden /> Close</button>
      </div>
    </section>
  )
}
