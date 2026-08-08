import { useState, FormEvent } from 'react'
import { ArrowLeft, CheckCircle, Eye, EyeSlash, WarningCircle } from '@phosphor-icons/react'
import { authClient } from '../auth-client'

export default function LoginPage () {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [resetRequested, setResetRequested] = useState(false)

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
      } else if (mode === 'register') {
        // Registering no longer grants a session immediately (auth.ts's
        // requireEmailVerification) — the account is created and a
        // verification email goes out, but the user has to click it (and
        // then log in here) before they're signed in.
        const { data, error: authError } = await authClient.signUp.email({ email, password, name: email })
        if (authError) throw new Error(authError.message)
        if (!data?.token) setAwaitingVerification(true)
      } else {
        // The emailed link points at /reset-password (ResetPasswordPage,
        // wired up in App.tsx) with a token query param — better-auth's
        // /request-password-reset endpoint builds that link itself.
        const { error: authError } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
        if (authError) throw new Error(authError.message)
        setResetRequested(true)
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
          <CheckCircle size={28} weight="fill" className="status-icon status-icon-success" />
          <h1>Check your email</h1>
          <p className="muted">We sent a verification link to {email}. Click it, then come back here to log in.</p>
          <button type="button" className="btn btn-ghost" onClick={() => { setAwaitingVerification(false); setMode('login') }}>
            <ArrowLeft /> Back to log in
          </button>
        </div>
      </div>
    )
  }

  if (resetRequested) {
    return (
      <div className="center">
        <div className="card login-card">
          <span className="eyebrow">campvus</span>
          <CheckCircle size={28} weight="fill" className="status-icon status-icon-success" />
          <h1>Check your email</h1>
          <p className="muted">If an account exists for {email}, we sent a link to reset the password.</p>
          <button type="button" className="btn btn-ghost" onClick={() => { setResetRequested(false); setMode('login') }}>
            <ArrowLeft /> Back to log in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="center">
      <form className="card login-card" onSubmit={(e) => { void handleSubmit(e) }}>
        <span className="eyebrow">campvus</span>
        <h1>{mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your account' : 'Reset your password'}</h1>
        <p className="muted">{mode === 'login' ? 'Teacher log in' : mode === 'register' ? 'Set up a teacher account' : "Enter your email and we'll send you a reset link"}</p>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'forgot' && (
          <label>
            Password
            <div className="input-with-action">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeSlash /> : <Eye />}
              </button>
            </div>
          </label>
        )}
        {mode === 'login' && (
          <button type="button" className="btn btn-ghost" onClick={() => setMode('forgot')}>Forgot password?</button>
        )}
        {error && <p className="error"><WarningCircle /> {error}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'register' ? 'Register' : 'Send reset link'}
        </button>
        {mode === 'forgot' ? (
          <button type="button" className="btn btn-ghost" onClick={() => setMode('login')}>
            <ArrowLeft /> Back to log in
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
          </button>
        )}
      </form>
    </div>
  )
}
