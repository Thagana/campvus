import { useState } from 'react'
import { Copy, Check } from '@phosphor-icons/react'

export function CopyButton ({ value, label }: { value: string, label: string }) {
  const [copied, setCopied] = useState(false)

  async function handleClick (): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable or permission denied — button stays
      // usable, nothing else to show for a copy action.
    }
  }

  return (
    <button type="button" className="icon-btn" aria-label={label} onClick={() => { void handleClick() }}>
      {copied ? <Check /> : <Copy />}
    </button>
  )
}
