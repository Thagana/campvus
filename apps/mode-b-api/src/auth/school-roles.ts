// Shared between organization-hooks.ts (enforcing these at the better-auth
// plugin boundary) and guards.ts (enforcing them at the route boundary).
export const GRANTABLE_ROLES = new Set(['teacher', 'student'])
export const STAFF_ROLES = ['teacher', 'owner']
