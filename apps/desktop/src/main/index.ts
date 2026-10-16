import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, session, shell } from 'electron'
import {
  LOCAL_TOKEN_COOKIE,
  type DesktopBootInfo,
  type DesktopModeResult,
  type DesktopModeState,
} from '@mimir/shared/desktop'
import { normalizeCloudUrl, probeCloudUrl } from './cloud.js'
import { parseModeConfig, readModeConfig, writeModeConfig } from './config.js'
import { startHost, type HostHandle, type HostPaths } from './host.js'
import { navigationDecision, partitionFor, type WindowSurface } from './security.js'

/**
 * 桌面端载体（D-046，分层借鉴 deepseek-harness）。
 *
 * 职责：起宿主（或加载远端）、等就绪、开窗、关停，以及**模式的选择与切换**
 * （D-100）。页面加载的就是宿主的地址，所以 cookie 会话、SSE 聊天流、文件的
 * Range 请求全部同源原生；IPC 只承载 boot 信息、窗口控制、模式选择与退出
 * （契约见 packages/shared/src/desktop.ts）。
 *
 * ## 两种模式（D-100）
 *
 * | 模式 | 窗口加载 | 数据 |
 * |---|---|---|
 * | 本地 | 进程内私有宿主（`127.0.0.1:<随机端口>`） | 本机 userData，免登录 |
 * | 云端 | 用户自部署的地址 | 服务端，登录照旧 |
 *
 * 首次启动加载**选择页**（渲染产物里的 `setup.html`，不依赖任何宿主）；
 * 之后由 `desktop-config.json` 决定。切换从两个地方发起：本地/云端页面里的
 * 「设置 › 客户端」（走 preload 的 mode API），以及连不上服务器时的兜底弹窗。
 *
 * `pnpm desktop:dev` 与 `pnpm desktop:start` 都走本机宿主与正常的模式选择。
 */

// 在读取 userData 之前定名，否则开发/未打包形态下数据会落进 "Electron" 目录
app.setName('mimir')

/**
 * Linux 桌面上的进程身份（窗口列表、任务栏、Alt+Tab）。
 *
 * ## 与 `app.setName` 是两件事
 *
 * `setName` 改的是 Electron 内部的应用名（决定 userData 目录、macOS 菜单栏），
 * 而 Linux 的窗口列表读的是 **WM_CLASS**。开发模式下它是 `electron`
 * （按可执行文件名推导，打包后随 productName 变成 mimir）——所以不设这个
 * 开关时，任务栏上显示的一直是「Electron」，正是「名字还是默认的」那句话
 * 看到的画面。
 *
 * ## 只有 setDesktopName 有用（三个错误方案都实测过）
 *
 *  - `app.commandLine.appendSwitch('class', 'mimir')` —— 无效，WM_CLASS 仍是 electron
 *  - 命令行传 `--class=mimir` —— 同样无效（Electron 44 里这个开关已不被读）
 *  - 把可执行文件改名 / 软链成 `mimir` 再启动 —— 仍读作 electron
 *
 * `app.setDesktopName('mimir.desktop')` 一设就生效。语义是「这个应用对应哪个
 * .desktop 文件」：桌面环境据此把窗口与启动器条目、图标关联起来，WM_CLASS
 * 随之变成 `mimir`。**参数要带 `.desktop` 后缀**（那是文件名的形状，
 * 传纯 `mimir` 不生效）。
 *
 * 只在 Linux 设：macOS / Windows 的显示名来自 bundle 与 exe 元数据。
 */
if (process.platform === 'linux') {
  app.setDesktopName('mimir.desktop')
}

let host: HostHandle | null = null
let bootInfo: DesktopBootInfo | null = null
let win: BrowserWindow | null = null
let windowSurface: WindowSurface | null = null
/** 当前模式；首次启动尚未选择时为 null */
let modeState: DesktopModeState | null = null
/**
 * 未受信任的页面（云端模式的远端页）最近一次**经过确认**的选择。
 *
 * 只有它与当前 `modeState` 一致时 `activate()` 才放行——否则一个被篡改的
 * 远端页面可以在用户眼皮底下驱动导航（见下方 `isTrustedSender` 的说明）。
 */
