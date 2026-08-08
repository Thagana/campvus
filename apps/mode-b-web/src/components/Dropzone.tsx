import { useState, DragEvent, ReactNode } from 'react'

export function Dropzone ({ onFile, children }: { onFile: (file: File) => void, children: ReactNode }) {
  const [active, setActive] = useState(false)

  function handleDragOver (e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setActive(true)
  }

  function handleDragLeave (): void {
    setActive(false)
  }

  function handleDrop (e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      className={active ? 'dropzone dropzone-active' : 'dropzone'}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
    </div>
  )
}
