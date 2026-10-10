import type { MimirDesktopBridge } from '@mimir/shared/desktop'

/**
 * 桌面桥（`window.mimirDesktop`）的取值（D-103）。
 *
 * ## 为什么这里还需要一层
 *
 * `packages/shared/src/desktop.ts` 里是**契约**（宿主与载体之间的形状），
 * 这里多出来的只有一件事：**它可能不存在**。preload 失效过一次（相对路径
 * 写法让它静默不执行，见 `.trellis/spec/desktop/runtime/pitfalls.md` 的坑表），所以消费端不能假设它一定在。
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
 * 这里就要换成订阅式的读取——那时记得同步改标题栏的最大化订阅。
 */
declare global {
  interface Window {
    /** preload 注入。**理论上桌面端一定有**，但见上面「可能不存在」那一段 */
    mimirDesktop?: MimirDesktopBridge
  }
}

export const desktopBridge: MimirDesktopBridge | undefined =
  typeof window === 'undefined' ? undefined : window.mimirDesktop
