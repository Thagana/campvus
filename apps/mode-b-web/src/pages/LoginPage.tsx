import { useState, FormEvent } from 'react'
import { authClient } from '../auth-client'

export default function LoginPage () {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)

  async function handleSubmit (e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // No separate "name" field in this form — email doubles as the
      // display name, since a teacher portal pilot has no use for one yet.
      if (mode === 'login') {
        const { error: authError } = await authClient.signIn.email({ email, password })
        if (authError) throw new Error(authError.message)
      } else {
        // Registering no longer grants a session immediately (auth.ts's
        // requireEmailVerification) — the account is created and a
        // verification email goes out, but the user has to click it (and
        // then log in here) before they're signed in.
        const { data, error: authError } = await authClient.signUp.email({ email, password, name: email })
        if (authError) throw new Error(authError.message)
        if (!data?.token) setAwaitingVerification(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (awaitingVerification) {
    return (
      <div className="center">
        <div className="card login-card">
          <span className="eyebrow">campvus</span>
          <h1>Check your email</h1>
          <p className="muted">We sent a verification link to {email}. Click it, then come back here to log in.</p>
          <button type="button" className="btn btn-ghost" onClick={() => { setAwaitingVerification(false); setMode('login') }}>Back to log in</button>
        </div>
      </div>
    )
  }

  return (
    <div className="center">
      <form className="card login-card" onSubmit={(e) => { void handleSubmit(e) }}>
        <span className="eyebrow">campvus</span>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">{mode === 'login' ? 'Teacher log in' : 'Set up a teacher account'}</p>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
        </button>
      </form>
    </div>
  )
}