let approvedUntrustedSwitch: DesktopModeState | null = null
/**
 * 窗口里现在是不是选择页。
 *
 * 与 `modeState` 是**两件事**，不能合并：`modeState` 是「用户选了哪种模式」，
 * 选择页只是暂时覆盖在上面。展示选择页时清掉 `modeState` 会让那一页
 * 把自己当成首次启动（显示「选择使用方式」而不是「切换」，还会丢掉
 * 预填的服务器地址），退出时也没法「返回」。
 *
 * 它只用来让 `did-fail-load` 忽略选择页自己的加载失败（那页是 file://，
 * 加载失败没有可重试的远端地址）。
 */
let setupVisible = false

/**
 * 宿主要用的两处产物（D-103）。
 *
 * `webDist` 现在是**本包自己的渲染产物**（`dist/renderer`），不再是
 * `apps/web/dist`——渲染进程已经是本包 electron-vite 的第三个入口。
 * 这一条顺带修掉了旧形态最容易踩的坑：改了前端代码不重新构建 web，
 * 窗口里永远看不到变化。
 */
function resolvePaths(): { serverDist: string; webDist: string } {
  if (app.isPackaged) {
    const resources = process.resourcesPath
    return {
      serverDist: join(resources, 'server', 'dist'),
      // asar 里的 dist/renderer：app.getAppPath() 指向 app.asar 自身
      webDist: join(app.getAppPath(), 'dist', 'renderer'),
    }
  }
  // 仓库内直跑（pnpm desktop:start）：服务端仍是与 Dockerfile 相同的位置，
  // 渲染产物在本包内
  const appDir = app.getAppPath()
  return {
    serverDist: resolve(appDir, '../server/dist'),
    webDist: join(appDir, 'dist', 'renderer'),
  }
}

/**
 * 窗口图标的路径。
 *
 * 打包后由 `after-pack` 拷到 `resources/icon.png`；开发时直接读仓库里的
 * 那一份。**macOS 不传**：那边窗口图标来自 .app 包的 `icon.icns`
 * （打包时由 electron-builder 写入），传了也不生效。
 */
function windowIcon(): string | undefined {
  if (process.platform === 'darwin') return undefined
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
}

/**
 * 本地模式与选择页的自绘标题栏配置（D-094）；云端用系统边框（D-105）。
 *
 * 自绘窗口在两个系统平台走不同的路：
 *
 * | 平台 | 配置 | 原因 |
 * |---|---|---|
 * | macOS | `titleBarStyle: 'hidden'` | **保留系统红绿灯**（用户的要求）。`frame: false` 会把它们一起去掉，那在 mac 上是反惯例的 |
 * | Windows / Linux | `frame: false` | 自绘控件放右上角。三条路（`frame: false` / `titleBarOverlay` / `titleBarStyle: 'hidden'`）里只有它两个平台行为一致 |
 *
 * `trafficLightPosition` 只对 macOS 有意义：默认位置（约 left 12, top 12）
 * 在 44px 的标题栏里略偏下，这里抬到垂直居中；页面侧再按 `--titlebar-pad-left`
 * 给内容让位。
 *
 * **`frame: false` 的连带影响**：窗口的四角圆角与阴影由系统给（mac 有、
 * Windows 11 有、Linux 视合成器），拖动与双击最大化要页面自己接——
 * 这就是 `-webkit-app-region` 与下面的 IPC 存在的原因。选择页也照这条走
 * （它自带一条拖动区与窗口控件）。
 */
