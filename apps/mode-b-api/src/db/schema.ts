// Mode B's own data model — course rosters, accounts, sessions. This is
// genuinely new surface area Mode A never needed (it borrows enrollment
// from the LMS); see architecture doc §3.2 and open question #6.
//
// Timestamps are stored as raw epoch-ms integers (not Drizzle's
// `{ mode: 'timestamp' }` column mode) to keep the custom sqlite-proxy
// driver (see ./client.ts) simple — no driver-side date (de)serialization
// to get right.

import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull()
})

// courseId matches the engine's courseId convention (e.g. "COMSCI214") —
// the same string that ends up in signed manifests, not an opaque id.
export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull()
})

export const enrollments = sqliteTable('enrollments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  courseId: text('course_id').notNull().references(() => courses.id),
  role: text('role').notNull(), // 'teacher' | 'student'
  createdAt: integer('created_at').notNull()
}, (t) => ({
  userCourseUnique: uniqueIndex('enrollments_user_course_unique').on(t.userId, t.courseId)
}))

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull()
})
