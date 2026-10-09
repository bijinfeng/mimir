/**
 * 桌面端宿主 ↔ 载体的握手契约（D-046、D-100）。
 *
 * 主进程通过 preload 把这份只读信息暴露给页面
 * （`window.mimirDesktop.boot()`）。页面加载的就是宿主自己的地址，cookie
 * 会话与相对路径天然同源，所以业务代码几乎不依赖它；这份契约服务于
 * 「关于」面板与将来的载体形态（跨源认证宿主、CLI、扩展），是最小穿越边界。
 */

/**
 * 本地模式的本机令牌 cookie 名（D-100）。
 *
 * **必须是同一个字面量**：宿主（`apps/desktop/src/main.ts`）往 Electron 的
 * cookie jar 里写的名字，与服务端（`apps/server/src/services/local-mode.ts`）
 * 读取的名字要对上。两处各写一份常量时，改一处的症状是「本地模式又要求
 * 登录了」——不报错，只是回到登录页。所以它放在共享契约里。
 *
 * 名字带前缀（`mimir-`）而不是泛泛的 `local`：它出现在浏览器的 cookie
 * 列表里，要看得出是谁写的。
 */
export const LOCAL_TOKEN_COOKIE = 'mimir-local'

/**
 * 客户端的使用方式（D-100）。
 *
 * | 模式 | 数据在哪 | 宿主 |
 * |---|---|---|
 * | `local` | 本机（userData 下的 SQLite + 文件） | 进程内私有宿主，免登录 |
 * | `cloud` | 自部署的服务端 | **没有本地宿主**，窗口加载远端地址 |
 *
 * 它不是服务端设置项：选择存在 `<userData>/desktop-config.json`，
 * 因为切换必须能在服务端不可达时完成（`docs/TECH.md` §7.5 的配置分层）。
 */
export type DesktopMode = 'local' | 'cloud'

export interface DesktopBootInfo {
  /** 当前模式。页面据此决定「数据在本机还是远端」这类文案 */
  mode: DesktopMode
  /** 窗口加载的源：本地模式是 `http://127.0.0.1:<port>`，云端模式是远端地址 */
  origin: string
  /**
   * 数据根（macOS 在 `~/Library/Application Support/mimir/data`）。
   * **云端模式下是 null**——数据在服务端，本机只有一个壳。
   */
  dataDir: string | null
  /** 应用版本（electron app.getVersion()） */
  version: string
}

/**
 * 一次模式选择。`get()` 返回的就是它（没有选择时是 null）。
 *
 * 判别联合而不是「mode + 可空的 cloudUrl」：云端地址在云端模式下**必然存在**
 * （没有它就没有可加载的源），把这条不变量写进类型里，消费端就不需要
 * 「cloudUrl 可能是 null 吗」这种防御分支。
 */
export type DesktopModeState = { mode: 'local' } | { mode: 'cloud'; cloudUrl: string }

/**
 * `choose()` 的结果。
 *
 * 校验与探活（地址能不能连上）都发生在**导航之前**，所以失败必须能回到
 * 调用页——这时那页还在，它需要一句人能看懂的话；成功之后窗口会离开那一页，
 * 所以成功只需要一个记号。
 *
 * 用判别联合而不是 reject：IPC 抛出的错误在渲染侧只剩一句
 * 「Error invoking remote method …」，原始消息会被前缀吞掉，
 * 而这里的 message 是给用户看的。
 */
export type DesktopModeResult = { ok: true } | { ok: false; message: string }

/**
 * 模式的读取与切换（D-100）。
 *
 * **`choose()` 与 `activate()` 是两步**（不是一次调用里顺带导航）：
 * 校验失败要回到调用页（那页得活着），成功才导航（那页一定被替换）。
 * 合成一步的话，导航与 IPC 回执赛跑——回执还没送到，页面已经被替换掉了。
 */
export interface DesktopModeApi {
  /** 当前选择。首次启动（还没有选择）与开发模式（`MIMIR_DESKTOP_URL`）返回 null */
  get(): Promise<DesktopModeState | null>
  /** 校验并持久化选择；本地模式还会把私有宿主起好。**不导航** */
  choose(choice: DesktopModeState): Promise<DesktopModeResult>
  /** 让宿主把窗口导航到已选择的模式。单向通知，调用页会被替换 */
  activate(): void
  /**
   * 把窗口导航到**选择页**（首次启动用的那一页）。
   *
   * 设置 › 客户端里的「更换使用方式」走它，而不是在设置页里再画一套
   * 「填地址 + 校验 + 切换」——那套东西选择页已经有了，抄第二遍必然漂移
   * （两处的地址校验规则、失败措辞、探活时机）。选择页自己会读当前模式，
   * 所以从已配置的状态进去时它显示的是「切换」而不是「首次选择」。
   *
   * 它是单向通知：导航一定替换掉调用页，回执没有收件人。
   */
  openSetup(): void
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

/**
 * preload 注入到页面上的那一个对象（`window.mimirDesktop`）的完整形状。
 *
 * ## 为什么它在 shared 而不在渲染侧（D-103）
 *
 * 它是**契约**：preload 按这个形状注入（`apps/desktop/src/preload/index.ts`），
 * 渲染侧按这个形状消费（插槽的 `getDesktopBridge()`）。两边各写一份的话，
 * 加一个方法时漏掉一侧是静默的——类型过得去，运行时才发现 `undefined is not
 * a function`。
 *
 * **浏览器里这个对象不存在**，所以消费方拿到的永远是 `| undefined`；
 * 「可能没有」这件事由渲染侧的插槽表达，不写进这个契约里。
 */
export interface MimirDesktopBridge {
  /** 启动信息。开发模式（`MIMIR_DESKTOP_URL`）下为 null */
  boot: () => Promise<DesktopBootInfo | null>
  quit: () => void
  /** 使用方式的选择与切换（D-100）。首次启动尚未选择时 `get()` 为 null */
  mode: DesktopModeApi
  window: DesktopWindowApi
}
