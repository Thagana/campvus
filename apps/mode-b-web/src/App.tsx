import { useCallback, useState } from 'react'
import { authClient } from './auth-client'
import LoginPage from './pages/LoginPage'
import CoursesPage from './pages/CoursesPage'
import CourseDetailPage from './pages/CourseDetailPage'

type View = { name: 'courses' } | { name: 'course', courseId: string }

export default function App () {
  const { data: session, isPending } = authClient.useSession()
  const [view, setView] = useState<View>({ name: 'courses' })

  const handleLogout = useCallback(() => {
    authClient.signOut().then(() => {
      setView({ name: 'courses' })
    }).catch(() => {})
  }, [])

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
      </main>
    </div>
  )
}
