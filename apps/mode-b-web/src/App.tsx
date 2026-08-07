import { useCallback, useState } from 'react'
import { authClient } from './auth-client'
import LoginPage from './pages/LoginPage'
import CoursesPage from './pages/CoursesPage'
import CourseDetailPage from './pages/CourseDetailPage'
import AcceptInvitePage from './pages/AcceptInvitePage'
import AdminPage from './pages/AdminPage'

type View = { name: 'courses' } | { name: 'course', courseId: string } | { name: 'admin' }

// A fresh browser navigation to an emailed accept-invite link (not a
// client-side transition — see server.ts's SPA fallback) reloads this
// module, so reading location once at module scope is enough; this page
// never needs client-side routing beyond that one entry point.
const invitationId = window.location.pathname === '/accept-invite'
  ? new URLSearchParams(window.location.search).get('id')
  : null

export default function App () {
  const { data: session, isPending } = authClient.useSession()
  const [view, setView] = useState<View>({ name: 'courses' })

  const handleLogout = useCallback(() => {
    authClient.signOut().then(() => {
      setView({ name: 'courses' })
    }).catch(() => {})
  }, [])

  if (invitationId) {
    return <AcceptInvitePage invitationId={invitationId} />
  }

  if (isPending) {
    return <div className="center">Loading…</div>
  }

  if (!session) {
    return <LoginPage />
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">campvus</span>
        <span className="eyebrow">Teacher portal</span>
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={() => setView({ name: 'admin' })}>Admin</button>
        <span className="muted">{session.user.email}</span>
        <button className="btn btn-secondary" onClick={handleLogout}>Log out</button>
      </header>
      <main>
        {view.name === 'courses' && (
          <CoursesPage onOpenCourse={(courseId) => setView({ name: 'course', courseId })} />
        )}
        {view.name === 'course' && (
          <CourseDetailPage courseId={view.courseId} onBack={() => setView({ name: 'courses' })} />
        )}
        {view.name === 'admin' && (
          <AdminPage onBack={() => setView({ name: 'courses' })} />
        )}
      </main>
    </div>
  )
}
