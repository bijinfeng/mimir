import { constants } from 'node:fs'
import { access, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, ipcMain, nativeTheme, Notification, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { DesktopPlatform, DesktopUpdateState } from '@mimir/shared/desktop'
import {
  RELEASES_URL,
  UpdateBlocked,
  UpdateController,
  type UpdateInfo,
  type UpdatePreferences,
} from './updater.js'
import { closeWorkspace } from './workspace-close.js'
import type { WindowSurface } from './security.js'

interface Workspace {
  window: BrowserWindow | null
  surface: WindowSurface | null
}
export interface NativeUpdaterOptions {
  workspace(): Workspace
  closeHost(): Promise<void>
  setPreparing(value: boolean): void
  menuChanged(state: DesktopUpdateState): void
}

export function trustedUpdateFrame(
  event: Pick<Electron.IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
  window: BrowserWindow | null,
  exactUrl?: string,
): boolean {
  return Boolean(
    window &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    (!exactUrl || event.senderFrame.url === exactUrl),
  )
}

const logError = (error: Error): void => console.warn('[desktop:update]', error)
const latestReleaseApi = 'https://api.github.com/repos/bijinfeng/mimir/releases/latest'

function fetchLatestRelease(): Promise<Response> {
  return fetch(latestReleaseApi, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30_000),
  })
}

