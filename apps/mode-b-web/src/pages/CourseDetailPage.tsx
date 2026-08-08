import { useEffect, useState, FormEvent } from 'react'
import { listManifests, uploadManifest, enrollStudent, getMySchool, SignedManifest, MySchool } from '../api'
import { useAsyncForm } from '../hooks/useAsyncForm'

export default function CourseDetailPage (
  { courseId, onBack }: { courseId: string, onBack: () => void }
) {
  const [manifests, setManifests] = useState<SignedManifest[] | 'loading'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [enrollEmail, setEnrollEmail] = useState('')
  const { submitting: enrolling, message: enrollMessage, handleSubmit: submitEnroll } = useAsyncForm()

  // Uploading (Teacher-only per-course, manifests.ts) and enrolling
  // (Staff-only school-wide, courses.ts) are both actions a Student can
  // never perform — a Teacher/Owner's school-wide role (ADR-0005) is
  // enough to gate both, no separate per-course role check needed, since
  // only Staff can do either regardless of which course they're on.
  const [school, setSchool] = useState<MySchool | null>(null)
  const isStaff = school !== null && school.role !== 'student'

  function refresh (): void {
    listManifests(courseId).then(setManifests).catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(refresh, [courseId])
  useEffect(() => { getMySchool().then(setSchool).catch(() => {}) }, [])

  async function handleUpload (e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      await uploadManifest(courseId, file)
      setFile(null)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setUploading(false)
    }
  }

  function handleEnroll (e: FormEvent): void {
    void submitEnroll(e, async () => {
      await enrollStudent(courseId, enrollEmail)
      const enrolled = enrollEmail
      setEnrollEmail('')
      return `Enrolled ${enrolled}.`
    })
  }

  return (
    <div>
      <button className="btn btn-ghost" onClick={onBack}>&larr; Back to courses</button>

      <section>
        <span className="eyebrow">Course</span>
        <h2>{courseId}</h2>
      </section>

      {isStaff && (
        <section>
          <h3>Upload course material</h3>
          <form className="row" onSubmit={(e) => { void handleUpload(e) }}>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button type="submit" className="btn btn-primary" disabled={!file || uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
          </form>
          {error && <p className="error">{error}</p>}
        </section>
      )}

      <section>
        <h3>Files</h3>
        {manifests === 'loading' && <p className="muted">Loading…</p>}
        {manifests !== 'loading' && manifests.length === 0 && <p className="muted">No files uploaded yet.</p>}
        {manifests !== 'loading' && manifests.length > 0 && (
          <table>
            <thead><tr><th>Filename</th><th>Size</th><th>Uploaded</th><th>Hash</th></tr></thead>
            <tbody>
              {manifests.map((m) => (
                <tr key={m.hash}>
                  <td>{m.filename}</td>
                  <td>{m.size} bytes</td>
                  <td>{new Date(m.timestamp).toLocaleString()}</td>
                  <td title={m.hash}>{m.hash.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {isStaff && (
        <section>
          <h3>Enroll someone</h3>
          <p className="muted">They must already be a member of your School — invite them from the courses page first if they aren't yet.</p>
          <form className="row" onSubmit={handleEnroll}>
            <label>
              Email
              <input type="email" required value={enrollEmail} onChange={(e) => setEnrollEmail(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={enrolling}>{enrolling ? 'Enrolling…' : 'Enroll'}</button>
          </form>
          {enrollMessage && <p className="muted">{enrollMessage}</p>}
        </section>
      )}
    </div>
  )
}
