import type { DocumentDetail, FolderNode } from '@mimir/shared'
import { Button, Input, Modal, Select } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { flattenFolders } from './folders'
import { useStyles } from './DocumentCommandModal.style'

type DocumentCommand = 'rename' | 'move' | 'search'
type CommandEventDetail = DocumentCommand | { command: DocumentCommand; documentId: string }

export class DocumentCommandRefreshError extends Error {}

interface Props {
  document: DocumentDetail
  folders: FolderNode[]
  foldersLoading: boolean
  foldersError: boolean
  retryFolders: () => void
  rename: (documentId: string, title: string) => Promise<void>
  move: (document: DocumentDetail, folder: string) => Promise<void>
  find: (documentId: string, query: string) => boolean
  refresh: (documentId: string) => Promise<void>
  restoreFocus: (documentId: string, trigger: HTMLElement | null) => void
}

/** A document-bound host. The parent keys it by document ID so late requests cannot
 * close or change the draft of a command opened on another document. */
export function DocumentCommandModal({
  document: doc,
  folders,
  foldersLoading,
  foldersError,
  retryFolders,
  rename,
  move,
  find,
  refresh,
  restoreFocus,
}: Props) {
  const { styles } = useStyles()
  const [command, setCommand] = useState<DocumentCommand>('rename')
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [refreshOnly, setRefreshOnly] = useState(false)
  const busy = useRef(false)
  const composing = useRef(false)
  const trigger = useRef<HTMLElement | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const containPaletteShortcut = (event: KeyboardEvent) => {
      if (event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k')
        return
      // Keep the document command as the active focus layer, including while
      // its request is pending. The app shortcut must not open a second modal.
      event.stopPropagation()
      if (!event.isComposing && event.keyCode !== 229 && !composing.current) event.preventDefault()
    }
    window.addEventListener('keydown', containPaletteShortcut, true)
    return () => window.removeEventListener('keydown', containPaletteShortcut, true)
  }, [open])

  useEffect(() => {
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent<CommandEventDetail>).detail
      const name = typeof detail === 'string' ? detail : detail?.command
      if (typeof detail !== 'string' && detail?.documentId !== doc.id) return
      if (name !== 'rename' && name !== 'move' && name !== 'search') return
      if ((name === 'rename' || name === 'search') && doc.kind !== 'note') return
      if (busy.current) return
      trigger.current = window.document.activeElement as HTMLElement | null
      composing.current = false
      setCommand(name)
      setValue(name === 'rename' ? doc.title : name === 'move' ? (doc.folder ?? '') : '')
      setError(null)
      setRefreshOnly(false)
      setOpen(true)
    }
    window.addEventListener('mimir:document-command', onCommand)
    return () => window.removeEventListener('mimir:document-command', onCommand)
  }, [doc.id, doc.kind, doc.title, doc.folder])

  const close = () => {
    if (!busy.current && !composing.current) setOpen(false)
  }
  const submit = async () => {
    if (busy.current || composing.current) return
    if (refreshOnly) {
      busy.current = true
      setPending(true)
      try {
        await refresh(doc.id)
        if (mounted.current) setOpen(false)
      } catch {
        if (mounted.current) setError('更改已保存，但读取最新内容仍失败。请稍后重试刷新。')
      } finally {
        busy.current = false
        if (mounted.current) setPending(false)
      }
      return
    }
    const next = value.trim()
    if (command === 'rename' && !next) {
      setError('请输入笔记标题')
      return
    }
    if (command === 'search') {
      if (next.length < 2) {
        setError('至少输入 2 个字符后查找')
        return
      }
      if (!find(doc.id, next)) {
        setError('当前笔记没有匹配内容，请调整关键词')
        return
      }
      close()
      return
    }
    if (command === 'move' && (foldersLoading || foldersError)) return
    if (
      (command === 'rename' && next === doc.title) ||
      (command === 'move' && value === (doc.folder ?? ''))
    ) {
      close()
      return
    }
    busy.current = true
    setPending(true)
    setError(null)
    try {
      if (command === 'rename') await rename(doc.id, next)
      else await move(doc, value)
      if (mounted.current) setOpen(false)
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : '操作失败，请重试')
        setRefreshOnly(cause instanceof DocumentCommandRefreshError)
      }
    } finally {
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }
  const help =
    command === 'rename'
      ? '最多 200 个字符；修改后同步重命名文件'
      : command === 'search'
        ? '至少输入 2 个字符，在当前笔记正文中查找'
        : '选择目标目录，成功后可在 8 秒内撤销'

  return (
    <Modal
      title={
        command === 'rename'
          ? '重命名当前笔记'
          : command === 'move'
            ? '移动当前文档'
            : '搜索当前笔记'
      }
      open={open}
      onCancel={close}
      onOk={() => void submit()}
      okText={
        refreshOnly
          ? '重试刷新'
          : command === 'rename'
            ? '重命名'
            : command === 'move'
              ? '移动'
              : '查找'
      }
      confirmLoading={pending}
      cancelButtonProps={{ disabled: pending }}
      okButtonProps={{
        disabled:
          pending || (!refreshOnly && command === 'move' && (foldersLoading || foldersError)),
      }}
      closable={!pending}
      keyboard={!pending}
      mask={{ closable: !pending }}
      focusable={{ focusTriggerAfterClose: false }}
      afterClose={() => {
        if (mounted.current && !open) restoreFocus(doc.id, trigger.current)
      }}
      centered
      styles={{
        container: { maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column' },
        header: { flexShrink: 0 },
        body: { minHeight: 0, overflowY: 'auto' },
        footer: { flexShrink: 0 },
      }}
      destroyOnHidden
    >
      <div
        className={styles.fields}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onKeyDownCapture={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229 || composing.current) {
            if (event.key === 'Enter' || event.key === 'Escape') event.stopPropagation()
            return
          }
          if (event.key === 'Enter' && command !== 'move') {
            event.preventDefault()
            event.stopPropagation()
            void submit()
          }
        }}
      >
        {command === 'move' ? (
          <>
            <span className={styles.label} id="document-command-label">
              目标目录
            </span>
            <Select
              autoFocus
              aria-labelledby="document-command-label"
              aria-describedby="document-command-help document-command-error"
              style={{ width: '100%' }}
              disabled={pending || refreshOnly || foldersLoading || foldersError}
              loading={foldersLoading}
              value={value}
              onChange={(next) => {
                setValue(next)
                setError(null)
              }}
              options={[
                { value: '', label: '知识库根' },
                ...flattenFolders(folders).map((item) => ({
                  value: item.path,
                  label: item.path,
                  title: item.path,
                })),
              ]}
            />
            <p className={styles.path} title={value || '知识库根'}>
              目标：{value || '知识库根'}
            </p>
            {foldersLoading ? (
              <p role="status" className={styles.help}>
                正在读取目录…
              </p>
            ) : null}
            {foldersError ? (
              <div role="alert" className={styles.error}>
                目录暂时无法读取，请重试。
                <Button
                  type="link"
                  disabled={foldersLoading}
                  loading={foldersLoading}
                  onClick={retryFolders}
                >
                  重试
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <label className={styles.label} htmlFor="document-command-input">
              {command === 'rename' ? '新标题' : '查找内容'}
            </label>
            <Input
              id="document-command-input"
              autoFocus
              aria-label={command === 'rename' ? '新标题' : '在当前笔记中查找'}
              aria-describedby="document-command-help document-command-error"
              aria-invalid={Boolean(error)}
              status={error ? 'error' : undefined}
              maxLength={command === 'rename' ? 200 : undefined}
              disabled={pending || refreshOnly}
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setError(null)
              }}
            />
          </>
        )}
        <p className={styles.help} id="document-command-help">
          {help}
        </p>
        <div
          id="document-command-error"
          role={error ? 'alert' : undefined}
          className={styles.error}
        >
          {error}
        </div>
        {pending ? (
          <p role="status" className={styles.help}>
            {refreshOnly
              ? '正在刷新，请稍候…'
              : command === 'rename'
                ? '正在重命名，请稍候…'
                : '正在移动，请稍候…'}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
