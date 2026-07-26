// Typed client for @campvus/mode-b-api. Same-origin in both dev (via
// Vite's proxy) and prod (served by mode-b-api itself), so no CORS/token
// handling is needed — the browser just carries the session cookie.

export interface User {
  id: string
  email: string
}

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

class ApiError extends Error {}

async function request<T> (path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || `request failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function register (email: string, password: string): Promise<User> {
  return request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function login (email: string, password: string): Promise<User> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export async function logout (): Promise<void> {
  await request('/auth/logout', { method: 'POST' })
}

export async function me (): Promise<User | null> {
  const res = await fetch('/auth/me', { credentials: 'same-origin' })
  if (res.status === 401) return null
  if (!res.ok) throw new ApiError(`request failed with status ${res.status}`)
  return res.json() as Promise<User>
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
    throw new ApiError(body.error || `upload failed with status ${res.status}`)
  }
  return res.json() as Promise<UploadResult>
}
