import { useEffect, useState, FormEvent } from 'react'
import { listSchools, createSchool, School, ApiError } from '../api'

// Platform-admin section (routes/admin.ts, CAMPVUS_ADMIN_EMAILS allowlist).
// The nav entry that opens this page is visible to every signed-in user
// (see App.tsx) since role isn't part of the client-side session payload —
// the backend is the real gate, and a non-admin just sees a clean "you
// don't have access" state here rather than a broken/empty admin screen.
export default function AdminPage ({ onBack }: { onBack: () => void }) {
  const [schools, setSchools] = useState<School[] | 'loading'>('loading')
  const [forbidden, setForbidden] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [founderEmail, setFounderEmail] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

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

  async function handleCreate (e: FormEvent): Promise<void> {
    e.preventDefault()
    setCreateError(null)
    setCreating(true)
    try {
      await createSchool(name, founderEmail)
      setName('')
      setFounderEmail('')
      refresh()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <button className="btn btn-ghost" onClick={onBack}>← Back</button>

      {forbidden && <p className="error">You don't have platform-admin access.</p>}

      {!forbidden && (
        <>
          <section>
            <span className="eyebrow">Admin</span>
            <h2>Schools</h2>
            {schools === 'loading' && <p className="muted">Loading…</p>}
            {loadError && <p className="error">{loadError}</p>}
            {schools !== 'loading' && schools.length === 0 && <p className="muted">No Schools yet — create one below.</p>}
            {schools !== 'loading' && schools.length > 0 && (
              <table>
                <thead><tr><th>Name</th><th>Slug</th></tr></thead>
                <tbody>
                  {schools.map((s) => (
                    <tr key={s.id}><td>{s.name}</td><td>{s.slug}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <span className="eyebrow">New</span>
            <h3>Create a School</h3>
            <form className="row" onSubmit={(e) => { void handleCreate(e) }}>
              <label>
                Name
                <input required placeholder="Riverside High" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Founding Teacher's email
                <input required type="email" placeholder="founder@riverside.edu" value={founderEmail} onChange={(e) => setFounderEmail(e.target.value)} />
              </label>
              <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create'}</button>
            </form>
            {createError && <p className="error">{createError}</p>}
          </section>
        </>
      )}
    </div>
  )
}
