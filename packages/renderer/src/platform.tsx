import type { MimirDesktopBridge } from '@mimir/shared/desktop'
import { createContext, type ReactNode, useContext } from 'react'

/**
 * 平台契约：桌面载体与浏览器部署的差异（D-103 / D-104）。
 *
 * ## 判别联合，不是「一堆可选字段」
 *
 * 平台**只有两种**，而每一种各自的能力是确定的——桌面端一定有桥与标题栏，
 * 浏览器端一定都没有。写成可选字段（`bridge?: …`）的代价很具体：消费端被
 * 类型逼着写 `bridge?.mode.openSetup()`，而那条可选链永远不会走空分支，
 * 下一个读的人无法判断它是死代码还是有用分支。
 *
 * 这与 `packages/shared/src/desktop.ts` 的 `DesktopModeState` 是同一条推论：
 * 把不变量写进类型里，消费端就不需要防御分支。
 *
 * ## 为什么走 Context 而不是模块级单例
 *
 * 上一版是 `setPlatformSlots()` / `getPlatformSlots()` 一对模块级函数。
 * 它有三个代价，都是实测的：
 *
 *  1. **顺序依赖隐式**：必须在挂载前调用 setter，忘了的话报错发生在首帧
 *     render 里，被路由的 error boundary 吞成一张「出错了」卡片——指不回入口
 *  2. **测试要绕一圈**：同一文件里第二次调 setter 直接抛，于是换桩必须
 *     `vi.resetModules()` + 动态 import，**且消费组件也得一起重导入**
 *     （它的闭包持有自己那份模块）。成本高到那 6 个消费点一个测试都没有
 *  3. **Fast Refresh 会二次执行模块体**：一个既导出组件、又在模块作用域调
 *     一次性 setter 的文件被热接受时（实测 Vite 发 `js-update` 而非
 *     `full-reload`），setter 第二次调用抛 `already configured`——表现是
 *     「改一行后整页白屏，刷新就好」
 *
 * Context 把平台变成一个**参数**：`createApp(root, platform)`，顺序由签名
 * 保证，测试直接传值，没有一次性 setter 可供二次执行。
 */
export type Platform =
  | { kind: 'browser' }
  | {
      kind: 'desktop'
      /**
       * 桌面桥（`window.mimirDesktop`）。**必有**——它由 preload 在首帧之前
       * 注入，而桌面入口不注入它就根本组装不出这个值。
       */
      bridge: MimirDesktopBridge
      /**
       * 自绘标题栏（D-094）。**必有**——桌面壳是 `frame: false`，没有它
       * 用户连窗口都拖不动、关不掉。
       *
       * **必须传模块级函数**：写成内联箭头会让
       * `react(no-unstable-nested-components)` 判它是「渲染期定义组件」，
       * React Compiler 随即跳过宿主组件（根 `AGENTS.md` 铁律 1 的静默退化）。
       */
      renderTitleBar: (props: TitleBarSlotProps) => ReactNode
    }

/** 标题栏要用的三项。缺省由调用点决定，见 `renderTitleBar` 的实现方 */
export interface TitleBarSlotProps {
  /** 侧栏折叠状态 */
  collapsed: boolean
  /** 折叠切换回调 */
  onToggleCollapsed: () => void
  /** 窄屏下不显示切换按钮（视口强制折叠时点了也不会展开） */
  showToggle: boolean
}

const PlatformContext = createContext<Platform | null>(null)

export function PlatformProvider({
  platform,
  children,
}: {
  platform: Platform
  children: ReactNode
}) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>
}

/**
 * 当前平台。
 *
 * @throws 没有 Provider 时抛——那意味着平台入口没有走 `createApp()`，
 * 是组装错误而不是运行时状态，应当响亮地失败。
 */
export function usePlatform(): Platform {
  const platform = useContext(PlatformContext)
  if (platform === null) {
    throw new Error('缺少 PlatformProvider：平台入口要用 createApp(root, platform) 挂载')
  }
  return platform
}

/**
 * 这个窗口是不是由我们的 Electron 载体打开的。
 *
 * 用它决定「侧栏要不要画自己的顶栏」：桌面端那条已经并进窗口标题栏（D-094），
 * 两条并排是重复。
 */
export function useIsDesktop(): boolean {
  return usePlatform().kind === 'desktop'
}

/**
 * 桌面桥，浏览器里是 undefined。
 *
 * 渲染层只在两处用到它，而且都是同一个动作——「把窗口带回选择页」
 * （连不上服务端的兜底页、设置 › 客户端）。那是唯一一个不依赖远端可用性
 * 的入口（D-100）。
 */
export function useDesktopBridge(): MimirDesktopBridge | undefined {
  const platform = usePlatform()
  return platform.kind === 'desktop' ? platform.bridge : undefined
}

/** 标题栏。浏览器里返回 null（浏览器有自己的标签栏，自绘是重复） */
export function useTitleBar(props: TitleBarSlotProps): ReactNode {
  const platform = usePlatform()
  return platform.kind === 'desktop' ? platform.renderTitleBar(props) : null
}
