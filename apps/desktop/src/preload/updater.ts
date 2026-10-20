import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopUpdateState, MimirUpdaterBridge } from '@mimir/shared/desktop'

const bridge: MimirUpdaterBridge = {
  getState: () => ipcRenderer.invoke('mimir:updater-state'),
  check: () => ipcRenderer.invoke('mimir:updater-check'),
  download: () => ipcRenderer.invoke('mimir:updater-download'),
  install: (confirmed = false) => ipcRenderer.invoke('mimir:updater-install', confirmed),
  setAutoDownload: (enabled) => ipcRenderer.invoke('mimir:updater-auto-download', enabled),
  openRelease: () => ipcRenderer.invoke('mimir:updater-release'),
  returnToDocument: () => {
    ipcRenderer.send('mimir:updater-return')
  },
  close: () => {
    ipcRenderer.send('mimir:updater-close')
  },
  onState: (listener) => {
    const handler = (_event: unknown, state: DesktopUpdateState): void => listener(state)
    ipcRenderer.on('mimir:update-state', handler)
    return () => {
      ipcRenderer.off('mimir:update-state', handler)
    }
  },
}
contextBridge.exposeInMainWorld('mimirUpdater', bridge)