function windowChromeOptions(surface: WindowSurface): Electron.BrowserWindowConstructorOptions {
  // 远端提供的是浏览器构建，里面没有桌面标题栏；由系统负责云端窗口的控件。
  if (surface === 'cloud') return {}
  if (process.platform === 'darwin') {
    return {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 16, y: 16 },
    }
  }
  return { frame: false }
}

function createWindow(url: string, surface: WindowSurface): BrowserWindow {
  const icon = windowIcon()
  const partition = partitionFor(surface, url)
  const browserSession = session.fromPartition(partition)
  guardPermissions(browserSession)
  const created = new BrowserWindow({
    width: 1440,
    height: 900,
    // 与前端主题的底色一致，避免加载瞬间的白/黑闪烁方向错误。
    // 选择页与深色系统同理——底色跟系统走（页面本身也按 prefers-color-scheme 渲染）
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#18191a' : '#ffffff',
    ...windowChromeOptions(surface),
    autoHideMenuBar: surface !== 'cloud',
    ...(icon === undefined ? {} : { icon }),
    webPreferences: {
      partition,
      /**
       * **必须是绝对路径。** 写成相对路径（`'./dist/preload.js'`）时，
       * 加载 http 地址的窗口里 Electron 解析不了它，**preload 静默不执行**——
       * 症状是 `window.mimirDesktop` 在页面里不存在（坑表记过这条）。
       *
       * electron-vite 把三段分别产到 `dist/main` / `dist/preload` /
       * `dist/renderer`（D-103），所以从主进程所在目录回上一层再进 preload。
       */
      ...(surface === 'cloud' ? {} : { preload: join(__dirname, '../preload/index.js') }),
      contextIsolation: true,
      sandbox: true,
    },
  })
  win = created
  windowSurface = surface
  windowControls(created)
  guardNavigation(created, url, partition)
  watchCloudLoadFailure(created)
  created.on('closed', () => {
    if (win === created) {
      win = null
      windowSurface = null
    }
  })
  void created.loadURL(url)
  return created
}

/** 窗口装饰不能在现有 BrowserWindow 上切换；先开新窗，避免触发退出。 */
async function loadWindow(
  target: BrowserWindow,
  url: string,
  surface: WindowSurface,
): Promise<void> {
  // Session 在 BrowserWindow 构造时固定；即使只是 local ↔ setup 也必须换窗。
  if (windowSurface !== surface) {
    createWindow(url, surface)
    target.close()
    return
  }
  windowSurface = surface
  await target.loadURL(url)
}

const guardedSessions = new WeakSet<Electron.Session>()

/** 不让页面自行请求设备/系统权限；仅主框架的复制操作可以写剪贴板。 */
function guardPermissions(browserSession: Electron.Session): void {
  if (guardedSessions.has(browserSession)) return
  guardedSessions.add(browserSession)
  browserSession.setPermissionCheckHandler((contents, permission, origin, details) =>
    Boolean(
      permission === 'clipboard-sanitized-write' &&
      contents &&
      details.isMainFrame &&
      navigationDecision(contents.getURL(), origin) === 'allow',
    ),
  )
  browserSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const requestingUrl = 'requestingUrl' in details ? details.requestingUrl : ''
    callback(
      permission === 'clipboard-sanitized-write' &&
        details.isMainFrame &&
        navigationDecision(contents.getURL(), requestingUrl) === 'allow',
    )
  })
}

/** 主导航与新窗口共用源边界，防止远端页面跳到常驻的本地宿主。 */
function guardNavigation(target: BrowserWindow, appUrl: string, partition: string): void {
  const redirect = (url: string): void => {
    if (navigationDecision(appUrl, url) === 'external') {
      void shell
        .openExternal(url)
        .catch((error: unknown) => console.warn('[desktop] 无法在系统浏览器打开链接：', error))
    }
  }

  target.webContents.on('will-navigate', (event) => {
    if (navigationDecision(appUrl, event.url) === 'allow') return
    event.preventDefault()
    redirect(event.url)
  })
  target.webContents.on('will-redirect', (event) => {
    if (navigationDecision(appUrl, event.url) === 'allow') return
    event.preventDefault()
    redirect(event.url)
  })
  target.webContents.setWindowOpenHandler(({ url }) => {
    const decision = navigationDecision(appUrl, url)
    if (decision !== 'allow') {
      redirect(url)
      return { action: 'deny' }
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          partition,
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
        },
      },
    }
  })
  target.webContents.on('did-create-window', (child) => {
    guardNavigation(child, appUrl, partition)
  })
}

