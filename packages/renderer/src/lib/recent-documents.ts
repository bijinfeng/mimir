import type { DocumentDetail } from '@mimir/shared'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from './api'

const LIMIT = 12
const eventName = 'mimir:recent-documents'
const keyFor = (userId: string) => `mimir.recent-documents.${userId}`

export function readRecentIds(userId: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(keyFor(userId)) ?? '[]')
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, LIMIT)
      : []
  } catch {
    return []
  }
}

export function recordRecentDocument(userId: string, id: string): void {
  const ids = [id, ...readRecentIds(userId).filter((item) => item !== id)].slice(0, LIMIT)
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(ids))
  } catch {
    // 存储不可用时只失去跨页面的最近记录，不影响打开文档。
  }
  window.dispatchEvent(new Event(eventName))
}

/** 最近列表以文档 GET 为准，已删除或无权限的 ID 不呈现。 */
export function useRecentDocuments(userId: string | undefined) {
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    window.addEventListener(eventName, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(eventName, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return useQuery({
    queryKey: ['recent-documents', userId, revision],
    enabled: Boolean(userId),
    queryFn: async (): Promise<DocumentDetail[]> => {
      const ids = readRecentIds(userId!)
      const results = await Promise.allSettled(ids.map((id) => api.documents.get(id)))
      return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
    },
  })
}
