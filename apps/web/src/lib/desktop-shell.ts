import type { DesktopBootInfo, DesktopWindowApi, DesktopModeApi } from '@mimir/shared/desktop'

/**
 * 桌面端桥（`window.mimirDesktop`）的类型与取值。
 *
 * ## 为什么放在 web 侧而不是 shared
 *
 * `shared` 里是**契约**（宿主与载体之间的约定，两边都要遵守的形状），
 * 这里多出来的只有一件事：**它在浏览器里不存在**。页面代码要处理
 * 「这个全局可能没有」，而那是 web 侧的知识——宿主不需要知道
 * 「浏览器里没有 preload」。
 *
 * ## 为什么是模块级常量而不是 hook
 *
 * preload 脚本在页面任何脚本**之前**执行（Electron 保证），所以
 * `window.mimirDesktop` 在第一帧渲染前就已经确定。写成 hook 需要
 * `useState` + `useEffect` 两趟渲染，而那个 effect 永远不会改变结果——
 * 白白多一帧「先按浏览器渲染、再切成桌面端」的抖动（标题栏会先不显示、
 * 再出现）。读一个常量没有这个问题。
 *
 * 反过来，如果哪天桥变成**后注入**的（比如远程地址模式下的异步握手），
 * 这里就要换成订阅式的读取——那时记得同步改 `_app.tsx` 的布局依赖。
 */
export interface MimirDesktopBridge {
  boot: () => Promise<DesktopBootInfo | null>
  quit: () => void
  /** 使用方式的选择与切换（D-100）。开发模式下 `get()` 恒为 null */
  mode: DesktopModeApi
  window: DesktopWindowApi
}

declare global {
  interface Window {
    /** preload 注入。**Web 部署下是 undefined**（那是正常的，不是错误） */
    mimirDesktop?: MimirDesktopBridge
  }
}

export const desktopBridge: MimirDesktopBridge | undefined =
  typeof window === 'undefined' ? undefined : window.mimirDesktop

/**
 * 这个窗口是不是由我们的 Electron 载体打开的。
 *
 * 用它决定「要不要渲染自绘标题栏」：浏览器里渲染自己的标题栏只是在
 * 复刻标签栏，而且那三个按钮点了什么都不会发生。
 */
export function isDesktopShell(): boolean {
  return desktopBridge !== undefined
}
