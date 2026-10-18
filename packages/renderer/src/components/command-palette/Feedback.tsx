import type { DocumentDetail } from '@mimir/shared'
import type { UseQueryResult } from '@tanstack/react-query'
import { Button } from 'antd'
import { ApiRequestError } from '../../lib/api'
import type { useRecentDocuments } from '../../lib/recent-documents'
import { useStyles } from './styles'

export function RecentFeedback({
  query,
  userId,
  hasNotes,
  busy,
  onRetry,
}: {
  query: ReturnType<typeof useRecentDocuments>
  userId?: string
  hasNotes: boolean
  busy: boolean
  onRetry: () => void
}) {
  const { styles } = useStyles()
  const failed = query.isError || query.retryableFailureCount > 0
  return (
    <>
      {query.isFetching && !query.isPending && !failed && (
        <div className={styles.status} role="status">
          正在更新最近笔记…
        </div>
      )}
      {userId && query.isPending && (
        <div className={styles.status} role="status">
          正在读取最近笔记…
        </div>
      )}
      {!query.isPending && !failed && !hasNotes && (
        <div className={styles.status}>还没有最近打开的笔记</div>
      )}
      {failed && (
        <div className={styles.status} role="status">
          <span>
            {query.error instanceof ApiRequestError && query.error.status === 401
              ? '登录状态已失效，请重新登录后重试'
              : hasNotes
                ? '部分笔记暂时无法读取，已读到的仍可打开'
                : '最近笔记暂时无法读取'}
          </span>
          <Button
            type="link"
            size="small"
            loading={query.isFetching}
            disabled={busy || query.isFetching}
            onClick={onRetry}
          >
            重试最近笔记
          </Button>
        </div>
      )}
    </>
  )
}

export function CommandFeedback({
  currentDocumentId,
  query,
  creatingNote,
  error,
  busy,
  onRetry,
}: {
  currentDocumentId?: string
  query: UseQueryResult<DocumentDetail, Error>
  creatingNote?: boolean
  error?: string | null
  busy: boolean
  onRetry: () => void
}) {
  const { styles } = useStyles()
  return (
    <>
      {currentDocumentId && (!query.data || query.isError) && (
        <div className={styles.status} role="status">
          <span>{query.isError ? '当前文档操作暂时无法读取' : '正在读取当前文档操作…'}</span>
          {query.isError && (
            <Button
              type="link"
              size="small"
              disabled={busy || query.isFetching}
              onClick={() => void query.refetch()}
            >
              重试文档操作
            </Button>
          )}
        </div>
      )}
      {creatingNote && (
        <div className={styles.status} role="status">
          正在创建笔记，请稍候…
        </div>
      )}
      {error && (
        <div className={styles.status} role="alert">
          <span>{error}</span>
          <Button type="link" size="small" disabled={busy} onClick={onRetry}>
            重试新建笔记
          </Button>
        </div>
      )}
    </>
  )
}
