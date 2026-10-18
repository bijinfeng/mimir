import { Button, Upload } from 'antd'
import { ArrowRight, ArrowUpFromLine, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { FILE_MAX_BYTES, formatBytes } from '@mimir/shared'
import { api } from '../lib/api'
import { CaptureNotice } from './capture/Notice'
import { targetFolderFor, uncertainResult } from './capture/helpers'
import { UploadResultRow, type UploadRow } from './capture/UploadResultRow'
import { useUploadStyles } from './capture/upload-styles'
import { useCaptureStyles } from './capture/styles'

export interface UploadPanelProps {
  onUploaded: (documentId: string) => void
  onBusyChange?: (busy: boolean) => void
  onComplete?: () => void
  folder?: string | null
  directory?: boolean
  /** Page drop already claims the host lock synchronously before mounting this panel. */
  initialFiles?: File[]
  inline?: boolean
  onCleared?: () => void
  claimBatch?: () => boolean
  releaseBatch?: () => void
}

export function UploadPanel({
  onUploaded,
  onBusyChange,
  onComplete,
  folder,
  directory,
  initialFiles,
  inline,
  onCleared,
  claimBatch,
  releaseBatch,
}: UploadPanelProps) {
  const { styles: sharedStyles, cx } = useCaptureStyles()
  const { styles: uploadStyles } = useUploadStyles()
  const styles = { ...sharedStyles, ...uploadStyles }
  const [rows, setRows] = useState<UploadRow[]>([])
  const [busy, setBusy] = useState(false)
  const uploadActive = useRef(false)
  const mounted = useRef(true)

  /** One request at a time, in selection order. A rejection never aborts later files. */
  async function uploadAll(files: File[], alreadyClaimed = false) {
    if (!files.length || uploadActive.current || (!alreadyClaimed && claimBatch && !claimBatch()))
      return
    uploadActive.current = true
    setBusy(true)
    onBusyChange?.(true)
    setRows(
      files.map((file, index) => {
        const relative = file.webkitRelativePath || ''
        return {
          key: `${file.name}-${index}`,
          name: file.name,
          path: relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : '',
          size: file.size,
          note: /\.md$/i.test(file.name),
          state: 'pending',
          detail: '',
          documentId: null,
        }
      }),
    )
    const update = (index: number, patch: Partial<UploadRow>) => {
      if (mounted.current)
        setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    }
    try {
      for (const [index, file] of files.entries()) {
        update(index, { state: 'uploading' })
        if (file.size > FILE_MAX_BYTES) {
          update(index, {
            state: 'failed',
            detail: `文件太大（${formatBytes(file.size)}），上限 ${formatBytes(FILE_MAX_BYTES)}`,
          })
          continue
        }
        try {
          const result = await api.documents.upload(file, targetFolderFor(file, folder))
          const note = result.document.kind === 'note'
          update(index, {
            state: 'done',
            note,
            detail:
              result.charCount > 0
                ? `已提取 ${result.charCount.toLocaleString('zh-CN')} 字`
                : note
                  ? '笔记已导入，正文为空'
                  : '原件已保存；可搜索状态见详情',
            documentId: result.document.id,
          })
        } catch (error) {
          update(index, {
            state: 'failed',
            detail: error instanceof Error ? error.message : '上传失败',
            uncertain: uncertainResult(error),
          })
        }
      }
    } finally {
      // Refresh even after partial/all failure: a lost response may have saved a document.
      onComplete?.()
      uploadActive.current = false
      releaseBatch?.()
      if (mounted.current) {
        setBusy(false)
        onBusyChange?.(false)
      }
    }
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const initialConsumed = useRef(false)
  const [initialBatch] = useState(() => ({ files: initialFiles, start: uploadAll }))
  useEffect(() => {
    if (!initialConsumed.current && initialBatch.files?.length) {
      initialConsumed.current = true
      void initialBatch.start(initialBatch.files, true)
    }
  }, [initialBatch])

  const allDone =
    rows.length > 0 && !busy && rows.every((row) => row.state === 'done' || row.state === 'failed')
  const succeeded = rows.filter((row) => row.state === 'done').length
  const failed = rows.filter((row) => row.state === 'failed').length
  const uncertain = rows.some((row) => row.uncertain)
  const ended = succeeded + failed
  const first = rows.find((row) => row.state === 'done' && row.documentId)
  const clear = () => {
    if (uploadActive.current) return
    setRows([])
    onCleared?.()
  }
  return (
    <div className={styles.uploadBody}>
      {!inline && (
        <Upload.Dragger
          multiple
          directory={directory}
          beforeUpload={(file, fileList) => {
            if (fileList.length && file === fileList[fileList.length - 1]) void uploadAll(fileList)
            return false
          }}
          disabled={busy}
          showUploadList={false}
          className={cx(styles.dragger, rows.length > 0 && styles.compactDragger)}
        >
          <ArrowUpFromLine className={styles.dropIcon} size={22} aria-hidden="true" />
          <span className={styles.dropTitle} data-drop-title>
            {rows.length
              ? busy
                ? '正在处理本批文件'
                : directory
                  ? '选择新一批文件夹'
                  : '选择新一批文件'
              : directory
                ? '选择一个文件夹'
                : '把文件拖到这里，或点击选择'}
          </span>
          <span className={styles.dropHint} data-drop-hint>
            {rows.length
              ? '新选择将替换当前结果；已保存内容会保留。'
              : directory
                ? '保留目录结构，跳过空文件夹'
                : `单个文件不超过 ${formatBytes(FILE_MAX_BYTES)}。Markdown 导入为笔记，其他格式保存原件`}
          </span>
        </Upload.Dragger>
      )}
      {busy && (
        <div className={styles.batch} role="status">
          <LoaderCircle className={styles.spin} size={15} aria-hidden="true" />
          <span>
            已结束 {ended} / {rows.length} 项
          </span>
          <span>正在逐个处理</span>
        </div>
      )}
      {rows.length > 0 && (
        <div className={styles.rows} aria-label="逐文件上传结果" aria-busy={busy}>
          {rows.map((row) => (
            <UploadResultRow key={row.key} row={row} folder={folder} />
          ))}
        </div>
      )}
      {allDone && (
        <>
          <CaptureNotice tone={failed ? 'warning' : 'success'}>
            <strong>
              {succeeded} 个成功{failed ? `，${failed} 个失败` : ''}
            </strong>
            {uncertain ? (
              <p>未收到响应不代表未保存。请先查看目标知识库，确认后再决定是否重新上传。</p>
            ) : failed > 0 ? (
              <p>请查看对应文件的原因，处理后可重新选择失败文件上传。</p>
            ) : null}
          </CaptureNotice>
          <div className={styles.actions}>
            {!inline && first?.documentId && (
              <Button
                autoInsertSpace={false}
                type="primary"
                className={styles.button}
                data-capture-result-open
                onClick={() => onUploaded(first.documentId!)}
              >
                <span className={styles.clip} title={first.name}>
                  打开《{first.name}》
                </span>
                <ArrowRight size={15} aria-hidden="true" />
              </Button>
            )}
            <Button autoInsertSpace={false} className={styles.button} onClick={clear}>
              继续上传
            </Button>
          </div>
          {succeeded > 0 && (
            <div className={styles.small}>
              {inline
                ? '知识库、目录与计数已刷新。'
                : '本批已结束；已保存内容可在目标知识库中查看。'}
            </div>
          )}
        </>
      )}
      {busy && <div className={styles.small}>正在处理本批文件，暂时不能切换、关闭或再次选择。</div>}
    </div>
  )
}