/**
 * 自绘标题栏的窗口控制（D-094）。
 *
 * 三条动作 + 一条状态。动作走 `send`（单向，不需要回执），状态走 `invoke`
 * （要读权威值）。
 *
 * **最大化状态由宿主推给页面**，不让页面自己算：它能由按钮、双击标题栏、
 * 系统快捷键、Windows 贴靠四条路改变，页面自己维护的布尔值必然有一天
 * 与真相脱节（症状是「最大化之后按钮还是『最大化』的图标」）。
 * 这里监听 `maximize` / `unmaximize` 两个事件，广播给所有窗口。
 */
function windowControls(target: BrowserWindow): void {
  /**
   * 先清掉上一次的注册。**单窗口下这一步按理不需要**（关窗即退出，
   * `createWindow` 只跑一次），但重复注册 `ipcMain.handle` 会**抛错**
   * （`Attempted to register a second handler`）——而那会在「将来加了
   * 一个「重新打开窗口」的入口」时突然出现，排查起来要从这个异常倒推。
   * 两行清理换掉这个隐患。
   */
  ipcMain.removeAllListeners('mimir:window')
  ipcMain.removeHandler('mimir:window-maximized')

  ipcMain.on('mimir:window', (_event, action: string) => {
    if (target.isDestroyed()) return
    if (action === 'minimize') target.minimize()
    else if (action === 'toggle-maximize') {
      // 目标态由宿主判断——页面说「切换」，不说「最大化」
      if (target.isMaximized()) target.unmaximize()
      else target.maximize()
    } else if (action === 'close') target.close()
  })

  ipcMain.handle('mimir:window-maximized', () => !target.isDestroyed() && target.isMaximized())

  const broadcast = (maximized: boolean): void => {
    if (!target.isDestroyed()) {
      target.webContents.send('mimir:window-maximized-changed', maximized)
    }
  }
  target.on('maximize', () => broadcast(true))
  target.on('unmaximize', () => broadcast(false))
}

/* ── 模式：选择页、启动与切换（D-100） ───────────────────────── */

/**
 * 选择页的位置（D-103）。
 *
 * 它是渲染进程的第二个入口，所以落在渲染产物里（`dist/renderer/setup.html`）——
 * 打包后那一份在 asar 内，开发时在仓库内，两种形态同一表达式。
 *
 * 仍然是 `file://`：这一页必须在**没有任何宿主**时也能打开（首启时本地宿主
 * 还没起，云端连不上时远端也没有）。
 */
function setupPagePath(): string {
  return join(app.getAppPath(), 'dist', 'renderer', 'setup.html')
}

function setupPageUrl(): string {
  return pathToFileURL(setupPagePath()).href
}

/**
 * 这个页面有没有资格改客户端模式。
 *
 * ## 为什么不是「所有页面都可以」
 *
 * 云端模式下窗口里跑的是**远端服务端发来的页面**。如果它对模式 API 无所不能，
 * 一台被攻破（或本来就恶意）的服务器就能：让客户端启动本地宿主 → 导航过去 →
 * 把本机知识库读走；或者把客户端指向钓鱼站点去收密码。用户不该为「服务器
 * 被攻破」赔上本机数据。
 *
 * 受信任的只有两种页面：**选择页**（我们自己的 file:// 页面）与**本机宿主**
 * （127.0.0.1 上的我们自己的前端）。
 *
 * D-107 后远端页面不装 preload，正常情况下没有模式桥。这里仍按发送方
 * 校验并对不受信任的请求弹原生确认框，作为主进程的纵深防御。
 */
