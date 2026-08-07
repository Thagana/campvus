// The one invitation email, sent from both places an invitation is created:
// better-auth's organization plugin (auth.ts's sendInvitationEmail hook, for
// a Teacher inviting a Teacher/Student) and routes/admin.ts (for the
// founding Owner invitation a platform admin creates via createSchool,
// which bypasses the plugin's own invite-member endpoint entirely). Kept as
// one shared function so both paths render identically rather than drifting.

import { sendEmail } from './brevo'
import { WEB_URL } from '../config'

export interface InvitationEmailInput {
  to: string
  schoolName: string
  role: string
  invitationId: string
}

export async function sendInvitationEmail (input: InvitationEmailInput): Promise<void> {
  const url = `${WEB_URL}/accept-invite?id=${input.invitationId}`
  await sendEmail({
    to: input.to,
    subject: `You've been invited to join ${input.schoolName} on Campvus`,
    html: `<p>You've been invited to join <strong>${input.schoolName}</strong> as ${input.role === 'owner' ? 'its founding Owner' : `a ${input.role}`} on Campvus.</p><p><a href="${url}">${url}</a></p>`
  })
}
