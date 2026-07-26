import { useEffect, useState, FormEvent } from 'react'
import { listManifests, uploadManifest, enrollUser, SignedManifest } from '../api'

export default function CourseDetailPage (
  { courseId, onBack }: { courseId: string, onBack: () => void }
) {
  const [manifests, setManifests] = useState<SignedManifest[] | 'loading'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [enrollEmail, setEnrollEmail] = useState('')
  const [enrollRole, setEnrollRole] = useState<'student' | 'teacher'>('student')
  const [enrolling, setEnrolling] = useState(false)
  const [enrollMessage, setEnrollMessage] = useState<string | null>(null)

  function refresh (): void {
    listManifests(courseId).then(setManifests).catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(refresh, [courseId])

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

  async function handleEnroll (e: FormEvent): Promise<void> {
    e.preventDefault()
    setEnrollMessage(null)
    setEnrolling(true)
    try {
      await enrollUser(courseId, enrollEmail, enrollRole)
      setEnrollMessage(`Enrolled ${enrollEmail} as ${enrollRole}.`)
      setEnrollEmail('')
    } catch (err) {
      setEnrollMessage(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setEnrolling(false)
    }
  }

  return (
    <div>
      <button className="btn btn-ghost" onClick={onBack}>&larr; Back to courses</button>

      <section>
        <span className="eyebrow">Course</span>
        <h2>{courseId}</h2>
      </section>

      <section>
        <h3>Upload course material</h3>
        <form className="row" onSubmit={(e) => { void handleUpload(e) }}>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="submit" className="btn btn-primary" disabled={!file || uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

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

      <section>
        <h3>Enroll someone</h3>
        <p className="muted">They must already have an account (register first).</p>
        <form className="row" onSubmit={(e) => { void handleEnroll(e) }}>
          <label>
            Email
            <input type="email" required value={enrollEmail} onChange={(e) => setEnrollEmail(e.target.value)} />
          </label>
          <label>
            Role
            <select value={enrollRole} onChange={(e) => setEnrollRole(e.target.value as 'student' | 'teacher')}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={enrolling}>{enrolling ? 'Enrolling…' : 'Enroll'}</button>
        </form>
        {enrollMessage && <p className="muted">{enrollMessage}</p>}
      </section>
    </div>
  )
}
