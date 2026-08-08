import { useEffect, ReactNode, MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'

// No full focus trap — first field inside gets autoFocus from its own
// page, which is an acceptable scope limit for an app this size rather
// than a silently-dropped requirement.
export function Modal (
  { open, onClose, title, children }: { open: boolean, onClose: () => void, title: string, children: ReactNode }
) {
  useEffect(() => {
    if (!open) return
    function onKeyDown (e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  function stopPropagation (e: MouseEvent): void {
    e.stopPropagation()
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={stopPropagation}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}
