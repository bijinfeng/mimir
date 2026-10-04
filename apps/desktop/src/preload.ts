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

  /**
   * 窗口控制（D-094）。自绘标题栏用。
   *
   * 暴露的是**动作与只读状态**，不是 BrowserWindow 本身：页面拿不到窗口
   * 对象，只能请求三件事，也拿不到路径 / 句柄这些它不该碰的东西
   * （与 `boot` / `quit` 同一条最小穿越边界的规矩）。
   *
   * `isMaximized` 是异步的（IPC 往返），其余是单向通知——最大化状态要读
   * 权威值，不能靠页面自己翻一个布尔值。
   */
  window: {
    platform: process.platform,
    minimize: (): void => {
      ipcRenderer.send('mimir:window', 'minimize')
    },
    toggleMaximize: (): void => {
      ipcRenderer.send('mimir:window', 'toggle-maximize')
    },
    close: (): void => {
      ipcRenderer.send('mimir:window', 'close')
    },
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('mimir:window-maximized'),
    onMaximizeChange: (listener: (maximized: boolean) => void): (() => void) => {
      const handler = (_event: unknown, maximized: boolean): void => listener(maximized)
      ipcRenderer.on('mimir:window-maximized-changed', handler)
      return () => {
        ipcRenderer.off('mimir:window-maximized-changed', handler)
      }
    },
  },
})
