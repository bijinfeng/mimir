import type { DesktopPlatform, DesktopUpdateState } from '@mimir/shared/desktop'

export const RELEASES_URL = 'https://github.com/bijinfeng/mimir/releases'
export interface UpdateInfo {
  version: string
  releaseNotes?: string | { version: string; note: string | null }[] | null
}
export interface UpdateDriver {
  check(): Promise<UpdateInfo | null>
  download(): Promise<void>
  install(): void
}
export interface UpdatePreferences {
  autoDownload: boolean
  notifiedVersion?: string
  lastRunVersion?: string
}
export interface UpdateControllerOptions {
  currentVersion: string
  platform: DesktopPlatform
  arch: string
  capability: DesktopUpdateState['capability']
  manualReason?: string
  preferences: UpdatePreferences
  persist(preferences: UpdatePreferences): Promise<void>
  driver: UpdateDriver
  prepareInstall(cloudSavedConfirmed: boolean): Promise<void>
  notify(version: string, upgraded: boolean): void
  log(error: unknown): void
}

/** Installation failures distinguish a recoverable save refusal from a closed host. */
export class UpdateBlocked extends Error {
  constructor(
    message: string,
    public readonly requiresSaveConfirmation = false,
    public readonly recoveryRequired = false,
  ) {
    super(message)
  }
}

function stableParts(version: string): number[] | null {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return null
  return version.split('.').map(Number)
}
export function isNewerStable(candidate: string, current: string): boolean {
  const next = stableParts(candidate)
  const previous = stableParts(current)
  if (!next || !previous) return false
  for (let index = 0; index < 3; index++) {
    if (next[index] !== previous[index]) return next[index]! > previous[index]!
  }
  return false
}

/** No Electron dependency: tests exercise overlapping requests and late events directly. */
export class UpdateController {
  private state: DesktopUpdateState
  private readonly listeners = new Set<(state: DesktopUpdateState) => void>()
  private operation: Promise<void> | null = null
  private disposed = false
  private timers: ReturnType<typeof setTimeout>[] = []
  private persistence: Promise<void> = Promise.resolve()
  private downloadedVersion: string | null = null
  private installerStarted = false
  private readonly preferences: UpdatePreferences

  constructor(private readonly options: UpdateControllerOptions) {
    this.preferences = { ...options.preferences }
    this.state = {
      status: options.capability === 'disabled' ? 'disabled' : 'idle',
      currentVersion: options.currentVersion,
      releaseUrl: RELEASES_URL,
      platform: options.platform,
      arch: options.arch,
      capability: options.capability,
      autoDownload: options.capability === 'automatic' && this.preferences.autoDownload,
      message: options.manualReason,
    }
  }

  getState(): DesktopUpdateState {
    return {
      ...this.state,
      ...(this.state.progress ? { progress: { ...this.state.progress } } : {}),
    }
  }

