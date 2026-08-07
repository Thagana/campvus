// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

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
  saveConfig: (config) => ipcRenderer.invoke('campvus:save-config', config)
}

contextBridge.exposeInMainWorld('campvus', api)
