import { useEffect, useMemo, useState, FormEvent } from 'react'
import { BookOpen, MagnifyingGlass, Plus, UserPlus } from '@phosphor-icons/react'
import { listCourses, createCourse, getMySchool, inviteToSchool, Course, MySchool } from '../api'
import { useAsyncForm } from '../hooks/useAsyncForm'
import { useToast } from '../components/Toast'
import { Modal } from '../components/Modal'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { Link, coursePath } from '../router'

export default function CoursesPage () {
  const { showSuccess } = useToast()
  const [courses, setCourses] = useState<Course[] | 'loading'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [school, setSchool] = useState<MySchool | null>(null)
  const isStaff = school !== null && school.role !== 'student'

  const [createOpen, setCreateOpen] = useState(false)
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const { submitting: creating, error: createError, handleSubmit: submitCreate } = useAsyncForm()

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'student' | 'teacher'>('student')
  const { submitting: inviting, error: inviteError, handleSubmit: submitInvite } = useAsyncForm()

  function refresh (): void {
    listCourses().then(setCourses).catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(refresh, [])
  // Only a Teacher/Owner can invite (better-auth's invite-member is
  // Staff-only, per organization-hooks.ts) — a Student's own /school call
  // still succeeds (role: 'student'), so gate the invite form on that
  // rather than skipping the fetch entirely.
  useEffect(() => { getMySchool().then(setSchool).catch(() => {}) }, [])

  const filtered = useMemo(() => {
    if (courses === 'loading') return courses
    const q = search.trim().toLowerCase()
    if (!q) return courses
    return courses.filter((c) => c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
  }, [courses, search])

  function handleCreate (e: FormEvent): void {
    void submitCreate(e, async () => {
      await createCourse(id, name)
      showSuccess(`Created ${name}.`)
      setId('')
      setName('')
      setCreateOpen(false)
      refresh()
    })
  }

  function handleInvite (e: FormEvent): void {
    if (!school) return
    void submitInvite(e, async () => {
      await inviteToSchool(school.organizationId, inviteEmail, inviteRole)
      showSuccess(`Invited ${inviteEmail} — they'll get an email to accept.`)
      setInviteEmail('')
      setInviteOpen(false)
    })
  }

  return (
    <div>
      <section>
        <div className="page-header">
          <div>
            <span className="eyebrow">Courses</span>
            <h2>Your courses</h2>
          </div>
          {isStaff && (
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => setInviteOpen(true)}>
                <UserPlus /> Invite someone
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <Plus /> New course
              </button>
            </div>
          )}
        </div>

        {courses !== 'loading' && courses.length > 0 && (
          <div className="courses-toolbar">
            <span className="sr-only" id="course-search-label">Search courses</span>
            <div className="input-with-action leading">
              <input
                type="search"
                aria-labelledby="course-search-label"
                placeholder="Search by name or ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="input-action" aria-hidden="true"><MagnifyingGlass /></span>
            </div>
          </div>
        )}

        {courses === 'loading' && <Spinner label="Loading your courses…" />}
        {loadError && <p className="error">{loadError}</p>}
        {courses !== 'loading' && courses.length === 0 && (
          <EmptyState
            icon={<BookOpen size={32} />}
            title="No courses yet"
            message={isStaff ? 'Create your first course to get started.' : "You're not enrolled in any courses yet."}
            action={isStaff && (
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <Plus /> New course
              </button>
            )}
          />
        )}
        {filtered !== 'loading' && filtered.length === 0 && courses !== 'loading' && courses.length > 0 && (
          <p className="muted">No courses match "{search}".</p>
        )}
        {filtered !== 'loading' && filtered.length > 0 && (
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Role</th><th /></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.name}</td>
                  <td>{c.role}</td>
                  <td><Link to={coursePath(c.id)} className="btn btn-secondary">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a course">
        <form onSubmit={handleCreate} className="modal-form">
          <label>
            Course ID
            <input required autoFocus placeholder="COMSCI214" value={id} onChange={(e) => setId(e.target.value)} />
          </label>
          <label>
            Name
            <input required placeholder="Intro to CS" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {createError && <p className="error">{createError}</p>}
          <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
        </form>
      </Modal>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={school ? `Invite someone to ${school.name}` : 'Invite someone'}>
        <form onSubmit={handleInvite} className="modal-form">
          <p className="muted">Sends them an email to accept. Once they're a member of your School, you can enroll them into a specific course from that course's page.</p>
          <label>
            Email
            <input type="email" required autoFocus value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </label>
          <label>
            Role
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'student' | 'teacher')}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </label>
          {inviteError && <p className="error">{inviteError}</p>}
          <button type="submit" className="btn btn-primary" disabled={inviting}>{inviting ? 'Inviting…' : 'Invite'}</button>
        </form>
      </Modal>
    </div>
  )
}
