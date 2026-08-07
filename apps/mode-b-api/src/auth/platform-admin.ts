// Platform admins can create Schools via the /admin/* routes (routes/admin.ts),
// replacing the old operator-only create-school.ts CLI script. Bootstrapped
// via an env-var allowlist rather than a DB flag/role — no seed step needed
// to get a fresh deploy's first admin working, same "no operator setup step"
// reasoning as ensureAuthSecret/ensureInstitutionKeypair (paths.ts).

function adminEmails (): Set<string> {
  return new Set(
    (process.env.CAMPVUS_ADMIN_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function isPlatformAdmin (email: string): boolean {
  return adminEmails().has(email.toLowerCase())
}