/** Dedicated local window owns action IPC; remote workspaces never receive this preload. */
export async function createNativeUpdater(options: NativeUpdaterOptions): Promise<{
  controller: UpdateController
  open(): void
  dispose(): void
}> {
  const preferencesPath = join(app.getPath('userData'), 'desktop-updates.json')
  let preferences: UpdatePreferences = { autoDownload: true }
  try {
    const raw: unknown = JSON.parse(await readFile(preferencesPath, 'utf8'))
    if (raw && typeof raw === 'object') {
      const value = raw as Record<string, unknown>
      preferences = {
        autoDownload: value.autoDownload !== false,
        notifiedVersion:
          typeof value.notifiedVersion === 'string' ? value.notifiedVersion : undefined,
        lastRunVersion: typeof value.lastRunVersion === 'string' ? value.lastRunVersion : undefined,
      }
    }
  } catch {
    /* Missing/corrupt preferences use safe defaults. */
  }
  let capability: DesktopUpdateState['capability'] = app.isPackaged ? 'automatic' : 'disabled'
  let manualReason: string | undefined
  if (app.isPackaged && process.platform === 'darwin') {
    const metadata: unknown = JSON.parse(
      await readFile(join(app.getAppPath(), 'package.json'), 'utf8'),
    )
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      (metadata as Record<string, unknown>).desktopUpdateMode !== 'automatic'
    ) {
      capability = 'manual'
      manualReason = '此测试版需要手动更新。下载后退出 mimir，再替换应用；系统可能阻止打开。'
    }
  }
  if (app.isPackaged && capability === 'automatic') {
    try {
      if (process.platform === 'linux') {
        if (!process.env.APPIMAGE) throw new Error('Not an AppImage')
        await access(process.env.APPIMAGE, constants.W_OK)
        await access(dirname(process.env.APPIMAGE), constants.W_OK)
      } else if (process.platform === 'win32') {
        await access(dirname(process.execPath), constants.W_OK)
      }
    } catch {
      capability = 'manual'
      manualReason = '当前安装方式需要手动更新，请下载新版并替换应用。'
    }
  }

  // Configuration is code-owned. No renderer input or credentials enter the feed.
  autoUpdater.setFeedURL({ provider: 'github', owner: 'bijinfeng', repo: 'mimir', private: false })
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  let details: BrowserWindow | null = null
  let disposed = false
  let pending: {
    requestId: string
    window: BrowserWindow
    frame: Electron.WebFrameMain
    resolve(ready: boolean): void
  } | null = null
  const detailsPath = join(app.getAppPath(), 'dist', 'renderer', 'update.html')
  let detailsUrl = pathToFileURL(detailsPath).href
  let appearance: 'auto' | 'light' | 'dark' = 'auto'
  let manualAssets: string[] = []

  const cancelPrepare = (): void => {
    const request = pending
    pending = null
    request?.resolve(false)
    const workspace = options.workspace().window
    if (workspace && !workspace.isDestroyed())
      workspace.webContents.send('mimir:update-prepare-cancelled')
  }
  const focusWorkspace = (): void => {
    const target = options.workspace().window
    if (!target || target.isDestroyed()) return
    if (target.isMinimized()) target.restore()
    target.show()
    target.focus()
  }
  const prepareWorkspace = async (cloudSavedConfirmed: boolean): Promise<void> => {
    const { window: target, surface } = options.workspace()
    if (!target || target.isDestroyed())
      throw new UpdateBlocked('工作区已关闭，请重新启动客户端后再试。')
    if (surface === 'cloud' && !cloudSavedConfirmed) {
      focusWorkspace()
      throw new UpdateBlocked(
        '请先返回文档保存内容，再确认重启。此服务器页面无法自动确认保存。',
        true,
      )
    }
    if (target.webContents.isLoadingMainFrame())
      throw new UpdateBlocked('工作区正在加载，请稍后再试。')
    if (surface === 'local') {
      focusWorkspace()
      const ready = await new Promise<boolean>((resolve) => {
        const requestId = randomUUID()
        const frame = target.webContents.mainFrame
        const navigation = (): void => finish(false)
        const destroyed = (): void => finish(false)
        const timer = setTimeout(() => finish(false), 120_000)
        const finish = (value: boolean): void => {
          clearTimeout(timer)
          target.webContents.off('did-start-navigation', navigation)
          target.webContents.off('destroyed', destroyed)
          if (pending?.requestId === requestId) pending = null
          resolve(value)
        }
        target.webContents.once('did-start-navigation', navigation)
        target.webContents.once('destroyed', destroyed)
        pending = { requestId, window: target, frame, resolve: finish }
        target.webContents.send('mimir:update-prepare', {
          requestId,
          version: controller.getState().version!,
        })
      })
      if (!ready)
        throw new UpdateBlocked('当前内容还没保存或准备已取消，暂未重启。请返回文档处理后重试。')
    }
    if (target !== options.workspace().window || target.isDestroyed()) {
      throw new UpdateBlocked('工作区已变化，请重新检查保存状态。')
    }
    options.setPreparing(true)
    try {
      await closeWorkspace(target)
    } catch (error) {
      throw new UpdateBlocked(
        error instanceof Error ? error.message : '工作区未能关闭，更新尚未安装。',
      )
    }
    try {
      await options.closeHost()
    } catch {
      throw new UpdateBlocked(
        '工作区已关闭，但暂时无法完成重启，更新尚未安装。请关闭客户端并重新启动以恢复使用。',
        false,
        true,
      )
    }
  }

  const controller = new UpdateController({
    currentVersion: app.getVersion(),
    platform: process.platform as DesktopPlatform,
    arch: process.arch,
    capability,
    manualReason,
    preferences,
    persist: async (value) => {
      const temporary = `${preferencesPath}.tmp`
      await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8')
      await rename(temporary, preferencesPath)
    },
    log: (error) => console.warn('[desktop:update]', error),
    notify: (version, upgraded) => {
      if (disposed || !Notification.isSupported()) return
      const notification = new Notification({
        title: upgraded ? `已更新至 mimir ${version}` : 'mimir 新版本已准备好',
        body: upgraded ? '点击查看更新说明。' : '点击查看更新，选择合适的时间重启安装。',
        silent: true,
      })
      notification.on('click', () => open())
      notification.show()
    },
    driver: {
      check: async (): Promise<UpdateInfo | null> => {
        if (capability === 'manual') {
          const response = await fetchLatestRelease()
          if (response.status === 404) return null
          if (!response.ok) throw new Error(`Release request failed: ${response.status}`)
          const info = (await response.json()) as {
            tag_name: string
            prerelease: boolean
            draft: boolean
            body?: string
            assets?: { name: string }[]
          }
          if (info.prerelease || info.draft || typeof info.tag_name !== 'string') return null
          manualAssets = info.assets?.map((asset) => asset.name) ?? []
          return { version: info.tag_name.replace(/^v/, ''), releaseNotes: info.body }
        }
        try {
          const result = await autoUpdater.checkForUpdates()
          return result?.updateInfo ?? null
        } catch (error) {
          // GitHubProvider also wraps network/parse failures in "latest not found",
          // and an empty Atom feed can throw before it sets an error code.
          // Only an independent official 404 proves there is no public release.
          const response = await fetchLatestRelease()
          if (response.status === 404) return null
          throw error
        }
      },
      download: async () => {
        await autoUpdater.downloadUpdate()
      },
      install: () => {
        autoUpdater.quitAndInstall(false, true)
      },
    },
    prepareInstall: async (confirmed) => {
      try {
        await prepareWorkspace(confirmed)
      } catch (error) {
        cancelPrepare()
        options.setPreparing(false)
        throw error
      }
    },
  })
  const progress = (value: { transferred: number; total: number }): void =>
    controller.progress(value.transferred, value.total)
  const updaterError = (error: Error): void => {
    logError(error)
    controller.installationFailed(error)
  }
  autoUpdater.on('download-progress', progress)
  autoUpdater.on('error', updaterError)
  const unsubscribe = controller.subscribe((state) => {
    if (state.recoveryRequired) options.setPreparing(false)
    if (details && !details.isDestroyed()) details.webContents.send('mimir:update-state', state)
    const { window, surface } = options.workspace()
    if (window && !window.isDestroyed() && surface !== 'cloud')
      window.webContents.send('mimir:update-state', state)
    options.menuChanged(state)
  })

  function open(): void {
    if (disposed) return
    const theme = options.workspace().surface === 'cloud' ? 'auto' : appearance
    const nextUrl = `${pathToFileURL(detailsPath).href}?appearance=${theme}`
    if (details && !details.isDestroyed()) {
      if (detailsUrl !== nextUrl) {
        detailsUrl = nextUrl
        void details.loadFile(detailsPath, { query: { appearance: theme } })
      }
      details.show()
      details.focus()
      return
    }
    details = new BrowserWindow({
      width: 600,
      height: 680,
      minWidth: 360,
      minHeight: 480,
      title: '软件更新 · mimir',
      autoHideMenuBar: true,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#18191a' : '#ffffff',
      webPreferences: {
        partition: 'mimir-updater',
        preload: join(__dirname, '../preload/updater.js'),
        sandbox: true,
        contextIsolation: true,
      },
    })
    const created = details
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    created.webContents.on('will-navigate', (event) => {
      event.preventDefault()
    })
    created.webContents.on('will-redirect', (event) => {
      event.preventDefault()
    })
    created.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    )
    created.on('closed', () => {
      if (details === created) details = null
      // If a save guard is currently waiting, its original document retains focus.
      if (pending) focusWorkspace()
    })
    detailsUrl = nextUrl
    void created.loadFile(detailsPath, { query: { appearance: theme } })
  }

  const requireDetails = (event: Electron.IpcMainInvokeEvent): void => {
    if (!trustedUpdateFrame(event, details, detailsUrl)) throw new Error('不受信任的更新请求')
  }
  const requireLocal = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): void => {
    const { window, surface } = options.workspace()
    if (surface === 'cloud' || !trustedUpdateFrame(event, window))
      throw new Error('不受信任的更新请求')
  }
  ipcMain.handle('mimir:updater-state', (event) => {
    requireDetails(event)
    return controller.getState()
  })
  ipcMain.handle('mimir:updater-check', async (event) => {
    requireDetails(event)
    await controller.check()
  })
  ipcMain.handle('mimir:updater-download', async (event) => {
    requireDetails(event)
    await controller.download()
  })
  ipcMain.handle('mimir:updater-install', async (event, confirmed: unknown) => {
    requireDetails(event)
    await controller.install(confirmed === true)
  })
  ipcMain.handle('mimir:updater-auto-download', async (event, enabled: unknown) => {
    requireDetails(event)
    if (typeof enabled !== 'boolean') throw new Error('无效的更新偏好')
    await controller.setAutoDownload(enabled)
  })
  ipcMain.handle('mimir:updater-release', async (event) => {
    requireDetails(event)
    const state = controller.getState()
    const asset =
      state.capability === 'manual' &&
      state.version &&
      manualAssets.find((name) =>
        process.platform === 'darwin'
          ? name.includes(process.arch) && name.endsWith('.dmg')
          : process.platform === 'linux'
            ? name.includes(process.arch) && name.endsWith('.AppImage')
            : name.includes(process.arch) && name.endsWith('.exe'),
      )
    await shell.openExternal(
      asset
        ? `${RELEASES_URL}/download/v${state.version}/${encodeURIComponent(asset)}`
        : state.releaseUrl,
    )
  })
  ipcMain.on('mimir:updater-return', (event) => {
    if (trustedUpdateFrame(event, details, detailsUrl)) focusWorkspace()
  })
  ipcMain.on('mimir:updater-close', (event) => {
    if (trustedUpdateFrame(event, details, detailsUrl)) details?.close()
  })
  ipcMain.handle('mimir:update-state', (event) => {
    requireLocal(event)
    return controller.getState()
  })
  ipcMain.on('mimir:update-open', (event, requestedAppearance: unknown) => {
    const { window, surface } = options.workspace()
    if (surface !== 'cloud' && trustedUpdateFrame(event, window)) {
      if (
        requestedAppearance === 'light' ||
        requestedAppearance === 'dark' ||
        requestedAppearance === 'auto'
      )
        appearance = requestedAppearance
      open()
    }
  })
  ipcMain.on('mimir:update-appearance', (event, requestedAppearance: unknown) => {
    const { window, surface } = options.workspace()
    if (surface !== 'local' || !trustedUpdateFrame(event, window)) return
    if (
      requestedAppearance === 'light' ||
      requestedAppearance === 'dark' ||
      requestedAppearance === 'auto'
    ) {
      appearance = requestedAppearance
    }
  })
  ipcMain.on('mimir:update-prepare-result', (event, requestId: unknown, ready: unknown) => {
    const request = pending
    if (
      !request ||
      requestId !== request.requestId ||
      !trustedUpdateFrame(event, request.window) ||
      event.senderFrame !== request.frame ||
      options.workspace().surface !== 'local'
    )
      return
    request.resolve(ready === true)
  })
  return {
    controller,
    open,
    dispose: () => {
      disposed = true
      cancelPrepare()
      unsubscribe()
      controller.dispose()
      autoUpdater.off('download-progress', progress)
      autoUpdater.off('error', updaterError)
    },
  }
}
