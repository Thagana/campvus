import { ReactNode } from 'react'

export function EmptyState (
  { icon, title, message, action }: { icon: ReactNode, title: string, message?: string, action?: ReactNode }
) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <h3>{title}</h3>
      {message && <p className="muted">{message}</p>}
      {action}
    </div>
  )
}
