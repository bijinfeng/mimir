import type { DocumentDetail } from '@mimir/shared'
import type { UseQueryResult } from '@tanstack/react-query'
import { Button } from 'antd'
import { CircleAlert, LoaderCircle, Search } from 'lucide-react'
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
  const unauthorized = query.error instanceof ApiRequestError && query.error.status === 401
  if (!userId) return <div className={styles.status}>等待账号信息后显示最近笔记</div>
  if (query.isPending || (query.isFetching && !failed))
    return (
      <div className={styles.status} role="status">
        <span className={styles.loading} data-loading>
          <LoaderCircle size={14} className={styles.spin} aria-hidden />
          {query.isPending ? '正在读取最近笔记…' : '正在更新最近笔记…'}
        </span>
      </div>
    )
  if (failed)
    return (
      <div className={styles.status} role="status">
        <CircleAlert size={15} aria-hidden />
        <span>
          {unauthorized
            ? '登录状态已失效，请重新确认账号'
            : hasNotes
              ? '部分最近笔记暂时无法读取'
              : '最近笔记暂时无法读取'}
        </span>
        <Button
          autoInsertSpace={false}
          type="link"
          className={styles.textAction}
          size="small"
          aria-label="重试最近笔记"
          loading={query.isFetching}
          disabled={busy || query.isFetching || unauthorized}
          onClick={onRetry}
        >
          {unauthorized ? '需要重新登录' : '重试'}
        </Button>
      </div>
    )
  if (query.storageUnavailable)
    return <div className={styles.status}>暂时无法读取本机最近记录，仍可搜索文档</div>
  if (!hasNotes) return <div className={styles.status}>还没有最近打开的笔记</div>
  return null
}

export function SearchFeedback({
  hasHits,
  pending,
  error,
  unauthorized,
  busy,
  onRetry,
}: {
  hasHits: boolean
  pending: boolean
  error: boolean
  unauthorized: boolean
  busy: boolean
  onRetry: () => void
}) {
  const { styles, cx } = useStyles()
  if (hasHits) {
    if (!pending && !error) return null
    return (
      <p className={cx(styles.inlineFeedback, error && styles.errorText)} role="status">
        {pending ? (
          <>
            <LoaderCircle size={14} className={styles.spin} aria-hidden />
            正在更新当前搜索结果，暂不可打开
          </>
        ) : (
          <>
            <CircleAlert size={14} aria-hidden />
            {unauthorized ? '登录状态已失效，请重新确认账号' : '本次更新失败，下方仍是此前结果'}
            <Button
              autoInsertSpace={false}
              type="link"
              className={styles.textAction}
              aria-label="重试搜索"
              disabled={busy || unauthorized}
              onClick={onRetry}
            >
              {unauthorized ? '需要重新登录' : '重试'}
            </Button>
          </>
        )}
      </p>
    )
  }
  return (
    <div className={styles.queryFeedback} role="status">
      {pending ? (
        <>
          <LoaderCircle size={21} className={styles.spin} aria-hidden />
          <strong>正在检索文档</strong>
          <span>结果到达后，再打开所选内容</span>
        </>
      ) : error ? (
        <>
          <CircleAlert size={21} aria-hidden />
          <strong>{unauthorized ? '登录状态已失效' : '暂时无法完成搜索'}</strong>
          <span>{unauthorized ? '请重新确认账号后再试' : '输入已保留，可以原词重试'}</span>
          <Button
            autoInsertSpace={false}
            className={styles.outlineAction}
            disabled={busy || unauthorized}
            onClick={onRetry}
          >
            {unauthorized ? '需要重新登录' : '重试搜索'}
          </Button>
        </>
      ) : (
        <>
          <Search size={22} aria-hidden />
          <strong>没有匹配的文档</strong>
          <span>试试更短的词，或把问题带到新对话</span>
        </>
      )}
    </div>
  )
}

export function CommandFeedback({
  currentDocumentId,
  query,
  busy,
}: {
  currentDocumentId?: string
  query: UseQueryResult<DocumentDetail, Error>
  busy: boolean
}) {
  const { styles } = useStyles()
  if (!currentDocumentId || (query.data && !query.isError)) return null
  return (
    <div className={styles.inlineFeedback} role="status">
      {query.isError ? (
        <CircleAlert size={14} aria-hidden />
      ) : (
        <LoaderCircle size={14} className={styles.spin} aria-hidden />
      )}
      <span>{query.isError ? '当前文档信息读取失败' : '正在读取当前文档信息'}</span>
      {query.isError && (
        <Button
          autoInsertSpace={false}
          type="link"
          size="small"
          className={styles.textAction}
          aria-label="重试文档操作"
          disabled={busy || query.isFetching}
          onClick={() => void query.refetch()}
        >
          重试
        </Button>
      )}
    </div>
  )
}

export function NewNoteFeedback({
  creatingNote,
  error,
  retryable = true,
  busy,
  onRetry,
}: {
  creatingNote?: boolean
  error?: string | null
  retryable?: boolean
  busy: boolean
  onRetry: () => void
}) {
  const { styles, cx } = useStyles()
  return (
    <>
      {error && (
        <div className={styles.actionError} role="alert">
          <CircleAlert size={15} aria-hidden />
          <span>{error}</span>
          {retryable && (
            <Button
              autoInsertSpace={false}
              type="link"
              size="small"
              className={styles.textAction}
              aria-label="重试新建笔记"
              disabled={busy}
              onClick={onRetry}
            >
              重试创建
            </Button>
          )}
        </div>
      )}
      {creatingNote && (
        <div className={cx(styles.inlineFeedback, styles.pendingCreate)} role="status">
          <span className={styles.loading}>
            <LoaderCircle size={14} className={styles.spin} aria-hidden />
            正在创建笔记…
          </span>
          <span>请等待创建结果</span>
        </div>
      )}
    </>
  )
}
