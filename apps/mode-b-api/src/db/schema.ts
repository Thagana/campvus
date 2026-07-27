// Mode B's own data model — course rosters, plus better-auth's own
// identity tables (user/session/account/verification). Course rosters are
// genuinely new surface area Mode A never needed (it borrows enrollment
// from the LMS); see architecture doc §3.2 and open question #6.
//
// Domain timestamps (courses/enrollments) are stored as raw epoch-ms
// integers (not Drizzle's `{ mode: 'timestamp' }` column mode) to keep the
// custom sqlite-proxy driver (see ./client.ts) simple. The better-auth
// tables below DO use `{ mode: 'timestamp_ms' }`/`{ mode: 'boolean' }`
// because better-auth's drizzle adapter reads/writes those columns as JS
// `Date`/`boolean` values — Drizzle itself (not the proxy driver) handles
// that (de)serialization, so it works fine underneath the sqlite-proxy.

import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

// better-auth's core schema (https://better-auth.com/docs/concepts/database).
// Hand-written to match it exactly, rather than generated via `npx auth
// generate`, since that CLI expects to import a live db connection and
// this project's db is a custom node:sqlite/sqlite-proxy driver, not one
// of the CLI's supported drivers.
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
})

// better-auth's `organization` plugin schema (ADR-0005) — a School is one
// row here. Hand-written to match the plugin's field list exactly, same
// reasoning as the core tables above.
export const organization = sqliteTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  metadata: text('metadata')
})

export const member = sqliteTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  userId: text('user_id').notNull().references(() => user.id),
  role: text('role').notNull(), // 'owner' | 'teacher' | 'student'
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export const invitation = sqliteTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  email: text('email').notNull(),
  role: text('role'), // 'owner' | 'teacher' | 'student'
  status: text('status').notNull(), // 'pending' | 'accepted' | 'rejected' | 'canceled'
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  // Nullable unlike better-auth's own (required) field definition: the
  // school-creation script inserts a School's founding Owner invitation
  // directly (bypassing the invite-member endpoint, which needs an
  // authenticated inviter that doesn't exist yet), and better-auth's own
  // accept-invitation handler never reads inviterId, so leaving it null
  // for that one row is safe.
  inviterId: text('inviter_id').references(() => user.id)
})

// courseId matches the engine's courseId convention (e.g. "COMSCI214") —
// the same string that ends up in signed manifests, not an opaque id.
// schoolId is always inferred server-side from the creating Teacher's own
// School membership (ADR-0005) — never client-supplied.
export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => organization.id),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull()
})

// Only Students get a row here now (ADR-0005) — a Teacher's access to
// every Course in their School comes from their School membership alone,
// not from a per-course row. `role` is always 'student' going forward;
// kept rather than dropped since removing it is a later cleanup, not
// required by this pass.
export const enrollments = sqliteTable('enrollments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  courseId: text('course_id').notNull().references(() => courses.id),
  role: text('role').notNull(), // 'student'
  createdAt: integer('created_at').notNull()
}, (t) => ({
  userCourseUnique: uniqueIndex('enrollments_user_course_unique').on(t.userId, t.courseId)
}))