function isTrustedSender(url: string | undefined): boolean {
  if (!url) return false
  if (url === setupPageUrl()) return true
  if (host && url.startsWith(`${host.origin}/`)) return true

  return false
}

async function confirmUntrustedSwitch(state: DesktopModeState): Promise<boolean> {
  const target =
    state.mode === 'local'
      ? '本机知识库（本地模式，数据存在这台电脑上）'
      : `服务器 ${state.cloudUrl}`
  const senderHost = win && !win.isDestroyed() ? safeOrigin(win.webContents.getURL()) : '远程页面'

  /**
   * 两种重载：有窗口时挂成它的模态子窗（居父窗、挡住父窗交互），
   * 没有窗口时用无主弹窗。`showMessageBox(undefined, options)` 会在
   * 运行时报参数错误——而这条路径只在「窗口已经被关掉」时走到。
   */
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    title: '切换使用方式',
    message: `来自 ${senderHost} 的页面请求切换到：\n${target}`,
    detail: '如果这不是你刚才在 mimir 里发起的操作，请选择「取消」。',
    buttons: ['继续切换', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }
  const { response } =
    win && !win.isDestroyed()
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
  return response === 0
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

/** 起本地宿主（幂等）。**只在这里创建**，这样切换与启动走的是同一条路 */
async function ensureLocalHost(paths: HostPaths): Promise<HostHandle> {
  if (host) return host

  const created = await startHost(paths, { localMode: true })
  host = created
  // 与浏览器部署的启动日志同一组信息（TECH §8.6）：数据全空时第一眼看这里
  console.log(`[desktop] 本地模式宿主 ${created.origin}`)
  console.log(`[desktop] 数据目录 ${created.dataDir}`)
  console.log(`[desktop] 数据库 sqlite（${join(created.dataDir, 'mimir.db')}）`)
  return created
}

/**
 * 把本机令牌写进 cookie jar。
 *
 * 这是「本地模式不需要登录」的**全部机制**：宿主每次启动随机生成令牌，
 * 服务端的 `requireAuth` 拿它与 cookie 里的值做常量时间比较。令牌不进 URL、
 * 不进日志、也不从 preload 暴露给页面。
 *
 * `httpOnly` + `SameSite=Lax` 是刻意的：前者让脚本读不到它，后者让**跨站**
 * 请求不会带上它——恶意网页扫到本机端口也只能拿到 401（TECH §14.5）。
 */
async function injectLocalCookie(handle: HostHandle): Promise<void> {
  if (!handle.localToken) return
  await session.fromPartition(partitionFor('local', handle.origin)).cookies.set({
    url: handle.origin,
    name: LOCAL_TOKEN_COOKIE,
    value: handle.localToken,
    httpOnly: true,
    sameSite: 'lax',
  })
}

/**
 * 走到「可以加载这个模式」为止：起宿主 / 更新 boot 信息 / 注入 cookie。
 *
 * 返回窗口应当加载的地址。**启动与切换共用它**，两处各抄一份必然会漂移
 * （比如切换时忘了注入 cookie，症状是「切回本地模式却看到登录页」）。
 */
async function prepareTarget(state: DesktopModeState, paths: HostPaths): Promise<string> {
  if (state.mode === 'local') {
    const handle = await ensureLocalHost(paths)
    await injectLocalCookie(handle)
    bootInfo = {
      mode: 'local',
      origin: handle.origin,
      dataDir: handle.dataDir,
      version: app.getVersion(),
    }
    return handle.origin
  }

  bootInfo = { mode: 'cloud', origin: state.cloudUrl, dataDir: null, version: app.getVersion() }
  return state.cloudUrl
}

/**
 * 云端模式加载失败：**说清地址、给出三条路**，而不是留一个 Electron 的
 * 错误页（那种页面上只有英文与「Reload」，用户不知道还能改回本地模式）。
 *
 * `-3`（ERR_ABORTED）要忽略：页面自己发起的导航（比如点了一个链接又被
 * 我们的 loadURL 打断）会带着它来，把它当失败会弹出一个莫名其妙的框。
 */
function watchCloudLoadFailure(target: BrowserWindow): void {
  target.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, _url, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      // 选择页自己的加载失败不走这套话术：它没有「换一个地址」这层语义，
      // 而且那个弹窗会把用户困在一个循环里
      if (setupVisible) return
      if (modeState?.mode !== 'cloud') return
      void handleCloudUnreachable(target, modeState.cloudUrl, errorDescription)
    },
  )
}

