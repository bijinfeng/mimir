import { useQuery } from '@tanstack/react-query'
import type { SearchHit } from '@mimir/shared'
import { Button, Input, Modal } from 'antd'
import type { InputRef } from 'antd'
import { Search, Sparkles, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { api, ApiRequestError } from '../lib/api'
import { useRecentDocuments } from '../lib/recent-documents'
import { paletteCommands, paletteDocuments } from './command-palette/items'
import type { PaletteItem } from './command-palette/items'
import { useStyles } from './command-palette/styles'
import { PaletteRow } from './command-palette/PaletteRow'
import { CommandFeedback, RecentFeedback } from './command-palette/Feedback'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onOpenSearchHit: (hit: SearchHit) => void
  onAsk: (question: string) => void
  onOpenCapture: () => void
  onNewNote: () => void | Promise<void>
  creatingNote?: boolean
  createNoteError?: string | null
  interactionSuspended?: boolean
  userId?: string
  currentDocumentId?: string
  onOpenRecent: (id: string, scope: string) => void
  onCurrentCommand: (command: 'rename' | 'move' | 'search') => void
  onReturnToLibrary: () => void
}

/** Unmount on close so reopening starts with a fresh input and selection. */
export function CommandPalette({ open, ...rest }: CommandPaletteProps) {
  return open ? <PaletteBody {...rest} /> : null
}

