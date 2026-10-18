import { formatBytes, formatLabel } from '@mimir/shared'
import { CircleCheck, CircleX, Folder, LoaderCircle } from 'lucide-react'
import { useUploadStyles } from './upload-styles'
import { useCaptureStyles } from './styles'
export interface UploadRow {
  key: string
  name: string
  path: string
  size: number
  note: boolean
  state: 'pending' | 'uploading' | 'done' | 'failed'
  detail: string
  documentId: string | null
  uncertain?: boolean
}
export function UploadResultRow({ row, folder }: { row: UploadRow; folder?: string | null }) {
  const { styles: sharedStyles } = useCaptureStyles()
  const { styles: uploadStyles } = useUploadStyles()
  const styles = { ...sharedStyles, ...uploadStyles }
  const dot = row.name.lastIndexOf('.')
  const split = dot > 0 && dot < row.name.length - 1 ? dot : row.name.length
  const Icon =
    row.state === 'done'
      ? CircleCheck
      : row.state === 'failed'
        ? CircleX
        : row.state === 'uploading'
          ? LoaderCircle
          : null
  return (
    <div className={styles.row}>
      <span className={styles.rowIcon} data-state={row.state}>
        {Icon ? (
          <Icon
            size={15}
            className={row.state === 'uploading' ? styles.spin : undefined}
            aria-hidden="true"
          />
        ) : (
          <span className={styles.pendingDot} />
        )}
      </span>
      <div className={styles.rowMain}>
        <div className={styles.rowName} title={row.path ? `${row.path}/${row.name}` : row.name}>
          <span>{row.name.slice(0, split)}</span>
          <span>{row.name.slice(split)}</span>
        </div>
        {row.path && (
          <details className={styles.path}>
            <summary>
              <Folder size={12} aria-hidden="true" />
              <span>{row.path}</span>
            </summary>
            <div>
              目标：{folder ? `${folder} / ` : ''}
              {row.path}
            </div>
          </details>
        )}
        <span className={styles.rowFormat}>
          {row.note ? '笔记 · ' : ''}
          {formatLabel(null, row.name)} · {formatBytes(row.size)}
        </span>
      </div>
      <div className={styles.rowDetail} data-state={row.state}>
        {row.state === 'failed' && row.detail.length > 100 ? (
          <details>
            <summary>上传失败 · 展开完整原因</summary>
            <p>{row.detail}</p>
          </details>
        ) : (
          <span>
            {row.state === 'pending'
              ? '等待上传'
              : row.state === 'uploading'
                ? '上传中…'
                : row.detail}
          </span>
        )}
        {row.state === 'done' && !row.note && row.detail.startsWith('原件') && (
          <span className={styles.rawNote}>可下载；正文可搜索状态见文档详情</span>
        )}
      </div>
    </div>
  )
}
