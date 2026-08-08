import { useEffect, useState, FormEvent } from 'react'
import { Buildings, Plus } from '@phosphor-icons/react'
import { listSchools, createSchool, School, ApiError } from '../api'
import { useAsyncForm } from '../hooks/useAsyncForm'
import { useToast } from '../components/Toast'
import { Modal } from '../components/Modal'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { Link, schoolRosterPath } from '../router'

// Platform-admin section (routes/admin.ts, CAMPVUS_ADMIN_EMAILS allowlist).
// The nav entry that opens this page is visible to every signed-in user
// (see Sidebar.tsx) since role isn't part of the client-side session
// payload — the backend is the real gate, and a non-admin just sees a
// clean "you don't have access" state here rather than a broken/empty
// admin screen.
export default function AdminPage () {
  const { showSuccess } = useToast()
  const [schools, setSchools] = useState<School[] | 'loading'>('loading')
  const [forbidden, setForbidden] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [founderEmail, setFounderEmail] = useState('')
  const { submitting: creating, error: createError, handleSubmit: submitCreate } = useAsyncForm()

  function refresh (): void {
    listSchools()
      .then((rows) => {
        setSchools(rows)
        setForbidden(false)
        setLoadError(null)
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true)
        } else {
          setLoadError(err instanceof Error ? err.message : 'something went wrong')
        }
      })
  }

  useEffect(refresh, [])

  function handleCreate (e: FormEvent): void {
    void submitCreate(e, async () => {
      await createSchool(name, founderEmail)
      showSuccess(`Created ${name}.`)
      setName('')
      setFounderEmail('')
      setCreateOpen(false)
      refresh()
    })
  }

  return (
    <div>
      {forbidden && <p className="error">You don't have platform-admin access.</p>}

      {!forbidden && (
        <section>
          <div className="page-header">
            <div>
              <span className="eyebrow">Admin</span>
              <h2>Schools</h2>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus /> New School
            </button>
          </div>

          {schools === 'loading' && <Spinner label="Loading Schools…" />}
          {loadError && <p className="error">{loadError}</p>}
          {schools !== 'loading' && schools.length === 0 && (
            <EmptyState
              icon={<Buildings size={32} />}
              title="No Schools yet"
              message="Create one to get started."
              action={(
                <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                  <Plus /> New School
                </button>
              )}
            />
          )}
          {schools !== 'loading' && schools.length > 0 && (
            <table>
              <thead><tr><th>Name</th><th>Slug</th><th /></tr></thead>
              <tbody>
                {schools.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.slug}</td>
                    <td><Link to={schoolRosterPath(s.id)} className="btn btn-secondary">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a School">
        <form onSubmit={handleCreate} className="modal-form">
          <label>
            Name
            <input required autoFocus placeholder="Riverside High" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Founding Teacher's email
            <input required type="email" placeholder="founder@riverside.edu" value={founderEmail} onChange={(e) => setFounderEmail(e.target.value)} />
          </label>
          {createError && <p className="error">{createError}</p>}
          <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
        </form>
      </Modal>
    </div>
  )
}
