import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react'
import { CheckCircle, X } from '@phosphor-icons/react'

interface ToastItem {
  id: number
  message: string
}

interface ToastContextValue {
  showSuccess: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 4000

// Success-only — errors stay inline on whichever form failed (see
// useAsyncForm.ts) rather than being toasted, so a failure is never
// missable just because the user scrolled away from the toast region.
export function ToastProvider ({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const showSuccess = useCallback((message: string) => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, message }])
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showSuccess }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast toast-success">
            <CheckCircle weight="fill" />
            <span>{t.message}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast (): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
