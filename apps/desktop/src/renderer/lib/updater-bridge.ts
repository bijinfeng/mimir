import type { MimirUpdaterBridge } from '@mimir/shared/desktop'

declare global {
  interface Window {
    mimirUpdater?: MimirUpdaterBridge
  }
}

export const updaterBridge = typeof window === 'undefined' ? undefined : window.mimirUpdater
