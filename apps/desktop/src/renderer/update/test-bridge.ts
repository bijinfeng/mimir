import type {
  DesktopUpdateApi,
  DesktopUpdateState,
  MimirUpdaterBridge,
} from '@mimir/shared/desktop'

export function makeUpdateBridge(initial: Partial<DesktopUpdateState> = {}) {
  let state: DesktopUpdateState = {
    status: 'idle',
    currentVersion: '0.1.0',
    releaseUrl: 'https://github.com/bijinfeng/mimir/releases',
    platform: 'linux',
    arch: 'x64',
    capability: 'automatic',
    autoDownload: true,
    ...initial,
  }
  const listeners = new Set<(value: DesktopUpdateState) => void>()
  const calls: string[] = []
  const api: MimirUpdaterBridge & DesktopUpdateApi = {
    getState: async () => state,
    onState: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setAppearance: () => {},
    open: () => {
      calls.push('open')
    },
    check: async () => {
      calls.push('check')
    },
    download: async () => {
      calls.push('download')
    },
    install: async (confirmed) => {
      calls.push(confirmed ? 'install-confirmed' : 'install')
    },
    setAutoDownload: async (enabled) => {
      calls.push(`autoDownload:${enabled}`)
    },
    openRelease: async () => {
      calls.push('release')
    },
    close: () => {
      calls.push('close')
    },
    returnToDocument: () => {
      calls.push('document')
    },
    onPrepare: () => () => {},
    respondPrepare: () => {},
    onPrepareCancelled: () => () => {},
  }
  return {
    api,
    calls,
    emit: (value: Partial<DesktopUpdateState>) => {
      state = { ...state, ...value }
      for (const listener of listeners) listener(state)
    },
  }
}