function PaletteBody(props: Omit<CommandPaletteProps, 'open'>) {
  const { styles } = useStyles()
  const { onClose } = props
  const [value, setValue] = useState('')
  const [committedValue, setCommittedValue] = useState('')
  const [composing, setComposing] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const composingRef = useRef(false)
  const restoreOnCancel = useRef(false)
  const inputRef = useRef<InputRef>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const statusId = useId()
  const busy = Boolean(props.creatingNote || props.interactionSuspended)
  const previousBusyRef = useRef(busy)
  const recentQuery = useRecentDocuments(props.userId)
  const currentDocQuery = useQuery({
    queryKey: ['document', props.currentDocumentId],
    queryFn: () => api.documents.get(props.currentDocumentId!),
    enabled: Boolean(props.currentDocumentId),
  })
  const question = committedValue.trim()
  const shouldSearch = question.length >= 2 && question.length <= 500
  const searchQuery = useQuery({
    queryKey: ['palette-search', question],
    queryFn: () => api.search({ q: question, limit: 6 }),
    enabled: shouldSearch && !composing,
  })
  const searchPending = shouldSearch && searchQuery.isFetching
  const executionBlocked = busy || composing || searchPending
  const commands = paletteCommands(
    props,
    currentDocQuery.isError ? undefined : currentDocQuery.data?.kind,
  ).filter(
    (item) =>
      !question || `${item.title} ${item.sub ?? ''}`.toLowerCase().includes(question.toLowerCase()),
  )
  const documents = paletteDocuments(
    question ? (shouldSearch ? (searchQuery.data?.hits ?? []) : []) : undefined,
    recentQuery.data ?? [],
    props,
  )
  const documentsFirst = !question || documents.length > 0
  const items = documentsFirst ? [...documents, ...commands] : [...commands, ...documents]
  // A stable identity survives late insertions. A removed selection falls back to the first item.
  const activeItem = items.find((item) => item.key === selectedKey) ?? items[0]
  const activeIndex = activeItem ? items.indexOf(activeItem) : -1

  useEffect(() => {
    const previous = document.activeElement
    return () => {
      if (!restoreOnCancel.current) return
      const fallback = Array.from(
        document.querySelectorAll<HTMLElement>('[data-palette-trigger], button[aria-label="搜索"]'),
      ).find(isVisibleFocusTarget)
      if (previous instanceof HTMLElement && isVisibleFocusTarget(previous)) previous.focus()
      else fallback?.focus()
    }
  }, [])

  useEffect(() => {
    if (previousBusyRef.current && !busy) inputRef.current?.focus()
    previousBusyRef.current = busy
  }, [busy])

  useEffect(() => {
    const toggle = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k')
        return
      event.preventDefault()
      event.stopPropagation()
      if (
        event.repeat ||
        event.isComposing ||
        event.keyCode === 229 ||
        composingRef.current ||
        busy
      )
        return
      restoreOnCancel.current = true
      onClose()
    }
    window.addEventListener('keydown', toggle, true)
    return () => window.removeEventListener('keydown', toggle, true)
  }, [busy, onClose])

  useEffect(() => {
    const node = listRef.current?.querySelectorAll<HTMLElement>('[data-item-key]')
    Array.from(node ?? [])
      .find((item) => item.dataset.itemKey === activeItem?.key)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeItem?.key])

  const cancel = () => {
    if (busy || composingRef.current) return
    restoreOnCancel.current = true
    onClose()
  }
  const execute = (item: PaletteItem) => {
    if (!executionBlocked && !composingRef.current) item.run()
    // The host owns guard confirmation, pending and closure. A cancelled guard keeps this draft.
  }
  const handleChange = (next: string) => {
    setValue(next)
    if (!composingRef.current) {
      setCommittedValue(next)
      setSelectedKey(null)
    }
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || composingRef.current)
      return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (executionBlocked || !items.length) return
      const next = Math.max(
        0,
        Math.min(items.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)),
      )
      setSelectedKey(items[next]!.key)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (!event.repeat && activeItem) execute(activeItem)
    }
  }
  const searchStatus = composing
    ? '正在输入，确认后搜索'
    : question.length > 500
      ? '搜索内容最多 500 字，请缩短后重试'
      : !shouldSearch
        ? '输入至少两个字搜索文档'
        : searchQuery.isFetching
          ? searchQuery.data
            ? '正在更新搜索结果，完成后可打开'
            : '正在检索…'
          : searchQuery.isError
            ? isUnauthorized(searchQuery.error)
              ? '登录状态已失效，请重新登录后重试'
              : searchQuery.data
                ? '更新失败，保留上次结果；可以重试'
                : '搜索暂时失败，请重试'
            : documents.length
              ? `找到 ${documents.length} 处`
              : '没有匹配的文档'
  const renderSection = (rows: PaletteItem[], label: string) =>
    rows.length > 0 && (
      <section aria-label={label}>
        <div className={styles.sectionLabel}>{label}</div>
        {rows.map((item) => (
          <PaletteRow
            key={item.key}
            item={item}
            active={activeItem?.key === item.key}
            disabled={executionBlocked}
            onSelect={() => setSelectedKey(item.key)}
            onExecute={() => execute(item)}
          />
        ))}
      </section>
    )
  const documentSection = renderSection(documents, question ? '匹配的文档' : '最近打开的笔记')
  const commandSection = renderSection(commands, '操作')

  return (
    <Modal
      open
      title={<span className={styles.srOnly}>搜索文档与操作</span>}
      onCancel={cancel}
      keyboard={!busy && !composing}
      mask={{ closable: !busy && !composing }}
      focusable={{ focusTriggerAfterClose: false }}
      afterOpenChange={(open) => {
        if (open) inputRef.current?.focus()
      }}
      footer={null}
      closable={false}
      width={620}
      destroyOnHidden
      className={styles.modal}
      styles={{
        header: { marginBottom: 0 },
        body: { padding: 0 },
        container: { padding: 0, overflow: 'hidden' },
      }}
      style={{ top: '14vh' }}
    >
      <div
        className={styles.panel}
        onKeyDownCapture={(event) => {
          if (
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229 ||
            composingRef.current
          )
            event.stopPropagation()
        }}
      >
        <div className={styles.searchRow}>
          <Input
            ref={inputRef}
            size="large"
            variant="borderless"
            prefix={<Search size={17} aria-hidden />}
            aria-label="搜索文档或输入问题"
            aria-describedby={question || composing ? statusId : undefined}
            placeholder="搜索文档或输入问题"
            value={value}
            maxLength={500}
            disabled={busy}
            onChange={(event) => handleChange(event.target.value)}
            onCompositionStart={() => {
              composingRef.current = true
              setComposing(true)
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false
              setComposing(false)
              handleChange(event.currentTarget.value)
            }}
            onKeyDown={handleKeyDown}
          />
          {value && (
            <Button
              type="text"
              className={styles.iconButton}
              icon={<X size={15} />}
              aria-label="清空搜索"
              disabled={busy || composing}
              onClick={() => {
                handleChange('')
                inputRef.current?.focus()
              }}
            />
          )}
          <Button
            type="text"
            className={styles.iconButton}
            icon={<X size={17} />}
            aria-label="关闭搜索"
            disabled={busy || composing}
            onClick={cancel}
          />
        </div>
        <div className={styles.list} ref={listRef} aria-busy={searchPending || props.creatingNote}>
          {!question && (
            <RecentFeedback
              query={recentQuery}
              userId={props.userId}
              hasNotes={documents.length > 0}
              busy={busy || composing}
              onRetry={() => {
                inputRef.current?.focus()
                void recentQuery.refetch()
              }}
            />
          )}
          {documentsFirst ? (
            <>
              {documentSection}
              {commandSection}
            </>
          ) : (
            <>
              {commandSection}
              {documentSection}
            </>
          )}
          <CommandFeedback
            currentDocumentId={props.currentDocumentId}
            query={currentDocQuery}
            creatingNote={props.creatingNote}
            error={props.createNoteError}
            busy={busy || composing}
            onRetry={() => {
              if (!busy && !composingRef.current) void props.onNewNote()
            }}
          />
        </div>
        {(question || composing) && (
          <div className={styles.aiRow}>
            <span id={statusId} role="status" aria-live="polite">
              {searchStatus}
              {value.length >= 480 && ` · ${value.length}/500 字`}
            </span>
            {shouldSearch && searchQuery.isError && (
              <Button
                size="small"
                type="link"
                disabled={busy || composing || searchQuery.isFetching}
                onClick={() => {
                  inputRef.current?.focus()
                  void searchQuery.refetch()
                }}
              >
                重试搜索
              </Button>
            )}
            <span className={styles.aiLabel}>
              <Sparkles size={15} aria-hidden />
              <Button
                size="small"
                type="link"
                disabled={busy || composing || !question}
                onClick={() => {
                  if (!busy && !composingRef.current && question) props.onAsk(question)
                }}
              >
                带到新对话
              </Button>
            </span>
            <span>仅预填问题，不会自动发送</span>
          </div>
        )}
        <div className={styles.foot}>
          {items.length > 0 && (
            <span>
              <kbd className={styles.kbd}>↑ ↓</kbd>选择
            </span>
          )}
          {activeItem && (
            <span>
              <kbd className={styles.kbd}>Enter</kbd>
              {activeItem.type === 'document' ? '打开所选结果' : '执行所选操作'}
            </span>
          )}
          <span>
            <kbd className={styles.kbd}>Esc</kbd>关闭
          </span>
          <span className={styles.srOnly} role="status" aria-live="polite">
            {activeItem ? `当前选择：${activeItem.title}` : '没有可选择的结果'}
          </span>
        </div>
      </div>
    </Modal>
  )
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiRequestError && error.status === 401
}

function isVisibleFocusTarget(element: HTMLElement) {
  return (
    element.isConnected &&
    element.getClientRects().length > 0 &&
    !element.closest('[inert], [aria-hidden="true"]')
  )
}
