// Shared across auth.ts (invitation-email links, trustedOrigins) and
// routes/admin.ts (same invitation-email links) — kept in one place so the
// two can't drift to different origins.
export const WEB_URL = process.env.WEB_URL || 'http://localhost:5173'
