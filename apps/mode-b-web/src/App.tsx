import { useCallback, useEffect, useState } from 'react'
import { me, logout, User } from './api'
import LoginPage from './pages/LoginPage'
import CoursesPage from './pages/CoursesPage'
import CourseDetailPage from './pages/CourseDetailPage'

type View = { name: 'courses' } | { name: 'course', courseId: string }

export default function App () {
  const [user, setUser] = useState<User | null | 'loading'>('loading')
  const [view, setView] = useState<View>({ name: 'courses' })

  useEffect(() => {
    me().then(setUser).catch(() => setUser(null))
  }, [])

  const handleLogout = useCallback(() => {
    logout().then(() => {
      setUser(null)
      setView({ name: 'courses' })
    }).catch(() => {})
  }, [])

  if (user === 'loading') {
    return <div className="center">Loading…</div>
  }

  if (!user) {
    return <LoginPage onAuthenticated={setUser} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>campvus</strong>
        <span>teacher portal</span>
        <span className="spacer" />
        <span>{user.email}</span>
        <button className="secondary" onClick={handleLogout}>Log out</button>
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
