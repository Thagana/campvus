// Typed client for @campvus/mode-b-api's course/manifest endpoints.
// Same-origin in both dev (via Vite's proxy) and prod (served by
// mode-b-api itself), so no CORS/token handling is needed — the browser
// just carries the session cookie. Auth itself (sign-up/sign-in/sign-out/
// session) goes through better-auth's own client — see auth-client.ts.

export interface Course {
  id: string
  name: string
  role: 'teacher' | 'student'
}

export interface SignedManifest {
  courseId: string
  filename: string
  hash: string
  size: number
  timestamp: number
  signature: string
}

export interface UploadResult {
  manifest: SignedManifest
  deduped: boolean
}

export class ApiError extends Error {
  status: number
  constructor (message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T> (path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || `request failed with status ${res.status}`, res.status)
  }
  return res.json() as Promise<T>
}

export function listCourses (): Promise<Course[]> {
  return request('/courses')
}

export function createCourse (id: string, name: string): Promise<{ id: string, name: string }> {
  return request('/courses', { method: 'POST', body: JSON.stringify({ id, name }) })
}

export function enrollUser (
  courseId: string,
  email: string,
  role: 'teacher' | 'student'
): Promise<{ email: string, role: string }> {
  return request(`/courses/${encodeURIComponent(courseId)}/enrollments`, {
    method: 'POST',
    body: JSON.stringify({ email, role })
  })
}

export function listManifests (courseId: string): Promise<SignedManifest[]> {
  return request(`/courses/${encodeURIComponent(courseId)}/manifests`)
}

export async function uploadManifest (courseId: string, file: File): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`/courses/${encodeURIComponent(courseId)}/manifests`, {
    method: 'POST',
    credentials: 'same-origin',
    body: formData
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || `upload failed with status ${res.status}`, res.status)
  }
  return res.json() as Promise<UploadResult>
}

// Platform-admin routes (apps/mode-b-api/src/routes/admin.ts) — a separate
// axis from School membership (auth/platform-admin.ts's CAMPVUS_ADMIN_EMAILS
// allowlist), not an organization role.
export interface School {
  id: string
  name: string
  slug: string
}

export function listSchools (): Promise<School[]> {
  return request('/admin/schools')
}

export function createSchool (name: string, founderEmail: string): Promise<{ organizationId: string, invitationId: string }> {
  return request('/admin/schools', { method: 'POST', body: JSON.stringify({ name, founderEmail }) })
}

// better-auth's own organization plugin endpoint — no client-side plugin
// wired up for it (auth-client.ts), so called through the same fetch
// wrapper as everything else here rather than adding that dependency for
// one call.
export function acceptInvitation (invitationId: string): Promise<{ member: { id: string, role: string } }> {
  return request('/api/auth/organization/accept-invitation', {
    method: 'POST',
    body: JSON.stringify({ invitationId })
  })
}
