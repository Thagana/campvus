import { useCallback } from 'react'
import { authClient } from './auth-client'
import { RouterProvider, useRoute } from './router'
import { ToastProvider } from './components/Toast'
import { Sidebar } from './components/Sidebar'
import LoginPage from './pages/LoginPage'
import CoursesPage from './pages/CoursesPage'
import CourseDetailPage from './pages/CourseDetailPage'
import AdminPage from './pages/AdminPage'
import SchoolRosterPage from './pages/SchoolRosterPage'
import AcceptInvitePage from './pages/AcceptInvitePage'
import ResetPasswordPage from './pages/ResetPasswordPage'

// A fresh browser navigation to an emailed accept-invite/reset-password
// link (not a client-side transition — see server.ts's SPA fallback)
// reloads this module, so reading location once at module scope is enough
// — these two pages return before RouterProvider ever mounts, so they
// never interact with the client-side router below.
const invitationId = window.location.pathname === '/accept-invite'
  ? new URLSearchParams(window.location.search).get('id')
  : null

const resetPasswordToken = window.location.pathname === '/reset-password'
  ? new URLSearchParams(window.location.search).get('token')
  : null

export default function App () {
  const { data: session, isPending } = authClient.useSession()

  if (invitationId) {
    return <AcceptInvitePage invitationId={invitationId} />
  }

  if (resetPasswordToken) {
    return <ResetPasswordPage token={resetPasswordToken} />
  }

  if (isPending) {
    return <div className="center">Loading…</div>
  }

  if (!session) {
    return <LoginPage />
  }

  return (
    <RouterProvider>
      <ToastProvider>
        <AuthenticatedShell email={session.user.email} />
      </ToastProvider>
    </RouterProvider>
  )
}

function AuthenticatedShell ({ email }: { email: string }) {
  const route = useRoute()

  const handleLogout = useCallback(() => {
    authClient.signOut().catch(() => {})
  }, [])

  return (
    <div className="app-shell">
      <Sidebar userEmail={email} onLogout={handleLogout} />
      <main>
        {route.name === 'courses' && <CoursesPage />}
        {route.name === 'course' && <CourseDetailPage courseId={route.courseId} />}
        {route.name === 'admin' && <AdminPage />}
        {route.name === 'admin-school' && <SchoolRosterPage schoolId={route.schoolId} />}
      </main>
    </div>
  )
}
