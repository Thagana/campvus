import { useEffect, useState, FormEvent } from 'react'
import { Files, UploadSimple, UserPlus, VideoCamera, CalendarPlus, PencilSimple, Trash } from '@phosphor-icons/react'
import { listManifests, uploadManifest, enrollStudent, getMySchool, listSessions, scheduleSession, rescheduleSession, cancelSession, SignedManifest, MySchool, LiveSession } from '../api'
import { useAsyncForm } from '../hooks/useAsyncForm'
import { useToast } from '../components/Toast'
import { Modal } from '../components/Modal'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { Breadcrumb } from '../components/Breadcrumb'
import { CopyButton } from '../components/CopyButton'
import { Dropzone } from '../components/Dropzone'

export default function CourseDetailPage ({ courseId }: { courseId: string }) {
  const { showSuccess } = useToast()
  const [manifests, setManifests] = useState<SignedManifest[] | 'loading'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const { submitting: uploading, error: uploadError, handleSubmit: submitUpload } = useAsyncForm()

  const [enrollOpen, setEnrollOpen] = useState(false)
  const [enrollEmail, setEnrollEmail] = useState('')
  const { submitting: enrolling, error: enrollError, handleSubmit: submitEnroll } = useAsyncForm()

  // Scheduling only (ADR-0007) — the actual live session runs entirely in
  // apps/mode-a-desktop (a browser can't run Hyperswarm); this just lets a
  // Teacher tell students when to be ready, per ticket 06's design.
  const [sessions, setSessions] = useState<LiveSession[] | 'loading'>('loading')
  const [sessionsLoadError, setSessionsLoadError] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  // Non-null while the schedule modal is editing an existing session
  // (ticket 08) rather than creating a new one — same modal, different
  // submit target.
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const { submitting: scheduling, error: scheduleError, handleSubmit: submitSchedule } = useAsyncForm()
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  // Uploading (Teacher-only per-course, manifests.ts) and enrolling
  // (Staff-only school-wide, courses.ts) are both actions a Student can
  // never perform — a Teacher/Owner's school-wide role (ADR-0005) is
  // enough to gate both, no separate per-course role check needed, since
  // only Staff can do either regardless of which course they're on.
  const [school, setSchool] = useState<MySchool | null>(null)
  const isStaff = school !== null && school.role !== 'student'

  function refresh (): void {
    listManifests(courseId).then(setManifests).catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
  }

  function refreshSessions (): void {
    listSessions(courseId).then(setSessions).catch((err) => setSessionsLoadError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(refresh, [courseId])
  useEffect(refreshSessions, [courseId])
  useEffect(() => { getMySchool().then(setSchool).catch(() => {}) }, [])

  function handleUpload (e: FormEvent): void {
    if (!file) return
    const uploadedName = file.name
    void submitUpload(e, async () => {
      await uploadManifest(courseId, file)
      showSuccess(`Uploaded ${uploadedName}.`)
      setFile(null)
      refresh()
    })
  }

  function handleEnroll (e: FormEvent): void {
    void submitEnroll(e, async () => {
      await enrollStudent(courseId, enrollEmail)
      showSuccess(`Enrolled ${enrollEmail}.`)
      setEnrollEmail('')
      setEnrollOpen(false)
    })
  }

  function handleSchedule (e: FormEvent): void {
    void submitSchedule(e, async () => {
      const startTime = new Date(scheduleAt).getTime()
      if (editingSessionId) {
        await rescheduleSession(courseId, editingSessionId, startTime)
        showSuccess('Live session rescheduled.')
      } else {
        await scheduleSession(courseId, startTime)
        showSuccess('Live session scheduled.')
      }
      setScheduleAt('')
      setEditingSessionId(null)
      setScheduleOpen(false)
      refreshSessions()
    })
  }

  // datetime-local wants "YYYY-MM-DDTHH:mm" in the viewer's local time, not
  // an ISO/UTC string — toISOString() would silently shift the displayed
  // time by the local UTC offset.
  function toDatetimeLocalValue (epochMs: number): string {
    const d = new Date(epochMs)
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function openEditSession (session: LiveSession): void {
    setEditingSessionId(session.id)
    setScheduleAt(toDatetimeLocalValue(session.startTime))
    setScheduleOpen(true)
  }

  function openScheduleNew (): void {
    setEditingSessionId(null)
    setScheduleAt('')
    setScheduleOpen(true)
  }

  async function handleCancelSession (sessionId: string): Promise<void> {
    setCancellingId(sessionId)
    try {
      await cancelSession(courseId, sessionId)
      showSuccess('Live session cancelled.')
      refreshSessions()
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Courses', to: '/' }, { label: courseId }]} />

      <section>
        <div className="page-header">
          <div>
            <span className="eyebrow">Course</span>
            <h2>{courseId}</h2>
          </div>
        </div>
      </section>

      {isStaff && (
        <section>
          <h3>Upload course material</h3>
          <form onSubmit={handleUpload}>
            <Dropzone onFile={setFile}>
              <UploadSimple size={24} />
              <p>Drag a file here, or choose one below.</p>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Dropzone>
            {file && <p className="muted">Selected: {file.name}</p>}
            {uploadError && <p className="error">{uploadError}</p>}
            <button type="submit" className="btn btn-primary" disabled={!file || uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
          </form>
        </section>
      )}

      <section>
        <div className="page-header">
          <h3>Upcoming live sessions</h3>
          {isStaff && (
            <button type="button" className="btn btn-secondary" onClick={openScheduleNew}>
              <CalendarPlus /> Schedule session
            </button>
          )}
        </div>
        {sessions === 'loading' && <Spinner label="Loading sessions…" />}
        {sessionsLoadError && <p className="error">{sessionsLoadError}</p>}
        {sessions !== 'loading' && sessions.length === 0 && (
          <EmptyState
            icon={<VideoCamera size={32} />}
            title="No live sessions scheduled"
            message={isStaff ? 'Schedule one above — start it from the Campvus desktop app when it\'s time.' : undefined}
          />
        )}
        {sessions !== 'loading' && sessions.length > 0 && (
          <table>
            <thead><tr><th>Start time</th>{isStaff && <th>Actions</th>}</tr></thead>
            <tbody>
              {[...sessions].sort((a, b) => a.startTime - b.startTime).map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.startTime).toLocaleString()}</td>
                  {isStaff && (
                    <td>
                      <div className="row">
                        <button type="button" className="btn btn-secondary" onClick={() => openEditSession(s)}>
                          <PencilSimple aria-hidden /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={cancellingId === s.id}
                          onClick={() => { void handleCancelSession(s.id) }}
                        >
                          <Trash aria-hidden /> {cancellingId === s.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <div className="page-header">
          <h3>Files</h3>
          {isStaff && (
            <button type="button" className="btn btn-secondary" onClick={() => setEnrollOpen(true)}>
              <UserPlus /> Enroll someone
            </button>
          )}
        </div>
        {manifests === 'loading' && <Spinner label="Loading files…" />}
        {loadError && <p className="error">{loadError}</p>}
        {manifests !== 'loading' && manifests.length === 0 && (
          <EmptyState icon={<Files size={32} />} title="No files uploaded yet" message={isStaff ? 'Upload course material above to get started.' : undefined} />
        )}
        {manifests !== 'loading' && manifests.length > 0 && (
          <table>
            <thead><tr><th>Filename</th><th>Size</th><th>Uploaded</th><th>Hash</th></tr></thead>
            <tbody>
              {manifests.map((m) => (
                <tr key={m.hash}>
                  <td>{m.filename}</td>
                  <td>{m.size} bytes</td>
                  <td>{new Date(m.timestamp).toLocaleString()}</td>
                  <td>
                    <span className="file-table-hash">
                      <span title={m.hash}>{m.hash.slice(0, 12)}…</span>
                      <CopyButton value={m.hash} label="Copy full hash" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Modal open={enrollOpen} onClose={() => setEnrollOpen(false)} title="Enroll someone">
        <form onSubmit={handleEnroll} className="modal-form">
          <p className="muted">They must already be a member of your School — invite them from the courses page first if they aren't yet.</p>
          <label>
            Email
            <input type="email" required autoFocus value={enrollEmail} onChange={(e) => setEnrollEmail(e.target.value)} />
          </label>
          {enrollError && <p className="error">{enrollError}</p>}
          <button type="submit" className="btn btn-primary" disabled={enrolling}>{enrolling ? 'Enrolling…' : 'Enroll'}</button>
        </form>
      </Modal>

      <Modal
        open={scheduleOpen}
        onClose={() => { setScheduleOpen(false); setEditingSessionId(null) }}
        title={editingSessionId ? 'Reschedule live session' : 'Schedule a live session'}
      >
        <form onSubmit={handleSchedule} className="modal-form">
          <p className="muted">Students see this on the course page; you start the session itself from the Campvus desktop app when it's time.</p>
          <label>
            Start time
            <input type="datetime-local" required autoFocus value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </label>
          {scheduleError && <p className="error">{scheduleError}</p>}
          <button type="submit" className="btn btn-primary" disabled={scheduling}>
            {scheduling ? 'Saving…' : editingSessionId ? 'Save' : 'Schedule'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