async function handleCloudUnreachable(
  target: BrowserWindow,
  url: string,
  detail: string,
): Promise<void> {
  if (target.isDestroyed()) return
  const { response } = await dialog.showMessageBox(target, {
    type: 'warning',
    title: '连不上服务器',
    message: `无法加载 ${url}`,
    detail: `${detail}\n\n可以重试，或切换使用方式（例如改用本地模式）。`,
    buttons: ['重试', '更换使用方式', '退出'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  })

  if (response === 0) {
    void target.loadURL(url)
  } else if (response === 1) {
    await showSetupPage(target)
  } else {
    app.quit()
  }
}

/**
 * 打开选择页（首次启动与「更换使用方式」共用）。
 *
 * **不动 `modeState`**：选择页要读当前模式来决定自己的形态（首次选择 vs
 * 切换、预填地址、能不能「返回」）。真正改变模式的只有 `choose()`。
 */
async function showSetupPage(target: BrowserWindow): Promise<void> {
  if (target.isDestroyed() || target !== win) return
  setupVisible = true
  await loadWindow(target, setupPageUrl(), 'setup')
}

/** 云端页面不带桌面设置入口，切换动作必须由载体自己提供。 */
function installApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'mimir',
        submenu: [
          {
            label: '更换使用方式…',
            accelerator: 'CmdOrCtrl+Shift+M',
            click: () => {
              const target = win
              if (target && !target.isDestroyed()) void showSetupPage(target)
            },
          },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
    ]),
  )
}

function sameState(a: DesktopModeState, b: DesktopModeState): boolean {
  if (a.mode !== b.mode) return false
  return a.mode === 'cloud' && b.mode === 'cloud' ? a.cloudUrl === b.cloudUrl : true
}

/**
 * 模式的读取与切换（preload 的 `mimirDesktop.mode`）。
 *
 * `choose` 与 `activate` 分两步：校验失败要回到调用页（那页得活着），
 * 成功之后导航一定替换掉它（那页不需要回执）。合成一步会让导航与 IPC 回执
 * 赛跑——回执还没送到，页面已经被替换掉了。
 *
 */
