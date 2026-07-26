// Password hashing via @node-rs/argon2 — ships a prebuilt N-API binary per
// platform, unlike the `argon2` package (native compile, fails here without
// Visual Studio build tools — same reason better-sqlite3 was dropped for
// node:sqlite).

import { hash, verify } from '@node-rs/argon2'

export async function hashPassword (password: string): Promise<string> {
  return hash(password)
}

export async function verifyPassword (passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password)
}
