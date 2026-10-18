import { useSyncExternalStore } from 'react'
import { readSession, saveSession, type StoredSession } from './storage'
let session: StoredSession | null | undefined
let reason = ''
const listeners = new Set<() => void>()
export function getSession() {
  if (session === undefined) session = readSession()
  if (session && Date.parse(session.expiresAt) <= Date.now()) {
    session = null
    reason = '登录已过期，请重新登录。草稿仍保留在本机。'
    saveSession(null)
  }
  return session
}
export function setSession(value: StoredSession | null, message = '') {
  saveSession(value)
  session = value
  reason = message
  listeners.forEach((listener) => listener())
}
export function sessionReason() {
  return reason
}
export function useSession() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSession,
    () => null,
  )
}
