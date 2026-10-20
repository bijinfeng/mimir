/** Shared shutdown gate. A timeout never authorizes installation or a second host. */
export class HostShutdown {
  private closing: Promise<void> | null = null
  constructor(
    private readonly closeHost: () => Promise<void>,
    private readonly timeoutMs = 15_000,
  ) {}
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closing = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('宿主关闭超时')), this.timeoutMs)
      void Promise.resolve()
        .then(this.closeHost)
        .then(resolve, reject)
        .finally(() => clearTimeout(timer))
    })
    return this.closing
  }
}
