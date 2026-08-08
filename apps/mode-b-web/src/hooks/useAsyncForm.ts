import { useState, FormEvent } from 'react'

// Shared shape behind CoursesPage's invite form and CourseDetailPage's
// enroll form: a controlled submit that clears any prior message, runs an
// async action, and shows either the action's own success message or the
// thrown error — each page still owns its own input fields and clearing
// them on success (the two forms' fields differ).
export interface AsyncFormState {
  submitting: boolean
  message: string | null
  handleSubmit: (e: FormEvent, action: () => Promise<string>) => Promise<void>
}

export function useAsyncForm (): AsyncFormState {
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit (e: FormEvent, action: () => Promise<string>): Promise<void> {
    e.preventDefault()
    setMessage(null)
    setSubmitting(true)
    try {
      setMessage(await action())
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return { submitting, message, handleSubmit }
}
