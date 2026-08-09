// Typed client for @campvus/mode-b-api's course/manifest endpoints.
// Same-origin in both dev (via Vite's proxy) and prod (served by
// mode-b-api itself), so no CORS/token handling is needed — the browser
// just carries the session cookie. Auth itself (sign-up/sign-in/sign-out/
// session) goes through better-auth's own client — see auth-client.ts.
//
// Grouped below by which backend module actually governs each call: our
// own routes (guards.ts), platform-admin's routes (platform-admin.ts), and
// better-auth's own organization plugin (roles.ts + organization-hooks.ts)
// — three different authorization stories behind one fetch wrapper.

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
  code?: string
  constructor (message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
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
    // Our own routes (guards.ts, routes/*.ts) respond with { error }.
    // better-auth's own routes (organization invite/accept/etc.) respond
    // with { message, code } instead (see APIError.from in
    // @better-auth/core) — without this fallback, every better-auth
    // failure surfaced as a generic "request failed with status 400"
    // instead of e.g. "User is already invited to this organization".
    const message = body.error || body.message || `request failed with status ${res.status}`
    throw new ApiError(message, res.status, body.code)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------
// Our own routes (apps/mode-b-api/src/routes/*.ts) — governed by
// auth/guards.ts's requireSchoolRole/requireCourseRole.
// ---------------------------------------------------------------------

export interface Course {
  id: string
  name: string
  role: 'teacher' | 'student'
}

export function listCourses (): Promise<Course[]> {
  return request('/courses')
}

export function createCourse (id: string, name: string): Promise<{ id: string, name: string }> {
  return request('/courses', { method: 'POST', body: JSON.stringify({ id, name }) })
}

// Enrollment only ever grants Student (ADR-0005) — granting Teacher goes
// through inviteToSchool below instead.
export function enrollStudent (
  courseId: string,
  email: string
): Promise<{ email: string, role: string }> {
  return request(`/courses/${encodeURIComponent(courseId)}/enrollments`, {
    method: 'POST',
    body: JSON.stringify({ email })
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

// The signed-in user's own School (routes/school.ts) — a person belongs to
// at most one (ADR-0005). Needed before inviteToSchool below, since
// better-auth's invite-member endpoint requires organizationId in its
// payload and nothing else on the client knows it.
export interface MySchool {
  organizationId: string
  name: string
  role: 'teacher' | 'owner' | 'student'
}

export function getMySchool (): Promise<MySchool> {
  return request('/school')
}

// ---------------------------------------------------------------------
// Platform-admin routes (apps/mode-b-api/src/routes/admin.ts) — governed
// by auth/platform-admin.ts's CAMPVUS_ADMIN_EMAILS allowlist, a separate
// axis from School membership entirely, not an organization role.
// ---------------------------------------------------------------------

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

// One combined view (routes/admin.ts's /admin/schools/:organizationId/roster)
// of everyone in a School plus every Course's enrolled Students — what the
// admin console's "who is in this School / who's enrolled in what" view
// needs, fetched in one call rather than one per Course.
export interface SchoolRosterMember {
  userId: string
  email: string
  role: string
}

export interface SchoolRosterCourse {
  id: string
  name: string
  students: string[]
}

export interface SchoolRoster {
  members: SchoolRosterMember[]
  courses: SchoolRosterCourse[]
}

export function getSchoolRoster (organizationId: string): Promise<SchoolRoster> {
  return request(`/admin/schools/${encodeURIComponent(organizationId)}/roster`)
}

// ---------------------------------------------------------------------
// better-auth's own organization plugin endpoints, called directly — no
// client-side plugin wired up for them (auth-client.ts), so they go
// through the same fetch wrapper as everything else here rather than
// adding that dependency for two calls. Governed by auth/roles.ts (the
// plugin's access-control roles) and auth/organization-hooks.ts (the
// ADR-0005 invariants better-auth has no config option for), not
// guards.ts.
// ---------------------------------------------------------------------

export function acceptInvitation (invitationId: string): Promise<{ member: { id: string, role: string } }> {
  return request('/api/auth/organization/accept-invitation', {
    method: 'POST',
    body: JSON.stringify({ invitationId })
  })
}

// Sends the invited person a real email with an /accept-invite link
// (email/invitation-email.ts). This is the step that was missing from the
// portal: CourseDetailPage's "Enroll someone" only adds a course-level
// enrollment row and requires School membership to already exist: this is
// what actually creates it.
export function inviteToSchool (
  organizationId: string,
  email: string,
  role: 'teacher' | 'student'
): Promise<{ id: string }> {
  return request('/api/auth/organization/invite-member', {
    method: 'POST',
    body: JSON.stringify({ email, role, organizationId })
  })
}
