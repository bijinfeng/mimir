import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBootInfo, DesktopModeResult, DesktopModeState } from '@mimir/shared/desktop'

/**
 * 沙箱化 preload：只暴露宿主↔载体的握手契约
 * （packages/shared/src/desktop.ts）——boot 信息、模式选择、窗口控制、退出。
 *
 * ## 边界
 *
 * 页面拿不到 BrowserWindow、路径、句柄这些它不该碰的东西。preload 只装在
 * 本地页与选择页；云端远端页面不装它（D-107）。「模式」仍只是动作请求，
 * **能不能改由主进程判断**；preload 不做这个判断——它是渲染进程里的代码。
 */
contextBridge.exposeInMainWorld('mimirDesktop', {
  boot: (): Promise<DesktopBootInfo | null> => ipcRenderer.invoke('mimir:boot-info'),
  quit: (): void => {
    ipcRenderer.send('mimir:quit')
  },

  /**
   * 使用方式（D-100）：本地离线 / 云端。
   *
   * `get()` 在首次启动（还没选过）时返回 null；
   * `choose()` 只负责校验与持久化（本地模式还会把宿主起好），**不导航**；
   * `activate()` 才让窗口切过去（单向通知，调用它的页面会被替换）。
   */
  mode: {
    get: (): Promise<DesktopModeState | null> => ipcRenderer.invoke('mimir:mode-get'),
    choose: (choice: DesktopModeState): Promise<DesktopModeResult> =>
      ipcRenderer.invoke('mimir:mode-choose', choice),
    activate: (): void => {
      ipcRenderer.send('mimir:mode-activate')
    },
    openSetup: (): void => {
      ipcRenderer.send('mimir:mode-open-setup')
    },
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
