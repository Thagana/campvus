// Mode B's own data model — course rosters, plus better-auth's own
// identity tables (user/session/account/verification). Course rosters are
// genuinely new surface area Mode A never needed (it borrows enrollment
// from the LMS); see architecture doc §3.2 and open question #6.
//
// Domain timestamps (courses/enrollments) are stored as raw epoch-ms
// integers (`bigint` — Postgres `integer` is only 32-bit and overflows an
// epoch-ms value) rather than Drizzle's `timestamp` column mode, matching
// the values `Date.now()` produces at the call sites (routes/courses.ts).
// The better-auth tables below DO use `timestamp({ mode: 'date' })` because
// better-auth's drizzle adapter reads/writes those columns as JS `Date`
// values.

import { pgTable, text, boolean, timestamp, bigint, uniqueIndex } from 'drizzle-orm/pg-core'

// better-auth's core schema (https://better-auth.com/docs/concepts/database).
// Hand-written to match it exactly, rather than generated via `npx auth
// generate`, since that CLI expects to import a live db connection and
// this project's db is a custom node:sqlite/sqlite-proxy driver, not one
// of the CLI's supported drivers.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull()
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull()
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date' }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date' }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull()
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }),
  updatedAt: timestamp('updated_at', { mode: 'date' })
})

// better-auth's `organization` plugin schema (ADR-0005) — a School is one
// row here. Hand-written to match the plugin's field list exactly, same
// reasoning as the core tables above.
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  metadata: text('metadata')
})

export const member = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  userId: text('user_id').notNull().references(() => user.id),
  role: text('role').notNull(), // 'owner' | 'teacher' | 'student'
  createdAt: timestamp('created_at', { mode: 'date' }).notNull()
})

export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id),
  email: text('email').notNull(),
  role: text('role'), // 'owner' | 'teacher' | 'student'
  status: text('status').notNull(), // 'pending' | 'accepted' | 'rejected' | 'canceled'
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
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
export const courses = pgTable('courses', {
  id: text('id').primaryKey(),
  schoolId: text('school_id').notNull().references(() => organization.id),
  name: text('name').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull()
})

// Only Students get a row here (ADR-0005) — a Teacher's access to every
// Course in their School comes from their School membership alone, not
// from a per-course row. A row's mere existence means Student, so there's
// no role column to carry.
export const enrollments = pgTable('enrollments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  courseId: text('course_id').notNull().references(() => courses.id),
  createdAt: bigint('created_at', { mode: 'number' }).notNull()
}, (t) => ({
  userCourseUnique: uniqueIndex('enrollments_user_course_unique').on(t.userId, t.courseId)
}))
