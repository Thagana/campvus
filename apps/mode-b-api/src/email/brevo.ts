// Sends transactional email via Brevo's REST API
// (https://developers.brevo.com/docs/getting-started) — used for
// better-auth's register-verification and forgot-password emails (see
// auth.ts). Without BREVO_API_KEY set, falls back to logging the email
// instead of sending it, same "no operator setup step" reasoning as
// ensureAuthSecret (paths.ts): a fresh checkout can still sign up and
// reset passwords locally before a real provider is wired up.

const BREVO_SEND_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
}

export async function sendEmail (input: SendEmailInput): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.log(`[email] BREVO_API_KEY not set — logging instead of sending "${input.subject}" to ${input.to}:`)
    console.log(`  ${input.html}`)
    return
  }

  const res = await fetch(BREVO_SEND_EMAIL_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_FROM_EMAIL || 'no-reply@localhost',
        name: process.env.BREVO_FROM_NAME || 'Campvus'
      },
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html
    })
  })

  if (!res.ok) {
    throw new Error(`Brevo send failed (${res.status}): ${await res.text()}`)
  }

  if (process.env.BREVO_LOG_SUCCESS) {
    console.log(`[email] sent "${input.subject}" to ${input.to} via Brevo`)
  }
}
