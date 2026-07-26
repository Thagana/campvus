// This app's @campvus/engine runtime state (registry.json,
// institution-keys.json, content-store/) lives alongside its own code —
// same pattern as apps/mode-a-headless's paths.ts. Mode B additionally has
// its own SQLite data file (data/app.db) for accounts/course
// rosters/sessions, which isn't part of @campvus/engine's Paths at all —
// that's Mode B-specific state, not engine state.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { resolvePaths, Paths, generateAndSaveKeypair } from '@campvus/engine'

const APP_ROOT = path.join(__dirname, '..')

export function getPaths (): Paths {
  return resolvePaths(APP_ROOT)
}

export function getDbPath (): string {
  const dir = path.join(APP_ROOT, 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'app.db')
}

// Unlike Mode A (a manual `identity.ts generate` CLI step), a server
// shouldn't require an operator to run a setup command before it can boot.
// Auto-provision the institution keypair on first run and log the public
// key prominently — anyone verifying this deployment's manifests needs it.
//
// This is deliberately Mode B's own, separately-generated keypair, not
// shared with Mode A's — reconciling trust roots across modes is Open
// Question #2 (multi-institution model), not decided here.
export function ensureInstitutionKeypair (paths: Paths): void {
  if (fs.existsSync(paths.keyFile)) return
  const record = generateAndSaveKeypair(paths)
  console.log('No institution keypair found — generated a new one for Mode B.')
  console.log('Institution keypair written to', paths.keyFile)
  console.log('Public key (distribute this to student/teacher clients):')
  console.log(record.publicKey)
}

function getAuthSecretPath (): string {
  const dir = path.join(APP_ROOT, 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'auth-secret.key')
}

// better-auth signs session tokens with this secret; without one it falls
// back to a hardcoded default that's public in its source, which would let
// anyone forge sessions. Same "no operator setup step" reasoning as
// ensureInstitutionKeypair above — generate and persist one on first run
// rather than requiring a BETTER_AUTH_SECRET env var to be set by hand.
// Still honors that env var if set, for deployments that want to manage
// their own secret.
export function ensureAuthSecret (): string {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET

  const secretPath = getAuthSecretPath()
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8').trim()

  const secret = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(secretPath, secret, { mode: 0o600 })
  return secret
}
