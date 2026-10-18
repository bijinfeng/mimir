import { useSyncExternalStore } from 'react'
import Taro from '@tarojs/taro'
let online = true
const listeners = new Set<() => void>()
let initialized = false
export function initializeNetwork() {
  if (initialized) return
  initialized = true
  const update = (connected: boolean) => {
    online = connected
    listeners.forEach((listener) => listener())
  }
  Taro.onNetworkStatusChange((event) => update(event.isConnected))
  void Taro.getNetworkType()
    .then((result) => update(result.networkType !== 'none'))
    .catch(() => undefined)
}
export function useOnline() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => online,
    () => true,
  )
}