  subscribe(listener: (state: DesktopUpdateState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(patch: Partial<DesktopUpdateState>): void {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.getState())
  }

  private persist(): Promise<void> {
    const snapshot = { ...this.preferences }
    this.persistence = this.persistence.catch(() => {}).then(() => this.options.persist(snapshot))
    return this.persistence
  }

  start(): void {
    if (this.disposed || this.timers.length || this.state.capability === 'disabled') return
    if (this.preferences.lastRunVersion !== this.state.currentVersion) {
      if (
        this.preferences.lastRunVersion &&
        isNewerStable(this.state.currentVersion, this.preferences.lastRunVersion)
      ) {
        try {
          this.options.notify(this.state.currentVersion, true)
        } catch (error) {
          this.options.log(error)
        }
      }
      this.preferences.lastRunVersion = this.state.currentVersion
      void this.persist().catch(this.options.log)
    }
    const initial = setTimeout(() => void this.check(), 15_000)
    const interval = setInterval(() => void this.check(), 6 * 60 * 60 * 1000)
    initial.unref?.()
    interval.unref?.()
    this.timers = [initial, interval]
  }

  dispose(): void {
    this.disposed = true
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
    this.listeners.clear()
  }

  async setAutoDownload(enabled: boolean): Promise<void> {
    if (this.state.capability !== 'automatic' || this.disposed) return
    this.preferences.autoDownload = enabled
    try {
      await this.persist()
      this.publish({ autoDownload: enabled })
      if (enabled && this.state.status === 'available') await this.download()
    } catch (error) {
      this.options.log(error)
      this.publish({ message: '无法保存更新偏好，请重试。' })
    }
  }

  check(): Promise<void> {
    if (this.operation) return this.operation
    if (
      this.disposed ||
      this.state.capability === 'disabled' ||
      ['downloaded', 'blocked', 'restarting'].includes(this.state.status)
    )
      return Promise.resolve()
    this.operation = this.runCheck().finally(() => {
      this.operation = null
    })
    return this.operation
  }

  private async runCheck(): Promise<void> {
    this.publish({ status: 'checking', message: undefined, retry: undefined, progress: undefined })
    let download = false
    try {
      const info = await this.options.driver.check()
      if (this.disposed) return
      const checkedAt = new Date().toISOString()
      if (!info) {
        this.publish({
          status: 'unpublished',
          checkedAt,
          version: undefined,
          releaseNotes: undefined,
        })
      } else if (!isNewerStable(info.version, this.state.currentVersion)) {
        this.publish({ status: 'current', checkedAt, version: undefined, releaseNotes: undefined })
      } else {
        const notes =
          typeof info.releaseNotes === 'string'
            ? info.releaseNotes
            : info.releaseNotes
                ?.map((note) => note.note ?? '')
                .filter(Boolean)
                .join('\n\n')
        this.publish({
          status: 'available',
          version: info.version,
          releaseNotes: notes || undefined,
          releaseUrl: `${RELEASES_URL}/tag/v${info.version}`,
          checkedAt,
        })
        download = this.state.autoDownload
      }
    } catch (error) {
      if (this.disposed) return
      this.options.log(error)
      this.publish({
        status: 'error',
        retry: 'check',
        message: '暂时无法检查更新，请检查网络后重试。',
      })
    }
    // Keep the single operation gate held while automatic download runs.
    if (download) await this.runDownload()
  }

  download(): Promise<void> {
    if (this.operation) return this.operation
    if (
      this.disposed ||
      this.state.capability !== 'automatic' ||
      !this.state.version ||
      !['available', 'error'].includes(this.state.status)
    )
      return Promise.resolve()
    this.operation = this.runDownload().finally(() => {
      this.operation = null
    })
    return this.operation
  }

  private async runDownload(): Promise<void> {
    this.downloadedVersion = null
    this.publish({
      status: 'downloading',
      message: undefined,
      retry: undefined,
      progress: undefined,
    })
    try {
      await this.options.driver.download()
      if (this.disposed) return
      // electron-updater resolves only after hash verification / preparation.
      this.downloadedVersion = this.state.version ?? null
      const version = this.state.version!
      let shouldNotify = false
      if (this.preferences.notifiedVersion !== version) {
        this.preferences.notifiedVersion = version
        try {
          await this.persist()
          shouldNotify = true
        } catch (error) {
          this.options.log(error)
        }
      }
      if (this.disposed) return
      this.publish({ status: 'downloaded', progress: undefined })
      if (shouldNotify) {
        try {
          this.options.notify(version, false)
        } catch (error) {
          this.options.log(error)
        }
      }
    } catch (error) {
      this.options.log(error)
      this.publish({
        status: 'error',
        progress: undefined,
        retry: 'download',
        message: '下载未完成或更新文件未通过检查，请重新下载。',
      })
    }
  }

  progress(transferred: number, total: number): void {
    if (this.state.status !== 'downloading' || this.disposed) return
    const knownTotal = Number.isFinite(total) && total > 0 ? total : undefined
    const downloaded = Number.isFinite(transferred) ? Math.max(0, transferred) : 0
    const percent = knownTotal ? Math.min(100, (downloaded / knownTotal) * 100) : undefined
    this.publish({
      status: percent === 100 ? 'preparing' : 'downloading',
      progress: { transferred: downloaded, total: knownTotal, percent },
    })
  }

  install(cloudSavedConfirmed = false): Promise<void> {
    if (this.operation) return this.operation
    if (
      this.disposed ||
      this.state.capability !== 'automatic' ||
      this.state.recoveryRequired ||
      this.downloadedVersion !== this.state.version ||
      !['downloaded', 'blocked'].includes(this.state.status)
    )
      return Promise.resolve()
    this.operation = this.runInstall(cloudSavedConfirmed).finally(() => {
      this.operation = null
    })
    return this.operation
  }

  private async runInstall(cloudSavedConfirmed: boolean): Promise<void> {
    this.publish({
      status: 'restarting',
      message: undefined,
      retry: undefined,
      requiresSaveConfirmation: false,
      recoveryRequired: false,
    })
    let workspaceClosed = false
    try {
      await this.options.prepareInstall(cloudSavedConfirmed)
      workspaceClosed = true
      if (!this.disposed) {
        this.installerStarted = true
        this.options.driver.install()
      }
    } catch (error) {
      this.options.log(error)
      this.publish({
        status: 'blocked',
        retry:
          workspaceClosed || (error instanceof UpdateBlocked && error.recoveryRequired)
            ? undefined
            : 'install',
        recoveryRequired:
          workspaceClosed || (error instanceof UpdateBlocked && error.recoveryRequired),
        requiresSaveConfirmation: error instanceof UpdateBlocked && error.requiresSaveConfirmation,
        message:
          error instanceof UpdateBlocked
            ? error.message
            : '暂时无法完成重启，更新尚未安装。请重新启动客户端恢复使用。',
      })
    }
  }

  /** electron-updater reports installer launch failures through its error event. */
  installationFailed(error: unknown): void {
    if (!this.installerStarted || this.state.status !== 'restarting' || this.disposed) return
    this.options.log(error)
    this.publish({
      status: 'blocked',
      retry: undefined,
      recoveryRequired: true,
      requiresSaveConfirmation: false,
      message: '暂时无法完成重启，更新尚未安装。请重新启动客户端恢复使用。',
    })
  }
}
