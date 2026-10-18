import Taro from '@tarojs/taro'
import type { MiniappSession } from '@mimir/shared/miniapp'

export const origin = MIMIR_SERVER_ORIGIN
export type StoredSession = MiniappSession & { token: string }
const prefix = `mimir:v1:${encodeURIComponent(origin)}:`
const sessionKey = `${prefix}session`
export function readStorage<T>(key: string): T | null {
  try {
    return (Taro.getStorageSync(key) as T) || null
  } catch {
    return null
  }
}
export function writeStorage(key: string, value: unknown) {
  try {
    Taro.setStorageSync(key, value)
  } catch {
    throw new Error('本机存储空间不足，输入仍保留在页面中。请先复制内容，释放空间后再试。')
  }
}
export function ownerPrefix(ownerId: string) {
  return `${prefix}owner:${encodeURIComponent(ownerId)}:`
}
export function localKey(ownerId: string, kind: string) {
  return `${ownerPrefix(ownerId)}${kind}`
}
export function readSession() {
  return readStorage<StoredSession>(sessionKey)
}
export function saveSession(session: StoredSession | null) {
  if (session) writeStorage(sessionKey, session)
  else Taro.removeStorageSync(sessionKey)
}
export function clearOwner(ownerId: string) {
  const keys = Taro.getStorageInfoSync().keys.filter((key) => key.startsWith(ownerPrefix(ownerId)))
  keys.forEach((key) => Taro.removeStorageSync(key))
}
export function ownerDraftCount(ownerId: string) {
  return Taro.getStorageInfoSync().keys.filter((key) => key.startsWith(localKey(ownerId, 'draft:')))
    .length
}
export function requestId() {
  return `mp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}_${Math.random().toString(36).slice(2, 12)}`
}
export interface NoteDraft {
  identity: string
  documentId: string | null
  mode: 'edit' | 'append' | 'metadata' | 'new'
  title: string
  body: string
  tags: string[]
  folder: string
  revision: string
  updatedAt: string
  pendingRequestId?: string
}
export function draftKey(ownerId: string, identity: string) {
  return localKey(ownerId, `draft:${identity}`)
}
export function ownerDrafts(ownerId: string): NoteDraft[] {
  return Taro.getStorageInfoSync()
    .keys.filter((key) => key.startsWith(localKey(ownerId, 'draft:')))
    .map((key) => readStorage<NoteDraft>(key))
    .filter((draft): draft is NoteDraft => Boolean(draft))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}
