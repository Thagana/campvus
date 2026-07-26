export interface WindowHandle {
  show (): void
}

export type WindowFactory = () => WindowHandle

export interface WindowController {
  handleTrayClick (): void
}

export function createWindowController (createWindow: WindowFactory): WindowController {
  let window: WindowHandle | undefined

  return {
    handleTrayClick: () => {
      if (!window) window = createWindow()
      window.show()
    }
  }
}