function registerModeBridge(paths: HostPaths): void {
  ipcMain.removeHandler('mimir:mode-get')
  ipcMain.removeHandler('mimir:mode-choose')
  ipcMain.removeAllListeners('mimir:mode-activate')
  ipcMain.removeAllListeners('mimir:mode-open-setup')

  ipcMain.handle('mimir:mode-get', () => modeState)

  ipcMain.handle('mimir:mode-choose', async (event, raw): Promise<DesktopModeResult> => {
    const senderUrl = event.senderFrame?.url
    // **不信渲染侧**：IPC 的入参是外部输入，按与配置文件同一套规则校验形状
    let state = parseModeConfig(raw)
    if (!state) return { ok: false, message: '选择的内容不完整，请重试' }

    if (!isTrustedSender(senderUrl)) {
      const approved = await confirmUntrustedSwitch(state)
      if (!approved) return { ok: false, message: '已取消' }
      approvedUntrustedSwitch = state
    }

    if (state.mode === 'cloud') {
      // 归一化 + 探活都在写配置之前：写一个连不上的地址等于把用户锁在门外
      // （下次启动会直接加载它），而那时选择页还在，用户能改
      const normalized = normalizeCloudUrl(state.cloudUrl)
      if (!normalized.ok || !normalized.url) {
        return { ok: false, message: normalized.message ?? '地址不合法' }
      }
      const probe = await probeCloudUrl(normalized.url)
      if (!probe.ok) return { ok: false, message: probe.message ?? '连接失败' }
      state = { mode: 'cloud', cloudUrl: normalized.url }
    } else {
      try {
        await ensureLocalHost(paths)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        return { ok: false, message: `本地知识库启动失败：${detail}` }
      }
    }

    try {
      await writeModeConfig(app.getPath('userData'), state)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, message: `无法保存选择：${detail}` }
    }

    modeState = state
    approvedUntrustedSwitch = state
    return { ok: true }
  })

  ipcMain.on('mimir:mode-activate', (event) => {
    void (async () => {
      if (!paths || !modeState) return

      const senderUrl = event.senderFrame?.url
      if (!isTrustedSender(senderUrl)) {
        if (!approvedUntrustedSwitch || !sameState(approvedUntrustedSwitch, modeState)) return
      }

      const target = win
      try {
        const url = await prepareTarget(modeState, paths)
        setupVisible = false
        if (target && !target.isDestroyed()) await loadWindow(target, url, modeState.mode)
        else createWindow(url, modeState.mode)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        dialog.showErrorBox('切换失败', detail)
      }
    })()
  })

  /**
   * 「更换使用方式」——把窗口带到选择页。
   *
   * 这一步**任何页面都可以请求**（不弹确认框）：它只是打开我们自己的静态页，
   * 页面本身没有任何能力，改模式的还是用户在那一页上的动作。挡在这里会让
   * 「云端连不上、要改回本地」这条最需要它的路径变得啰嗦。
   */
  ipcMain.on('mimir:mode-open-setup', () => {
    const target = win
    if (target && !target.isDestroyed()) void showSetupPage(target)
  })
}

/* ── 启动 ─────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log('[desktop] whenReady，开始启动流程')
  installApplicationMenu()
  ipcMain.handle('mimir:boot-info', () => bootInfo)
  ipcMain.on('mimir:quit', () => app.quit())

  const paths: HostPaths = {
    ...resolvePaths(),
    dataDir: join(app.getPath('userData'), 'data'),
  }
  registerModeBridge(paths)

  const config = await readModeConfig(app.getPath('userData'))
  if (!config) {
    setupVisible = true
    createWindow(setupPageUrl(), 'setup')
    return
  }

  modeState = config
  try {
    const url = await prepareTarget(config, paths)
    createWindow(url, config.mode)
  } catch (error) {
    // 先落日志（弹窗是阻塞的，用户可能永远不点），再弹窗说清原因
    console.error('[desktop] 启动失败：', error)
    dialog.showErrorBox(
      'mimir 启动失败',
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    )
    app.quit()
  }
}

// 单实例锁：第二实例只唤醒已有窗口。两个窗口同时写一个 SQLite 会撞锁
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const existing = BrowserWindow.getAllWindows()[0]
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    }
  })
  void app.whenReady().then(main)
}

// 单窗口应用：关窗即退出（含 macOS）。单用户知识库没有「留在后台」的场景，
// 而宿主进程还开着的时候驻留只会让「关了窗口为什么还有进程」变成疑问
app.on('window-all-closed', () => {
  app.quit()
})

// 优雅关停：先停 HTTP 监听再关数据库（WAL 落盘），5 秒兜底强制退出
app.on('before-quit', (event) => {
  if (!host) return
  event.preventDefault()
  const closing = host
  host = null
  void Promise.race([closing.close(), new Promise<void>((done) => setTimeout(done, 5000))]).then(
    () => app.quit(),
  )
})
