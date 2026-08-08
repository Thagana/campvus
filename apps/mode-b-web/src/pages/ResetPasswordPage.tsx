import { useState, FormEvent } from 'react'
import { CheckCircle, Eye, EyeSlash, WarningCircle } from '@phosphor-icons/react'
import { authClient } from '../auth-client'

// Reached via the link a password-reset email sends (auth/auth.ts's
// sendResetPassword hook): better-auth's own /reset-password/:token
// endpoint validates the token server-side, then redirects here at
// ${WEB_URL}/reset-password?token=<token> (see LoginPage's requestPasswordReset
// call, which set redirectTo to this path).
export default function ResetPasswordPage ({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit (e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError("Passwords don't match")
      return
    }
    setSubmitting(true)
    try {
      const { error: authError } = await authClient.resetPassword({ newPassword: password, token })
      if (authError) throw new Error(authError.message)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="center">
        <div className="card login-card">
          <span className="eyebrow">campvus</span>
          <CheckCircle size={28} weight="fill" className="status-icon status-icon-success" />
          <h1>Password reset</h1>
          <p className="muted">Your password has been updated.</p>
          <a className="btn btn-primary" href="/">Log in</a>
        </div>
      </div>
    )
  }

  return (
    <div className="center">
      <form className="card login-card" onSubmit={(e) => { void handleSubmit(e) }}>
        <span className="eyebrow">campvus</span>
        <h1>Set a new password</h1>
        <label>
          New password
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
        <label>
          Confirm password
          <input type={showPassword ? 'text' : 'password'} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </label>
        {error && <p className="error"><WarningCircle /> {error}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Please wait…' : 'Reset password'}
        </button>
      </form>
    </div>
  )
}
