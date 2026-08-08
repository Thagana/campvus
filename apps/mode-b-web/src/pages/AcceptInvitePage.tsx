import { useState, FormEvent } from 'react'
import { authClient } from '../auth-client'
import { acceptInvitation } from '../api'

// Reached via the link an invitation email sends (auth/auth.ts /
// email/invitation-email.ts): ${WEB_URL}/accept-invite?id=<invitationId>.
// Handles both cases in one page — no account yet (sign up/log in inline,
// same as LoginPage) and already signed in (just needs the accept click).
// Registering no longer grants a session immediately (auth.ts's
// requireEmailVerification) — signUp.email is called with callbackURL set
// back to this same page, so clicking the emailed verify link (which
// auto-signs-in) redirects the browser right back here, now with a session,
// and useSession() picks it up on that fresh page load.
export default function AcceptInvitePage ({ invitationId }: { invitationId: string }) {
  const { data: session, isPending } = authClient.useSession()
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [acceptState, setAcceptState] = useState<'idle' | 'accepting' | 'accepted' | 'error'>('idle')
  const [acceptError, setAcceptError] = useState<string | null>(null)

  async function handleAuthSubmit (e: FormEvent): Promise<void> {
    e.preventDefault()
    setAuthError(null)
    setAuthSubmitting(true)
    try {
      if (mode === 'login') {
        const { error } = await authClient.signIn.email({ email, password })
        if (error) throw new Error(error.message)
      } else {
        const callbackURL = `/accept-invite?id=${encodeURIComponent(invitationId)}`
        const { data, error } = await authClient.signUp.email({ email, password, name: email, callbackURL })
        if (error) throw new Error(error.message)
        if (!data?.token) setAwaitingVerification(true)
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handleAccept (): Promise<void> {
    setAcceptState('accepting')
    setAcceptError(null)
    try {
      await acceptInvitation(invitationId)
      setAcceptState('accepted')
    } catch (err) {
      setAcceptState('error')
      setAcceptError(err instanceof Error ? err.message : 'something went wrong')
    }
  }

  if (isPending) {
    return <div className="center">Loading…</div>
  }

  if (acceptState === 'accepted') {
    return (
      <div className="center">
        <div className="card login-card">
          <span className="eyebrow">campvus</span>
          <h1>You're in</h1>
          <p className="muted">Your invitation has been accepted.</p>
          <a className="btn btn-primary" href="/">Go to campvus</a>
        </div>
      </div>
    )
  }

  if (awaitingVerification) {
    return (
      <div className="center">
        <div className="card login-card">
          <span className="eyebrow">campvus</span>
          <h1>Check your email</h1>
          <p className="muted">We sent a verification link to {email}. Click it to finish creating your account and come back here to accept your invitation.</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="center">
        <form className="card login-card" onSubmit={(e) => { void handleAuthSubmit(e) }}>
          <span className="eyebrow">campvus</span>
          <h1>You've been invited</h1>
          <p className="muted">{mode === 'login' ? 'Log in to accept your invitation.' : 'Create an account to accept your invitation.'}</p>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {authError && <p className="error">{authError}</p>}
          <button type="submit" className="btn btn-primary" disabled={authSubmitting}>
            {authSubmitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="center">
      <div className="card login-card">
        <span className="eyebrow">campvus</span>
        <h1>Accept your invitation</h1>
        <p className="muted">Signed in as {session.user.email}.</p>
        {acceptError && <p className="error">{acceptError}</p>}
        <button className="btn btn-primary" onClick={() => { void handleAccept() }} disabled={acceptState === 'accepting'}>
          {acceptState === 'accepting' ? 'Accepting…' : 'Accept invitation'}
        </button>
      </div>
    </div>
  )
}
