import { useState, FormEvent } from 'react'

// Shared shape behind every mutating form on the portal (create course,
// invite, enroll, upload, create School): a controlled submit that clears
// any prior error, runs an async action, and surfaces the thrown error
// inline next to the form it failed on. On success, `action` is
// responsible for its own side effects (toast, clearing fields, closing a
// modal) — this hook no longer carries a success message, since a
// same-shaped inline message was too easy to miss (see Toast.tsx).
export interface AsyncFormState {
  submitting: boolean
  error: string | null
  handleSubmit: (e: FormEvent, action: () => Promise<void>) => Promise<void>
}

export function useAsyncForm (): AsyncFormState {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit (e: FormEvent, action: () => Promise<void>): Promise<void> {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return { submitting, error, handleSubmit }
}
