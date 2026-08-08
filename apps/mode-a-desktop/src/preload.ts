// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

// Captures errors in the preload script's own execution context (this app
// never sets contextIsolation: false, so Electron's default true applies —
// the documented pattern for that mode). Takes no DSN — renderer/preload
// events relay to the main process over Sentry's own internal IPC channel,
// separate from the campvus contextBridge channel below.
import * as Sentry from '@sentry/electron/renderer'
Sentry.init()

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { AppState, CampvusApi } from './preload-api'

const api: CampvusApi = {
  getState: () => ipcRenderer.invoke('campvus:get-state'),
  onStateChange: (handler) => {
    const listener = (_event: IpcRendererEvent, state: AppState): void => handler(state)
    ipcRenderer.on('campvus:state-changed', listener)
    return () => ipcRenderer.removeListener('campvus:state-changed', listener)
  },
  getConfig: () => ipcRenderer.invoke('campvus:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('campvus:save-config', config),
  loginModeB: (args) => ipcRenderer.invoke('campvus:login-mode-b', args),
  getCourseFiles: () => ipcRenderer.invoke('campvus:get-course-files'),
  openCourseFile: (hash) => ipcRenderer.invoke('campvus:open-course-file', hash)
}

contextBridge.exposeInMainWorld('campvus', api)
