/** Shared shutdown gate. A timeout never authorizes installation or a second host. */
export class HostShutdown {
  private closing: Promise<void> | null = null
  constructor(
    private readonly closeHost: () => Promise<void>,
    private readonly timeoutMs = 15_000,
  ) {}
  close(beforeClose?: () => Promise<void>): Promise<void> {
    if (this.closing) return this.closing
    this.closing = new Promise<void>((resolve, reject) => {
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        reject(new Error('宿主关闭超时'))
      }, this.timeoutMs)
      void Promise.resolve()
        .then(async () => {
          await beforeClose?.()
          if (!timedOut) await this.closeHost()
        })
        .then(resolve, reject)
        .finally(() => clearTimeout(timer))
    })
    return this.closing
  }
}
