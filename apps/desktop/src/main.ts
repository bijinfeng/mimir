import { join, resolve } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { DesktopBootInfo } from '@mimir/shared'
import { startHost, type HostHandle } from './host.js'

/**
 * 桌面端载体（D-046，分层借鉴 deepseek-harness）。
 *
 * 职责只有四件：起宿主、等就绪、开窗、关停。页面加载的就是宿主自己的
 * 地址，所以 cookie 会话、SSE 聊天流、文件的 Range 请求全部同源原生；
 * IPC 只承载 boot 信息与退出（契约见 packages/shared/src/desktop.ts）。
 *
 * 开发模式（`pnpm desktop:dev`）：设置 `MIMIR_DESKTOP_URL` 后这里只当
 * 浏览器壳加载 Vite 页面，宿主仍在独立进程里跑——迭代前端不用碰打包链。
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

function resolvePaths(): { serverDist: string; webDist: string } {
  if (app.isPackaged) {
    const resources = process.resourcesPath
    return {
      serverDist: join(resources, 'server', 'dist'),
      webDist: join(resources, 'web', 'dist'),
    }
  }
  // 仓库内直跑（pnpm desktop:start）：与 Dockerfile 相同的构建产物位置
  const appDir = app.getAppPath()
  return {
    serverDist: resolve(appDir, '../server/dist'),
    webDist: resolve(appDir, '../web/dist'),
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
 * 自绘标题栏的窗口配置（D-094）。
 *
 * 两个平台走两条不同的路，这是 Electron 的既有形状，不是我们的选择：
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
 * 这就是 `-webkit-app-region` 与下面的 IPC 存在的原因。
 */
function windowChromeOptions(): Electron.BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 16, y: 16 },
    }
  }
  return { frame: false }
}

function createWindow(url: string): void {
  const icon = windowIcon()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    // 与前端浅色主题的底色一致，避免加载瞬间的白/黑闪烁方向错误
    backgroundColor: '#ffffff',
    ...windowChromeOptions(),
    ...(icon === undefined ? {} : { icon }),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  windowControls(win)
  void win.loadURL(url)
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
function windowControls(win: BrowserWindow): void {
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
    if (action === 'minimize') win.minimize()
    else if (action === 'toggle-maximize') {
      // 目标态由宿主判断——页面说「切换」，不说「最大化」
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    } else if (action === 'close') win.close()
  })

  ipcMain.handle('mimir:window-maximized', () => win.isMaximized())

  const broadcast = (maximized: boolean): void => {
    if (!win.isDestroyed()) {
      win.webContents.send('mimir:window-maximized-changed', maximized)
    }
  }
  win.on('maximize', () => broadcast(true))
  win.on('unmaximize', () => broadcast(false))
}

async function main(): Promise<void> {
  console.log('[desktop] whenReady，开始启动流程')
  ipcMain.handle('mimir:boot-info', () => bootInfo)
  ipcMain.on('mimir:quit', () => app.quit())

  const devUrl = process.env.MIMIR_DESKTOP_URL
  if (devUrl) {
    createWindow(devUrl)
    return
  }

  try {
    const paths = { ...resolvePaths(), dataDir: join(app.getPath('userData'), 'data') }
    host = await startHost(paths)
    bootInfo = { origin: host.origin, dataDir: host.dataDir, version: app.getVersion() }
    // 与浏览器部署的启动日志同一组信息（TECH §8.6）：数据全空时第一眼看这里
    console.log(`[desktop] 宿主 ${host.origin}`)
    console.log(`[desktop] 数据目录 ${host.dataDir}`)
    console.log(`[desktop] 数据库 sqlite（${join(host.dataDir, 'mimir.db')}）`)
    createWindow(host.origin)
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
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
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
