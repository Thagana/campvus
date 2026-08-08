import { createContext, useCallback, useContext, useEffect, useState, AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'

export type Route =
  | { name: 'courses' }
  | { name: 'course', courseId: string }
  | { name: 'admin' }
  | { name: 'admin-school', schoolId: string }

export function coursePath (courseId: string): string {
  return `/course/${encodeURIComponent(courseId)}`
}

export function schoolRosterPath (schoolId: string): string {
  return `/platform-admin/schools/${encodeURIComponent(schoolId)}`
}

// Client paths deliberately avoid the API's own path prefixes (/courses,
// /school, /admin, /content, /public-key, /api/auth/, /healthz — see
// server.ts's SPA fallback) so a hard refresh or direct link never 404s:
// singular /course (the API owns plural /courses) and /platform-admin (the
// API owns /admin) — matching the "platform-admin" term auth/guards.ts
// already uses for this same concept.
function parseRoute (pathname: string): Route {
  const schoolMatch = pathname.match(/^\/platform-admin\/schools\/([^/]+)$/)
  if (schoolMatch) return { name: 'admin-school', schoolId: decodeURIComponent(schoolMatch[1]) }
  if (pathname === '/platform-admin') return { name: 'admin' }
  const courseMatch = pathname.match(/^\/course\/([^/]+)$/)
  if (courseMatch) return { name: 'course', courseId: decodeURIComponent(courseMatch[1]) }
  return { name: 'courses' }
}

interface RouterContextValue {
  route: Route
  navigate: (path: string) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

export function RouterProvider ({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))

  useEffect(() => {
    function onPopState (): void {
      setRoute(parseRoute(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((path: string) => {
    window.history.pushState(null, '', path)
    setRoute(parseRoute(path))
  }, [])

  return <RouterContext.Provider value={{ route, navigate }}>{children}</RouterContext.Provider>
}

function useRouterContext (): RouterContextValue {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRoute/useNavigate must be used within a RouterProvider')
  return ctx
}

export function useRoute (): Route {
  return useRouterContext().route
}

export function useNavigate (): (path: string) => void {
  return useRouterContext().navigate
}

// A plain <a href> that intercepts unmodified left-clicks into client-side
// navigation (so the sidebar/breadcrumb/table rows don't trigger a full
// page reload), but lets modifier- and middle-clicks fall through to
// normal browser behavior (open in new tab, etc).
export function Link ({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const navigate = useNavigate()

  function handleClick (e: MouseEvent<HTMLAnchorElement>): void {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }

  return <a href={to} onClick={handleClick} {...rest} />
}
