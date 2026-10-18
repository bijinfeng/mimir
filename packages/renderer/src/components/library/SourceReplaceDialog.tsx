import { useRef, useState } from 'react'
import { Button, Modal } from 'antd'
import { FileText } from 'lucide-react'
import type { DocumentSummary, FileUploadResponse } from '@mimir/shared'
import { api } from '../../lib/api'
import { displayDocumentTitle } from './document-name'
import { useLibraryDialogStyles } from './library-dialog-styles'

/** Explicit replacement keeps the chosen File through cancellation of the native picker or request failure. */
export function SourceReplaceDialog({
  doc,
  onSaved,
  onClosed,
}: {
  doc: DocumentSummary
  onSaved: () => void
  onClosed: () => void
}) {
  const { styles } = useLibraryDialogStyles()
  const picker = useRef<HTMLInputElement>(null)
  const flight = useRef(false)
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<FileUploadResponse | null>(null)
  const [open, setOpen] = useState(true)
  const submit = async () => {
    if (flight.current || !file || result) return
    flight.current = true
    setPending(true)
    setError('')
    try {
      const response = await api.documents.replaceSource(doc.id, file)
      setResult(response)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '替换失败，请重试')
    } finally {
      flight.current = false
      setPending(false)
    }
  }
  const close = () => {
    if (!flight.current) setOpen(false)
  }
  return (
    <Modal
      open={open}
      title="替换原件"
      width={500}
      focusable={{ focusTriggerAfterClose: false }}
      afterClose={onClosed}
      onCancel={close}
      closable={!pending}
      keyboard={!pending}
      mask={{ closable: !pending }}
      okText={pending ? '正在提交' : error ? '重试' : '替换原件'}
      onOk={() => void submit()}
      okButtonProps={{ loading: pending, disabled: !file }}
      cancelText="取消"
      cancelButtonProps={{ disabled: pending }}
      footer={result ? <Button onClick={close}>完成</Button> : undefined}
      classNames={{ root: styles.root, container: styles.dialog, body: styles.body }}
    >
      <p className={styles.text}>
        目标文件：<strong>{displayDocumentTitle(doc)}</strong>
      </p>
      <p className={styles.muted}>替换会更新原件及提取正文；原文件将被覆盖。</p>
      <div className={styles.file}>
        <FileText size={22} aria-hidden />
        <span>{file?.name ?? '尚未选择替换文件'}</span>
        <Button disabled={pending || Boolean(result)} onClick={() => picker.current?.click()}>
          {file ? '重新选择' : '选择文件'}
        </Button>
      </div>
      <input
        ref={picker}
        type="file"
        hidden
        aria-label="选择替换文件"
        onChange={(event) => {
          const selected = event.target.files?.[0]
          event.target.value = ''
          if (!selected || flight.current) return
          setFile(selected)
          setError('')
          setResult(null)
        }}
      />
      <p className={styles.muted}>取消文件选择不会改变原件；失败后可重新选择。</p>
      <div aria-live="polite">
        {pending && (
          <p className={styles.notice} role="status">
            正在上传并处理原件，请稍候…
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}。未能确认保存结果；所选文件已保留，可重试替换同一文档。
          </p>
        )}
        {result && (
          <div className={styles.notice} role="status">
            {result.parseError
              ? '原件已保存，正文提取失败；文件仍可打开。'
              : result.charCount === 0
                ? '原件已保存，未提取到可搜索正文。'
                : '原件已替换，正文已更新。'}
            {result.parseError && <p>{result.parseError}</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
