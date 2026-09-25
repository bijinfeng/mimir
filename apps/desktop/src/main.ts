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

function createWindow(url: string): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    // 与前端浅色主题的底色一致，避免加载瞬间的白/黑闪烁方向错误
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  void win.loadURL(url)
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
