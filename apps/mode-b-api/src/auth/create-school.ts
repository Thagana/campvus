import crypto from 'crypto'
import { Db } from '../db/client'
import { invitation, organization } from '../db/schema'

const INVITATION_EXPIRES_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

export interface CreateSchoolInput {
  name: string
  founderEmail: string
  slug?: string
}

export interface CreateSchoolResult {
  organizationId: string
  invitationId: string
}

function slugify (name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '')
}

// The only way a School comes into existence (ADR-0005) — no self-serve path
// (see allowUserToCreateOrganization: false in auth.ts). Called from
// routes/admin.ts (platform-admin only, see auth/platform-admin.ts), never
// directly reachable by a regular account. Inserts the Organization and its
// founding Owner Invitation directly via Drizzle rather than better-auth's
// own create-organization/invite-member endpoints, which require an
// authenticated inviter that doesn't exist yet for a brand-new School. The
// founding Teacher completes onboarding through the ordinary
// sign-up-then-accept-invitation flow like any other invitee — routes/admin.ts
// sends them the same invitation email a regular invite-member call would.
//
// inviterId is left null (see schema.ts) since there's no real inviter yet.
// One consequence: better-auth's GET /organization/get-invitation (look up
// one invitation by id) dereferences inviterId to a member row and 400s
// when it can't resolve one — that endpoint doesn't work for this specific
// invitation. This is fine: invite acceptance in this app is purely
// link-based (the emailed accept-invite URL already carries the
// invitationId), so no code path ever needs to look an invitation up by id
// server-side outside of accept-invitation itself. GET
// /organization/list-user-invitations is deliberately left unused for the
// same reason — it hard-requires session.user.emailVerified, which this app
// never gates anything else on, and the direct-link flow doesn't need it.
export async function createSchool (db: Db, input: CreateSchoolInput): Promise<CreateSchoolResult> {
  const organizationId = crypto.randomUUID()
  const invitationId = crypto.randomUUID()
  const now = new Date()

  await db.insert(organization).values({
    id: organizationId,
    name: input.name,
    slug: input.slug ?? slugify(input.name),
    createdAt: now
  })

  await db.insert(invitation).values({
    id: invitationId,
    organizationId,
    email: input.founderEmail.toLowerCase(),
    role: 'owner',
    status: 'pending',
    expiresAt: new Date(now.getTime() + INVITATION_EXPIRES_MS),
    createdAt: now
  })

  return { organizationId, invitationId }
}
