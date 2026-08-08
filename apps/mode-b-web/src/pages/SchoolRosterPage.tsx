import { useEffect, useState } from 'react'
import { getSchoolRoster, listSchools, SchoolRoster, ApiError } from '../api'
import { Breadcrumb } from '../components/Breadcrumb'
import { Spinner } from '../components/Spinner'

// getSchoolRoster (routes/admin.ts) has no school-name field on its
// response, so the heading/breadcrumb resolves it from a second
// listSchools() call instead — a backend change to add one is out of
// scope here. Falls back to the raw id if that lookup hasn't resolved
// yet or the school isn't found in it.
export default function SchoolRosterPage ({ schoolId }: { schoolId: string }) {
  const [roster, setRoster] = useState<SchoolRoster | 'loading'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [schoolName, setSchoolName] = useState<string | null>(null)

  useEffect(() => {
    setRoster('loading')
    setError(null)
    setForbidden(false)
    getSchoolRoster(schoolId)
      .then(setRoster)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true)
        } else {
          setError(err instanceof Error ? err.message : 'something went wrong')
        }
      })
  }, [schoolId])

  useEffect(() => {
    listSchools()
      .then((schools) => {
        const match = schools.find((s) => s.id === schoolId)
        if (match) setSchoolName(match.name)
      })
      .catch(() => {})
  }, [schoolId])

  const heading = schoolName ?? schoolId

  return (
    <div>
      <Breadcrumb items={[{ label: 'Admin', to: '/platform-admin' }, { label: heading }]} />

      {forbidden && <p className="error">You don't have platform-admin access.</p>}

      {!forbidden && (
        <>
          <section>
            <span className="eyebrow">{heading}</span>
            <h2>Members</h2>
            {roster === 'loading' && <Spinner label="Loading members…" />}
            {error && <p className="error">{error}</p>}
            {roster !== 'loading' && roster.members.length === 0 && <p className="muted">No members yet.</p>}
            {roster !== 'loading' && roster.members.length > 0 && (
              <table>
                <thead><tr><th>Email</th><th>Role</th></tr></thead>
                <tbody>
                  {roster.members.map((m) => (
                    <tr key={m.userId}><td>{m.email}</td><td>{m.role}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h3>Courses &amp; enrollment</h3>
            {roster !== 'loading' && roster.courses.length === 0 && <p className="muted">No courses yet.</p>}
            {roster !== 'loading' && roster.courses.length > 0 && (
              <table>
                <thead><tr><th>Course</th><th>Enrolled students</th></tr></thead>
                <tbody>
                  {roster.courses.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name} <span className="muted">({c.id})</span></td>
                      <td>{c.students.length === 0 ? <span className="muted">none</span> : c.students.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  )
}
