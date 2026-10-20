import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { createNativeUpdater, trustedUpdateFrame } from './native-updater.js'
import { HostShutdown } from './host-shutdown.js'

const mocks = vi.hoisted(() => ({
  directory: '',
  writable: true,
  windows: [] as unknown[],
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  installed: vi.fn<() => void>(),
  closeConnections: vi.fn<() => Promise<void>>(async () => {}),
  check: vi.fn<() => Promise<{ updateInfo: { version: string } }>>(async () => ({
    updateInfo: { version: '0.2.0' },
  })),
  download: vi.fn<() => Promise<string[]>>(async () => []),
  external: vi.fn<() => void>(),
  packaged: true,
}))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    access: async () => {
      if (!mocks.writable) throw new Error('read only')
    },
  }
})
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class Window extends EventEmitter {
    destroyed = false
    closeMode = 'close'
    private readonly contents = Object.assign(new EventEmitter(), {
      mainFrame: { url: '', processId: 1, routingId: 1 },
      send: vi.fn<() => void>(),
      isLoadingMainFrame: () => false,
      setWindowOpenHandler: vi.fn<() => void>(),
      session: {
        setPermissionRequestHandler: vi.fn<() => void>(),
        closeAllConnections: mocks.closeConnections,
      },
    })
    get webContents() {
      if (this.destroyed) throw new Error('Object has been destroyed')
      return this.contents
    }
    show = vi.fn<() => void>()
    focus = vi.fn<() => void>()
    restore = vi.fn<() => void>()
    constructor() {
      super()
      mocks.windows.push(this)
    }
    isDestroyed() {
      return this.destroyed
    }
    isMinimized() {
      return false
    }
    async loadFile(path: string, options: { query: Record<string, string> }) {
      this.webContents.mainFrame.url = `${pathToFileURL(path).href}?${new URLSearchParams(options.query)}`
    }
    close() {
      if (this.closeMode === 'veto') {
        this.webContents.emit('will-prevent-unload', {})
        return
      }
      if (this.closeMode === 'throw') throw new Error('close error')
      if (this.closeMode === 'hang') return
      this.destroyed = true
      this.emit('closed')
    }
  }
  // Keep mocks independent from global Electron runtime and network.
  const ipcMain = Object.assign(new EventEmitter(), {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler),
  })
  return {
    app: {
      get isPackaged() {
        return mocks.packaged
      },
      getPath: () => mocks.directory,
      getAppPath: () => mocks.directory,
      getVersion: () => '0.1.0',
    },
    BrowserWindow: Window,
    ipcMain,
    nativeTheme: { shouldUseDarkColors: false },
    Notification: { isSupported: () => false },
    shell: { openExternal: mocks.external },
  }
})
vi.mock('electron-updater', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    autoUpdater: Object.assign(new EventEmitter(), {
      setFeedURL: vi.fn<() => void>(),
      checkForUpdates: mocks.check,
      downloadUpdate: mocks.download,
      quitAndInstall: mocks.installed,
    }),
  }
})

