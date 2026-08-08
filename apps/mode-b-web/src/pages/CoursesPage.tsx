import { useEffect, useState, FormEvent } from 'react'
import { listCourses, createCourse, getMySchool, inviteToSchool, Course, MySchool } from '../api'
import { useAsyncForm } from '../hooks/useAsyncForm'

export default function CoursesPage ({ onOpenCourse }: { onOpenCourse: (courseId: string) => void }) {
  const [courses, setCourses] = useState<Course[] | 'loading'>('loading')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [school, setSchool] = useState<MySchool | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'student' | 'teacher'>('student')
  const { submitting: inviting, message: inviteMessage, handleSubmit: submitInvite } = useAsyncForm()

  function refresh (): void {
    listCourses().then(setCourses).catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(refresh, [])
  // Only a Teacher/Owner can invite (better-auth's invite-member is
  // Staff-only, per organization-hooks.ts) — a Student's own /school call
  // still succeeds (role: 'student'), so gate the invite form on that
  // rather than skipping the fetch entirely.
  useEffect(() => { getMySchool().then(setSchool).catch(() => {}) }, [])

  async function handleCreate (e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      await createCourse(id, name)
      setId('')
      setName('')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setCreating(false)
    }
  }

  function handleInvite (e: FormEvent): void {
    e.preventDefault()
    if (!school) return
    void submitInvite(e, async () => {
      await inviteToSchool(school.organizationId, inviteEmail, inviteRole)
      const invited = inviteEmail
      setInviteEmail('')
      return `Invited ${invited} — they'll get an email to accept.`
    })
  }

  return (
    <div>
      <section>
        <span className="eyebrow">Courses</span>
        <h2>Your courses</h2>
        {courses === 'loading' && <p className="muted">Loading…</p>}
        {courses !== 'loading' && courses.length === 0 && <p className="muted">No courses yet — create one below.</p>}
        {courses !== 'loading' && courses.length > 0 && (
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Role</th><th /></tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.name}</td>
                  <td>{c.role}</td>
                  <td><button className="btn btn-secondary" onClick={() => onOpenCourse(c.id)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {school && school.role !== 'student' && (
        <section>
          <span className="eyebrow">New</span>
          <h3>Create a course</h3>
          <form className="row" onSubmit={(e) => { void handleCreate(e) }}>
            <label>
              Course ID
              <input required placeholder="COMSCI214" value={id} onChange={(e) => setId(e.target.value)} />
            </label>
            <label>
              Name
              <input required placeholder="Intro to CS" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
          </form>
          {error && <p className="error">{error}</p>}
        </section>
      )}

      {school && school.role !== 'student' && (
        <section>
          <span className="eyebrow">{school.name}</span>
          <h3>Invite someone to your School</h3>
          <p className="muted">Sends them an email to accept. Once they're a member of your School, you can enroll them into a specific course from that course's page.</p>
          <form className="row" onSubmit={handleInvite}>
            <label>
              Email
              <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </label>
            <label>
              Role
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'student' | 'teacher')}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary" disabled={inviting}>{inviting ? 'Inviting…' : 'Invite'}</button>
          </form>
          {inviteMessage && <p className="muted">{inviteMessage}</p>}
        </section>
      )}
    </div>
  )
}
