import type { DocumentDetail } from '@mimir/shared'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, ApiRequestError } from './api'

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

/** 每次读取都以 GET 的授权结果为准，不用旧缓存补回失败文档的标题。 */
export async function loadRecentDocuments(userId: string) {
  const ids = readRecentIds(userId)
  const results = await Promise.allSettled(ids.map((id) => api.documents.get(id)))
  const items: DocumentDetail[] = []
  let retryableFailureCount = 0
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(result.value)
    } else {
      const error: unknown = result.reason
      // 鉴权失败仍交还 query，不能伪装成普通空态或部分成功。
      if (error instanceof ApiRequestError && error.status === 401) throw error
      if (error instanceof ApiRequestError && (error.status === 403 || error.status === 404))
        continue
      retryableFailureCount += 1
    }
  }
  return { items, retryableFailureCount }
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

  const query = useQuery({
    queryKey: ['recent-documents', userId, revision],
    enabled: Boolean(userId),
    queryFn: () => loadRecentDocuments(userId!),
  })
  return {
    ...query,
    // 保留 CommandPalette 已有的数组消费合同。
    data: query.isError ? undefined : query.data?.items,
    retryableFailureCount: query.data?.retryableFailureCount ?? 0,
  }
}
