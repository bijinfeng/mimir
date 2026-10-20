import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeWorkspace, installCloseFeedback, WorkspaceTransition } from './workspace-close.js'

class WindowFixture extends EventEmitter {
  private readonly contents = new EventEmitter()
  destroyed = false
  get webContents() {
    // Electron's native BrowserWindow getter becomes invalid before `closed` is emitted.
    if (this.destroyed) throw new Error('Object has been destroyed')
    return this.contents
  }
  close = vi.fn<() => void>(() => {})
  isDestroyed() {
    return this.destroyed
  }
  native(): BrowserWindow {
    return this as unknown as BrowserWindow
  }
  finishClose() {
    this.destroyed = true
    this.emit('closed')
  }
}
afterEach(() => vi.useRealTimers())
describe('ordinary close feedback', () => {
  it('explains the veto once, never bypasses it, and leaves update failures to their own UI', async () => {
    const target = new WindowFixture()
    let preparing = false
    let finish!: () => void
    const notify = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const preventDefault = vi.fn<() => void>()
    installCloseFeedback(target.native(), () => preparing, notify)
    target.webContents.emit('will-prevent-unload', { preventDefault })
    target.webContents.emit('will-prevent-unload', { preventDefault })
    expect(notify).toHaveBeenCalledOnce()
    expect(preventDefault).not.toHaveBeenCalled()
    finish()
    await Promise.resolve()
    preparing = true
    target.webContents.emit('will-prevent-unload', { preventDefault })
    expect(notify).toHaveBeenCalledOnce()
    preparing = false
    target.webContents.emit('will-prevent-unload', { preventDefault })
    expect(notify).toHaveBeenCalledTimes(2)
    finish()
    await Promise.resolve()
  })
})
describe('workspace replacement respects the native leave guard', () => {
  it('does not create or publish the replacement before the old workspace really closes', async () => {
    const previous = new WindowFixture()
    const transition = new WorkspaceTransition()
    let current: WindowFixture = previous
    const next = new WindowFixture()
    const create = vi.fn<() => void>(() => {
      current = next
    })
    let ordinaryQuit = false
    previous.on('closed', () => {
      ordinaryQuit = !transition.transitioning
    })
    const operation = transition.replace(previous.native(), create)
    expect(transition.transitioning).toBe(true)
    expect(current).toBe(previous)
    expect(create).not.toHaveBeenCalled()
    previous.finishClose()
    await operation
    expect(ordinaryQuit).toBe(false)
    expect(current).toBe(next)
    expect(create).toHaveBeenCalledOnce()
    expect(transition.transitioning).toBe(false)
  })
  it('keeps the tracked dirty workspace if beforeunload vetoes closing', async () => {
    const previous = new WindowFixture()
    const transition = new WorkspaceTransition()
    let current = previous
    const create = vi.fn<() => void>(() => {
      current = new WindowFixture()
    })
    previous.close.mockImplementation(() => {
      previous.webContents.emit('will-prevent-unload')
    })
    await expect(transition.replace(previous.native(), create)).rejects.toThrow('文档阻止')
    expect(current).toBe(previous)
    expect(previous.destroyed).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(transition.transitioning).toBe(false)
  })
  it('does not replace on timeout, close error, or duplicate transition', async () => {
    vi.useFakeTimers()
    const previous = new WindowFixture()
    const transition = new WorkspaceTransition()
    const create = vi.fn<() => void>()
    const operation = transition.replace(previous.native(), create).catch((error: unknown) => error)
    await expect(transition.replace(previous.native(), create)).rejects.toThrow('正在切换')
    await vi.advanceTimersByTimeAsync(15_000)
    await expect(operation).resolves.toMatchObject({
      message: '工作区未能关闭，请返回文档后重试。',
    })
    expect(create).not.toHaveBeenCalled()
    previous.close.mockImplementation(() => {
      throw new Error('native close failed')
    })
    await expect(transition.replace(previous.native(), create)).rejects.toThrow(
      'native close failed',
    )
    expect(create).not.toHaveBeenCalled()
    expect(transition.transitioning).toBe(false)
  })
  it('removes close/unload listeners when the attempt settles', async () => {
    const previous = new WindowFixture()
    const contents = previous.webContents
    previous.close.mockImplementation(() => previous.finishClose())
    await closeWorkspace(previous.native())
    expect(previous.listenerCount('closed')).toBe(0)
    expect(contents.listenerCount('will-prevent-unload')).toBe(0)
  })
  it('does not read native contents or close a window that is already destroyed', async () => {
    const previous = new WindowFixture()
    previous.destroyed = true
    await expect(closeWorkspace(previous.native())).resolves.toBeUndefined()
    expect(previous.close).not.toHaveBeenCalled()
  })
})
