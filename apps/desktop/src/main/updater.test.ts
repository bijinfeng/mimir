import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isNewerStable,
  UpdateBlocked,
  UpdateController,
  type UpdateControllerOptions,
} from './updater.js'
import { HostShutdown } from './host-shutdown.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture(overrides: Partial<UpdateControllerOptions> = {}) {
  const driver = {
    check: vi.fn<() => Promise<{ version: string; releaseNotes: string }>>(async () => ({
      version: '0.2.0',
      releaseNotes: '修复与改进',
    })),
    download: vi.fn<() => Promise<void>>(async () => {}),
    install: vi.fn<() => void>(),
  }
  const persist = vi.fn<() => Promise<void>>(async () => {})
  const notify = vi.fn<() => void>()
  const prepareInstall = vi.fn<() => Promise<void>>(async () => {})
  const controller = new UpdateController({
    currentVersion: '0.1.0',
    platform: 'win32',
    arch: 'x64',
    capability: 'automatic',
    preferences: { autoDownload: true },
    driver,
    persist,
    notify,
    prepareInstall,
    log: vi.fn<(error: unknown) => void>(),
    ...overrides,
  })
  return { controller, driver, persist, notify, prepareInstall }
}
afterEach(() => vi.useRealTimers())

describe('desktop update controller', () => {
  it('only accepts newer stable semantic versions', () => {
    expect(isNewerStable('0.2.0', '0.1.0')).toBe(true)
    for (const version of ['0.1.0', '0.0.9', '0.2.0-beta.1', '../malicious', '01.2.0']) {
      expect(isNewerStable(version, '0.1.0')).toBe(false)
    }
  })
  it('deduplicates checks and download while preserving unknown-total and verification stages', async () => {
    const check = deferred<{ version: string; releaseNotes: string }>()
    const download = deferred<void>()
    const f = fixture()
    f.driver.check.mockImplementation(() => check.promise)
    f.driver.download.mockImplementation(() => download.promise)
    const first = f.controller.check()
    expect(f.controller.check()).toBe(first)
    expect(f.driver.check).toHaveBeenCalledOnce()
    check.resolve({ version: '0.2.0', releaseNotes: '修复' })
    await Promise.resolve()
    await Promise.resolve()
    expect(f.driver.download).toHaveBeenCalledOnce()
    f.controller.progress(2048, 0)
    expect(f.controller.getState().progress).toEqual({
      transferred: 2048,
      total: undefined,
      percent: undefined,
    })
    f.controller.progress(4096, 4096)
    expect(f.controller.getState().status).toBe('preparing')
    expect(f.controller.install()).toBe(first)
    expect(f.driver.install).not.toHaveBeenCalled()
    download.resolve()
    await first
    expect(f.controller.getState().status).toBe('downloaded')
    expect(f.notify).toHaveBeenCalledWith('0.2.0', false)
    expect(f.driver.install).not.toHaveBeenCalled()
  })
  it('retains downloaded state across detail subscriptions and never installs on dispose', async () => {
    const f = fixture()
    const listener = vi.fn<() => void>()
    const off = f.controller.subscribe(listener)
    await f.controller.check()
    off()
    const after = vi.fn<() => void>()
    f.controller.subscribe(after)
    expect(f.controller.getState().status).toBe('downloaded')
    f.controller.dispose()
    expect(f.driver.install).not.toHaveBeenCalled()
    await f.controller.install()
    expect(f.driver.install).not.toHaveBeenCalled()
  })
  it('deduplicates ready notifications persistently and suppresses late download completion', async () => {
    const f = fixture({ preferences: { autoDownload: true, notifiedVersion: '0.2.0' } })
    await f.controller.check()
    expect(f.notify).not.toHaveBeenCalled()
    const next = fixture()
    const download = deferred<void>()
    next.driver.download.mockImplementation(() => download.promise)
    const operation = next.controller.check()
    await Promise.resolve()
    await Promise.resolve()
    next.controller.dispose()
    download.resolve()
    await operation
    expect(next.notify).not.toHaveBeenCalled()
  })
  it('persists automatic download preference and respects it for subsequent versions', async () => {
    const f = fixture()
    await f.controller.setAutoDownload(false)
    await f.controller.check()
    expect(f.persist).toHaveBeenCalledWith({ autoDownload: false })
    expect(f.driver.download).not.toHaveBeenCalled()
    expect(f.controller.getState().status).toBe('available')
    await f.controller.setAutoDownload(true)
    expect(f.driver.download).toHaveBeenCalledOnce()
  })
  it('manual and development modes never download or call an installer', async () => {
    for (const capability of ['manual', 'disabled'] as const) {
      const f = fixture({ capability })
      await f.controller.check()
      await f.controller.download()
      await f.controller.install(true)
      expect(f.driver.download).not.toHaveBeenCalled()
      expect(f.driver.install).not.toHaveBeenCalled()
      expect(f.driver.check).toHaveBeenCalledTimes(capability === 'disabled' ? 0 : 1)
    }
  })
  it('retries failed download without making unchecked bytes installable', async () => {
    const f = fixture()
    f.driver.download.mockRejectedValueOnce(new Error('hash mismatch'))
    await f.controller.check()
    expect(f.controller.getState()).toMatchObject({ status: 'error', retry: 'download' })
    await f.controller.install()
    expect(f.driver.install).not.toHaveBeenCalled()
    await f.controller.download()
    expect(f.controller.getState().status).toBe('downloaded')
  })
  it('waits for the close gate and executes a duplicate restart only once', async () => {
    const closing = deferred<void>()
    const f = fixture()
    await f.controller.check()
    f.prepareInstall.mockImplementation(() => closing.promise)
    const install = f.controller.install()
    expect(f.controller.install()).toBe(install)
    expect(f.driver.install).not.toHaveBeenCalled()
    closing.resolve()
    await install
    expect(f.driver.install).toHaveBeenCalledOnce()
    await f.controller.install()
    expect(f.driver.install).toHaveBeenCalledOnce()
  })
  it('preserves ready download on save veto and only accepts explicit cloud confirmation', async () => {
    const f = fixture()
    await f.controller.check()
    f.prepareInstall.mockRejectedValueOnce(new UpdateBlocked('请先保存', true))
    await f.controller.install()
    expect(f.controller.getState()).toMatchObject({
      status: 'blocked',
      requiresSaveConfirmation: true,
    })
    expect(f.driver.install).not.toHaveBeenCalled()
    await f.controller.install(true)
    expect(f.prepareInstall).toHaveBeenLastCalledWith(true)
    expect(f.driver.install).toHaveBeenCalledOnce()
  })
  it('requires client recovery if launching an installer fails after workspace shutdown', async () => {
    const f = fixture()
    await f.controller.check()
    f.driver.install.mockImplementation(() => {
      throw new Error('installer missing')
    })
    await f.controller.install()
    expect(f.controller.getState()).toMatchObject({
      status: 'blocked',
      recoveryRequired: true,
      retry: undefined,
    })
    await f.controller.install()
    expect(f.driver.install).toHaveBeenCalledOnce()
  })
  it('keeps background checks quiet and schedules once every six hours', async () => {
    vi.useFakeTimers()
    const f = fixture({ preferences: { autoDownload: false, lastRunVersion: '0.1.0' } })
    f.controller.start()
    f.controller.start()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(f.driver.check).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
    expect(f.driver.check).toHaveBeenCalledTimes(2)
    f.controller.dispose()
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
    expect(f.driver.check).toHaveBeenCalledTimes(2)
    expect(f.notify).not.toHaveBeenCalled()
  })
  it('reports an actual successful version change once, never on initial install or downgrade', () => {
    for (const previous of [undefined, '0.2.0', '0.1.0']) {
      const f = fixture({ preferences: { autoDownload: false, lastRunVersion: previous } })
      f.controller.start()
      expect(f.notify).not.toHaveBeenCalled()
      f.controller.dispose()
    }
    const f = fixture({ preferences: { autoDownload: false, lastRunVersion: '0.0.9' } })
    f.controller.start()
    expect(f.notify).toHaveBeenCalledWith('0.1.0', true)
    f.controller.dispose()
  })
  it('keeps scheduled checks working when the operating system rejects an upgrade notification', async () => {
    vi.useFakeTimers()
    const notify = vi.fn<() => void>(() => {
      throw new Error('notifications unavailable')
    })
    const f = fixture({ preferences: { autoDownload: false, lastRunVersion: '0.0.9' }, notify })
    expect(() => f.controller.start()).not.toThrow()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(f.driver.check).toHaveBeenCalledOnce()
    f.controller.dispose()
  })
})

describe('host shutdown coordinator', () => {
  it('deduplicates pending closes and retains failure', async () => {
    const close = deferred<void>()
    const shutdown = vi.fn<() => Promise<void>>(() => close.promise)
    const coordinator = new HostShutdown(shutdown)
    const operation = coordinator.close()
    expect(coordinator.close()).toBe(operation)
    close.reject(new Error('database busy'))
    await expect(operation).rejects.toThrow('database busy')
    await expect(coordinator.close()).rejects.toThrow('database busy')
    expect(shutdown).toHaveBeenCalledOnce()
  })
  it('never turns a timeout or late success into permission to install', async () => {
    vi.useFakeTimers()
    const close = deferred<void>()
    const coordinator = new HostShutdown(() => close.promise, 100)
    const operation = coordinator.close()
    const failure = operation.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(100)
    await expect(failure).resolves.toMatchObject({ message: '宿主关闭超时' })
    close.resolve()
    await expect(coordinator.close()).rejects.toThrow('宿主关闭超时')
  })
})
