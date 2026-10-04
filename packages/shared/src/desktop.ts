/**
 * 桌面端宿主 ↔ 载体的握手契约（D-046）。
 *
 * 主进程启动私有宿主后，通过 preload 把这份只读信息暴露给页面
 * （`window.mimirDesktop.boot()`）。页面目前不依赖它——窗口加载的就是
 * 宿主自己的地址，cookie 与相对路径天然同源；这份契约为将来的载体形态
 * （跨源认证宿主、CLI、扩展）与「关于」面板预留，是最小穿越边界。
 */

export interface DesktopBootInfo {
  /** 宿主源，如 `http://127.0.0.1:41234` */
  origin: string
  /** 数据根（macOS 在 `~/Library/Application Support/mimir/data`） */
  dataDir: string
  /** 应用版本（electron app.getVersion()） */
  version: string
}

/**
 * **窗口**的一面：自绘标题栏要用的那几件事（D-094）。
 *
 * 窗口现在是 `frame: false`（Windows / Linux）与 `titleBarStyle: 'hidden'`
 * （macOS），所以「最小化 / 最大化 / 关闭」这三个动作由页面里的按钮发出。
 * 这不是把窗口控制搬进业务代码——**页面并不知道窗口是什么**，它只知道
 * 「我有一排按钮，点了要让宿主做对应的事」。
 *
 * ## 为什么最大化状态是**读**来的而不是页面自己记
 *
 * 最大化可以由很多条路改变：按钮、双击标题栏、系统快捷键、拖到屏幕边缘
 * （Windows 的贴靠）。页面自己维护一个布尔值必然与真相脱节——症状是
 * 「最大化之后按钮图标还是『最大化』」。所以宿主是真相来源，页面订阅它。
 *
 * ## 浏览器里没有这个东西
 *
 * 这套能力只在 Electron 里存在（`window.mimirDesktop`）。Web 部署下
 * `window.mimirDesktop` 是 `undefined`，界面**不渲染标题栏**——浏览器
 * 自己有标签栏，自绘一条只是重复。
 */
/**
 * 宿主运行在哪个平台。
 *
 * **不写 `NodeJS.Platform`**：这个包是浏览器与服务端共用的契约，不含 Node
 * 的类型（`lib` 里没有 `@types/node`）——写了会让整个 shared 编译不过。
 * 用自有字面量联合也更准：这里只有三个取值是「有意义」的，别的都没分支。
 */
export type DesktopPlatform = 'darwin' | 'win32' | 'linux'

export interface DesktopWindowApi {
  /** 决定红绿灯还是自绘控件，以及标题栏内容怎么让位 */
  platform: DesktopPlatform
  minimize(): void
  /** 最大化 ↔ 还原。**由宿主判断当前状态**，页面不传目标态 */
  toggleMaximize(): void
  close(): void
  /** 当前是否最大化。标题栏据此切换「最大化 / 还原」图标 */
  isMaximized(): Promise<boolean>
  /**
   * 订阅最大化状态变化（含系统快捷键与贴靠触发的那几条路）。
   * 返回取消订阅的函数。
   */
  onMaximizeChange(listener: (maximized: boolean) => void): () => void
}
