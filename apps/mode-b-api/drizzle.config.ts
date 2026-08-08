import type { Config } from 'drizzle-kit'

// DATABASE_URL is only read here for `drizzle-kit generate`'s introspection
// needs (it doesn't actually touch a live DB for `generate`, just `push`/
// `studio`) — the app itself still opens its own connection in db/client.ts.
export default {
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/campvus'
  }
} satisfies Config
