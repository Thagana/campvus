import { useEffect, useState, FormEvent } from 'react'
import { listCourses, createCourse, Course } from '../api'

export default function CoursesPage ({ onOpenCourse }: { onOpenCourse: (courseId: string) => void }) {
  const [courses, setCourses] = useState<Course[] | 'loading'>('loading')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  function refresh (): void {
    listCourses().then(setCourses).catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(refresh, [])

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
    </div>
  )
}