// Cast only at the adapter boundary; the mock implements the native events under test.
interface TestWindow extends EventEmitter {
  destroyed: boolean
  closeMode: string
  webContents: EventEmitter & { mainFrame: { url: string }; send: ReturnType<typeof vi.fn> }
  focus: ReturnType<typeof vi.fn>
}
function event(window: TestWindow): IpcMainInvokeEvent {
  return {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  } as unknown as IpcMainInvokeEvent
}
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
let active: Awaited<ReturnType<typeof createNativeUpdater>> | undefined
let workspace: TestWindow
let surface: 'local' | 'cloud' | 'setup'
let closeHost: ReturnType<typeof vi.fn<(beforeClose?: () => Promise<void>) => Promise<void>>>
let preparing: ReturnType<typeof vi.fn<(value: boolean) => void>>
let ipc: EventEmitter
beforeEach(async () => {
  vi.clearAllMocks()
  mocks.closeConnections.mockReset().mockResolvedValue(undefined)
  mocks.windows = []
  mocks.handlers.clear()
  mocks.packaged = true
  mocks.writable = true
  Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'darwin' })
  mocks.directory = await mkdtemp(join(tmpdir(), 'mimir-update-test-'))
  await writeFile(
    join(mocks.directory, 'package.json'),
    JSON.stringify({ desktopUpdateMode: 'automatic' }),
  )
  const electron = await import('electron')
  ipc = electron.ipcMain
  ipc.removeAllListeners()
  workspace = new electron.BrowserWindow() as unknown as TestWindow
  surface = 'local'
  closeHost = vi.fn<(beforeClose?: () => Promise<void>) => Promise<void>>(async (beforeClose) => {
    await beforeClose?.()
  })
  preparing = vi.fn<() => void>()
  active = await createNativeUpdater({
    workspace: () => ({ window: workspace as unknown as BrowserWindow, surface }),
    closeHost,
    setPreparing: preparing,
    menuChanged: vi.fn<() => void>(),
  })
  await active.controller.check()
})
afterEach(async () => {
  active?.dispose()
  await rm(mocks.directory, { recursive: true, force: true })
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  Object.defineProperty(process, 'platform', platformDescriptor)
})
function acknowledge(ready = true) {
  workspace.webContents.send.mockImplementation(
    (channel: string, request: { requestId: string }) => {
      if (channel === 'mimir:update-prepare')
        queueMicrotask(() => {
          ipc.emit('mimir:update-prepare-result', event(workspace), request.requestId, ready)
        })
    },
  )
}
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('native update authorization and restart sequence', () => {
  it('keeps ordinary quit separate from explicit installer restart', async () => {
    const { autoUpdater } = await import('electron-updater')
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    active!.dispose()
    expect(mocks.installed).not.toHaveBeenCalled()
  })
  it('opens one local details window with dedicated preload and validates exact frame/URL', async () => {
    active!.open()
    active!.open()
    expect(mocks.windows).toHaveLength(2)
    const details = mocks.windows[1] as TestWindow
    const get = mocks.handlers.get('mimir:updater-state')!
    expect(get(event(details))).toMatchObject({ status: 'downloaded' })
    expect(() => get(event(workspace))).toThrow('不受信任')
    expect(
      trustedUpdateFrame(
        {
          ...event(details),
          senderFrame: { url: details.webContents.mainFrame.url },
        } as IpcMainInvokeEvent,
        details as unknown as BrowserWindow,
        details.webContents.mainFrame.url,
      ),
    ).toBe(false)
    details.webContents.mainFrame.url = 'file:///another-page.html'
    expect(() => get(event(details))).toThrow('不受信任')
  })
  it('inherits trusted local appearance for menu entry and reopens, while cloud uses system', () => {
    ipc.emit('mimir:update-appearance', event(workspace), 'dark')
    active!.open()
    const details = mocks.windows[1] as TestWindow
    expect(details.webContents.mainFrame.url).toContain('appearance=dark')
    ipc.emit('mimir:update-appearance', event(workspace), 'light')
    active!.open()
    expect(details.webContents.mainFrame.url).toContain('appearance=light')
    surface = 'cloud'
    ipc.emit('mimir:update-appearance', event(workspace), 'dark')
    active!.open()
    expect(details.webContents.mainFrame.url).toContain('appearance=auto')
    expect(mocks.windows).toHaveLength(2)
  })
  it('awaits save acknowledgement and completed host shutdown before invoking installer', async () => {
    let finish!: () => void
    closeHost.mockImplementation(async (beforeClose) => {
      await beforeClose?.()
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    acknowledge()
    const operation = active!.controller.install()
    await flush()
    expect(workspace.destroyed).toBe(true)
    expect(closeHost).toHaveBeenCalledOnce()
    expect(mocks.installed).not.toHaveBeenCalled()
    finish()
    await operation
    expect(mocks.installed).toHaveBeenCalledExactlyOnceWith(false, true)
  })
  it('closes the saved workspace before draining its session and awaiting host shutdown', async () => {
    const closeServer = vi.fn<() => Promise<void>>(async () => {})
    const shutdown = new HostShutdown(closeServer)
    closeHost.mockImplementation((beforeClose) => shutdown.close(beforeClose))
    let drained!: () => void
    mocks.closeConnections.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          expect(workspace.destroyed).toBe(true)
          drained = resolve
        }),
    )
    acknowledge()
    const operation = active!.controller.install()
    await flush()
    expect(workspace.destroyed).toBe(true)
    expect(mocks.closeConnections).toHaveBeenCalledOnce()
    expect(closeHost).toHaveBeenCalledOnce()
    expect(closeServer).not.toHaveBeenCalled()
    expect(mocks.installed).not.toHaveBeenCalled()
    drained()
    await operation
    expect(closeHost).toHaveBeenCalledOnce()
    expect(closeServer).toHaveBeenCalledOnce()
    expect(mocks.installed).toHaveBeenCalledExactlyOnceWith(false, true)
  })
  it('preserves session drain failures and never enters host shutdown or installation', async () => {
    const closeServer = vi.fn<() => Promise<void>>(async () => {})
    const shutdown = new HostShutdown(closeServer)
    closeHost.mockImplementation((beforeClose) => shutdown.close(beforeClose))
    const cause = new Error('session connection drain failed')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mocks.closeConnections.mockRejectedValueOnce(cause)
      acknowledge()
      await active!.controller.install()
      expect(workspace.destroyed).toBe(true)
      expect(closeHost).toHaveBeenCalledOnce()
      expect(closeServer).not.toHaveBeenCalled()
      expect(mocks.installed).not.toHaveBeenCalled()
      expect(active!.controller.getState()).toMatchObject({
        status: 'blocked',
        recoveryRequired: true,
        retry: undefined,
      })
      expect(warning).toHaveBeenCalledWith('[desktop:update]', expect.objectContaining({ cause }))
      await active!.controller.install()
      expect(mocks.closeConnections).toHaveBeenCalledOnce()
    } finally {
      warning.mockRestore()
    }
  })
  it('keeps session drain inside the shutdown budget and rejects late completion', async () => {
    vi.useFakeTimers()
    const closeServer = vi.fn<() => Promise<void>>(async () => {})
    const shutdown = new HostShutdown(closeServer)
    closeHost.mockImplementation((beforeClose) => shutdown.close(beforeClose))
    let drained!: () => void
    mocks.closeConnections.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          drained = resolve
        }),
    )
    acknowledge()
    const operation = active!.controller.install()
    await flush()
    expect(mocks.closeConnections).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(15_000)
    await operation
    expect(active!.controller.getState()).toMatchObject({
      status: 'blocked',
      recoveryRequired: true,
      retry: undefined,
    })
    expect(closeServer).not.toHaveBeenCalled()
    expect(mocks.installed).not.toHaveBeenCalled()
    drained()
    await flush()
    await active!.controller.install()
    expect(closeServer).not.toHaveBeenCalled()
    expect(mocks.installed).not.toHaveBeenCalled()
    expect(closeHost).toHaveBeenCalledOnce()
  })
  it('refuses renderer false, unrelated requests, and replies from stale navigation', async () => {
    vi.useFakeTimers()
    let requestId = ''
    workspace.webContents.send.mockImplementation(
      (channel: string, request: { requestId: string }) => {
        if (channel === 'mimir:update-prepare') requestId = request.requestId
      },
    )
    const operation = active!.controller.install()
    ipc.emit('mimir:update-prepare-result', event(workspace), 'unrelated', true)
    await flush()
    expect(closeHost).not.toHaveBeenCalled()
    workspace.webContents.emit('did-start-navigation')
    ipc.emit('mimir:update-prepare-result', event(workspace), requestId, true)
    await operation
    expect(closeHost).not.toHaveBeenCalled()
    expect(mocks.installed).not.toHaveBeenCalled()
    acknowledge(false)
    await active!.controller.install()
    expect(active!.controller.getState().status).toBe('blocked')
    expect(closeHost).not.toHaveBeenCalled()
  })
  it('honors beforeunload veto even after save permission and retains the workspace', async () => {
    acknowledge()
    workspace.closeMode = 'veto'
    await active!.controller.install()
    expect(workspace.destroyed).toBe(false)
    expect(mocks.closeConnections).not.toHaveBeenCalled()
    expect(closeHost).not.toHaveBeenCalled()
    expect(mocks.installed).not.toHaveBeenCalled()
    expect(active!.controller.getState()).toMatchObject({ status: 'blocked', retry: 'install' })
    expect(preparing).toHaveBeenLastCalledWith(false)
  })
  it('stops on window timeout or close exception', async () => {
    vi.useFakeTimers()
    acknowledge()
    workspace.closeMode = 'hang'
    const operation = active!.controller.install()
    await flush()
    await vi.advanceTimersByTimeAsync(15_000)
    await operation
    expect(closeHost).not.toHaveBeenCalled()
    workspace.closeMode = 'throw'
    await active!.controller.install()
    expect(closeHost).not.toHaveBeenCalled()
    expect(mocks.installed).not.toHaveBeenCalled()
  })
  it('requires manual saving confirmation in cloud and still honors its leave veto', async () => {
    surface = 'cloud'
    await active!.controller.install()
    expect(active!.controller.getState()).toMatchObject({
      status: 'blocked',
      requiresSaveConfirmation: true,
    })
    expect(workspace.webContents.send).not.toHaveBeenCalledWith(
      'mimir:update-prepare',
      expect.anything(),
    )
    workspace.closeMode = 'veto'
    await active!.controller.install(true)
    expect(closeHost).not.toHaveBeenCalled()
    expect(mocks.installed).not.toHaveBeenCalled()
    workspace.closeMode = 'close'
    await active!.controller.install(true)
    expect(closeHost).toHaveBeenCalledOnce()
    expect(mocks.installed).toHaveBeenCalledOnce()
  })
  it('marks failed host shutdown as recovery required and cannot retry an installer', async () => {
    acknowledge()
    closeHost.mockRejectedValueOnce(new Error('database close failed'))
    await active!.controller.install()
    expect(active!.controller.getState()).toMatchObject({
      status: 'blocked',
      recoveryRequired: true,
      retry: undefined,
    })
    expect(mocks.installed).not.toHaveBeenCalled()
    await active!.controller.install()
    expect(closeHost).toHaveBeenCalledOnce()
    expect(mocks.installed).not.toHaveBeenCalled()
  })
  it.each(['synchronous', 'late'])(
    'recovers from %s installer error events after the workspace has closed',
    async (timing) => {
      acknowledge()
      const { autoUpdater } = await import('electron-updater')
      if (timing === 'synchronous') {
        mocks.installed.mockImplementationOnce(() => {
          autoUpdater.emit('error', new Error('installer launch failed'))
        })
      }
      await active!.controller.install()
      if (timing === 'late') autoUpdater.emit('error', new Error('installer launch failed'))
      expect(workspace.destroyed).toBe(true)
      expect(closeHost).toHaveBeenCalledOnce()
      expect(active!.controller.getState()).toMatchObject({
        status: 'blocked',
        recoveryRequired: true,
        retry: undefined,
      })
      expect(preparing).toHaveBeenLastCalledWith(false)
      await active!.controller.install()
      expect(mocks.installed).toHaveBeenCalledOnce()
    },
  )
  it('rejects update actions from cloud/main frames even if they know IPC channel names', async () => {
    surface = 'cloud'
    active!.open()
    const install = mocks.handlers.get('mimir:updater-install')!
    await expect(install(event(workspace), true)).rejects.toThrow('不受信任')
    const read = mocks.handlers.get('mimir:update-state')!
    expect(() => read(event(workspace))).toThrow('不受信任')
    expect(mocks.installed).not.toHaveBeenCalled()
  })
})

