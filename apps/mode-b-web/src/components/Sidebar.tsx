import { House, ShieldCheck, SignOut } from '@phosphor-icons/react'
import { Link, useRoute } from '../router'

export function Sidebar ({ userEmail, onLogout }: { userEmail: string, onLogout: () => void }) {
  const route = useRoute()
  const onCourses = route.name === 'courses' || route.name === 'course'
  const onAdmin = route.name === 'admin' || route.name === 'admin-school'

  return (
    <nav className="sidebar-nav" aria-label="Primary">
      <div className="sidebar-nav__brand">
        <strong>campvus</strong>
        <span className="eyebrow">Teacher portal</span>
      </div>
      <div className="sidebar-nav__section">
        <Link to="/" className="sidebar-nav__link" aria-current={onCourses ? 'page' : undefined}>
          <House /> Courses
        </Link>
        <Link to="/platform-admin" className="sidebar-nav__link" aria-current={onAdmin ? 'page' : undefined}>
          <ShieldCheck /> Admin
        </Link>
      </div>
      <div className="sidebar-nav__footer">
        <span className="muted">{userEmail}</span>
        <button type="button" className="btn btn-secondary" onClick={onLogout}>
          <SignOut /> Log out
        </button>
      </div>
    </nav>
  )
}
