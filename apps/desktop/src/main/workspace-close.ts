import type { BrowserWindow } from 'electron'

/** Explain ordinary native-close vetoes without bypassing the page's leave guard. */
export function installCloseFeedback(
  target: BrowserWindow,
  preparingUpdate: () => boolean,
  notify: () => Promise<unknown>,
): void {
  let notifying = false
  target.webContents.on('will-prevent-unload', async () => {
    if (preparingUpdate() || notifying) return
    notifying = true
    try {
      await notify()
    } catch (error) {
      console.warn('[desktop] 无法显示关闭提示：', error)
    } finally {
      notifying = false
    }
  })
}

/** A real native close must complete; beforeunload is never bypassed. */
export function closeWorkspace(target: BrowserWindow, timeoutMs = 15_000): Promise<void> {
  if (target.isDestroyed()) return Promise.resolve()
  // The native BrowserWindow getter throws once `closed` fires; retain the emitter now.
  const contents = target.webContents
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error('工作区未能关闭，请返回文档后重试。')),
      timeoutMs,
    )
    const closed = (): void => finish()
    const prevented = (): void => finish(new Error('文档阻止了关闭，请先保存当前内容。'))
    const finish = (error?: Error): void => {
      clearTimeout(timer)
      target.off('closed', closed)
      contents.off('will-prevent-unload', prevented)
      if (error) reject(error)
      else resolve()
    }
    target.once('closed', closed)
    contents.once('will-prevent-unload', prevented)
    try {
      target.close()
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

/** Suppress normal quit only while a successfully closed workspace is being replaced. */
export class WorkspaceTransition {
  private active = false
  get transitioning(): boolean {
    return this.active
  }
  async replace(previous: BrowserWindow, createReplacement: () => void): Promise<void> {
    if (this.active) throw new Error('工作区正在切换，请稍后再试。')
    this.active = true
    try {
      await closeWorkspace(previous)
      createReplacement()
    } finally {
      this.active = false
    }
  }
}