describe('packaged capability policy', () => {
  it.each([
    { status: 404, expected: 'unpublished' },
    { status: 200, expected: 'error' },
    { status: 403, expected: 'error' },
  ])(
    'only treats confirmed official HTTP $status as $expected after provider failure',
    async ({ status, expected }) => {
      active!.dispose()
      ipc.removeAllListeners()
      const fetchRelease = vi.fn<() => Promise<Response>>(
        async () => new Response(null, { status }),
      )
      vi.stubGlobal('fetch', fetchRelease)
      mocks.check.mockRejectedValueOnce(new Error('No published versions on GitHub'))
      active = await createNativeUpdater({
        workspace: () => ({ window: workspace as unknown as BrowserWindow, surface }),
        closeHost,
        setPreparing: preparing,
        menuChanged: vi.fn<() => void>(),
      })
      await active.controller.check()
      expect(active.controller.getState().status).toBe(expected)
      expect(fetchRelease).toHaveBeenCalledWith(
        'https://api.github.com/repos/bijinfeng/mimir/releases/latest',
        expect.objectContaining({ headers: { Accept: 'application/vnd.github+json' } }),
      )
      expect(mocks.installed).not.toHaveBeenCalled()
    },
  )
  it.each([
    { platform: 'linux', appImage: '', writable: true, expected: 'manual' },
    { platform: 'linux', appImage: '/test/mimir.AppImage', writable: false, expected: 'manual' },
    { platform: 'linux', appImage: '/test/mimir.AppImage', writable: true, expected: 'automatic' },
    { platform: 'win32', appImage: '', writable: false, expected: 'manual' },
    { platform: 'win32', appImage: '', writable: true, expected: 'automatic' },
  ])('enforces $platform / writable $writable / AppImage $appImage', async (policy) => {
    active!.dispose()
    ipc.removeAllListeners()
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: policy.platform })
    vi.stubEnv('APPIMAGE', policy.appImage)
    mocks.writable = policy.writable
    active = await createNativeUpdater({
      workspace: () => ({ window: workspace as unknown as BrowserWindow, surface }),
      closeHost,
      setPreparing: preparing,
      menuChanged: vi.fn<() => void>(),
    })
    expect(active.controller.getState().capability).toBe(policy.expected)
  })
  it('unsigned macOS and development mode cannot inherit automatic installation', async () => {
    active!.dispose()
    ipc.removeAllListeners()
    await writeFile(
      join(mocks.directory, 'package.json'),
      JSON.stringify({ desktopUpdateMode: 'manual' }),
    )
    active = await createNativeUpdater({
      workspace: () => ({ window: workspace as unknown as BrowserWindow, surface }),
      closeHost,
      setPreparing: preparing,
      menuChanged: vi.fn<() => void>(),
    })
    expect(active.controller.getState().capability).toBe('manual')
    active.dispose()
    ipc.removeAllListeners()
    mocks.packaged = false
    active = await createNativeUpdater({
      workspace: () => ({ window: workspace as unknown as BrowserWindow, surface }),
      closeHost,
      setPreparing: preparing,
      menuChanged: vi.fn<() => void>(),
    })
    expect(active.controller.getState().capability).toBe('disabled')
  })
})
