import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBootInfo } from '@mimir/shared'

/**
 * 沙箱化 preload：只暴露两件只读能力，都是宿主↔载体握手契约
 * （packages/shared/src/desktop.ts）。页面目前不依赖它们——
 * 窗口加载的是宿主自己的地址；这两个口是给「关于」面板与将来
 * 跨源载体预留的最小边界。
 */
contextBridge.exposeInMainWorld('mimirDesktop', {
  boot: (): Promise<DesktopBootInfo | null> => ipcRenderer.invoke('mimir:boot-info'),
  quit: (): void => {
    ipcRenderer.send('mimir:quit')
  },
})
