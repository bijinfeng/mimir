import { ArrowUp, Paperclip, Square, X, FileText, Image as ImageIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createStyles } from 'antd-style'
import type { ChatAttachment, ChatModelSelection } from '@mimir/shared'
import type { RuntimeView } from '../runtime/runtime-context.js'
import type { ChatIo } from '../runtime/io.js'
import type { ChatComposerStatus } from '../types.js'
import { useMimirChatApi } from '../runtime/chat-context.js'
import { ComposerMenus, ContextUsageChip } from './ComposerMenus.js'
import { ImagePart } from '../parts/MediaParts.js'
import { CONTENT_WIDTH } from '../ChatPanel.style.js'
const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    width: 100%;
    max-width: ${CONTENT_WIDTH}px;
    margin: 0 auto;
    padding: 12px var(--mimir-chat-gutter, 24px) 10px;
  `,
  box: css`
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    background: ${token.colorBgContainer};
    padding: 0;
    transition: border-color 0.12s ease-out;
    &:hover {
      border-color: ${token.colorBorder};
    }
    &:focus-within {
      border-color: ${token.colorPrimary};
    }
    textarea {
      display: block;
      box-sizing: border-box;
      width: 100%;
      min-height: 64px;
      max-height: 190px;
      resize: none;
      border: 0;
      outline: 0;
      background: transparent;
      padding: 13px 14px 8px;
      font: inherit;
      font-size: var(--mimir-chat-font-body, 14px);
      line-height: 1.7;
      color: ${token.colorText};
      caret-color: ${token.colorPrimary};
    }
    textarea::placeholder {
      color: ${token.colorTextPlaceholder};
    }
  `,
  bar: css`
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding: 5px 7px 7px;
  `,
  tools: css`
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 4px;
    flex-wrap: wrap;
  `,
  icon: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: ${token.colorTextSecondary};
    cursor: pointer;
    &:hover:not(:disabled) {
      background: ${token.colorFillTertiary};
      color: ${token.colorText};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimary};
      outline-offset: 2px;
    }
    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `,
  send: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: auto;
    flex: none;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 6px;
    background: ${token.colorPrimary};
    color: ${token.colorTextLightSolid};
    cursor: pointer;
    &:hover {
      background: ${token.colorPrimaryHover};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimary};
      outline-offset: 2px;
    }
    &:disabled {
      background: ${token.colorFillTertiary};
      color: ${token.colorTextQuaternary};
      cursor: not-allowed;
    }
  `,
  files: css`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 10px 12px 0;
  `,
  tile: css`
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    padding: 8px;
    background: ${token.colorFillQuaternary};
    font-size: var(--mimir-chat-font-meta, 12px);
    img {
      width: 48px;
      height: 42px;
      object-fit: contain;
      border-radius: 3px;
    }
    a {
      color: inherit;
      max-width: 190px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    small {
      display: block;
      color: ${token.colorTextSecondary};
    }
    button {
      flex: none;
    }
  `,
  notice: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
    font-size: var(--mimir-chat-font-meta, 12px);
    line-height: 1.6;
    color: ${token.colorTextSecondary};
    span {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    &[role='alert'] {
      color: ${token.colorErrorText};
    }
  `,
  queue: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    padding: 5px 8px;
    background: ${token.colorFillQuaternary};
    border-radius: 4px;
    font-size: var(--mimir-chat-font-meta, 12px);
    color: ${token.colorTextSecondary};
    span {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
}))
export function AttachmentTile({
  file,
  onRemove,
}: {
  file: ChatAttachment
  onRemove?: () => void
}) {
  const { styles } = useStyles()
  return (
    <div className={styles.tile}>
      {file.kind === 'image' && file.status === 'ready' ? (
        <ImagePart image={file.originalUrl} name={file.name} />
      ) : file.kind === 'image' ? (
        <ImageIcon size={20} />
      ) : (
        <FileText size={20} />
      )}
      <div>
        {file.originalUrl ? (
          <a href={file.originalUrl} target="_blank" rel="noopener noreferrer" title={file.name}>
            {file.name}
          </a>
        ) : (
          <span title={file.name}>{file.name}</span>
        )}
        <small>
          {file.status === 'processing'
            ? '正在处理…'
            : file.status === 'failed'
              ? (file.error ?? '处理失败，请移除后重选')
              : file.status === 'unavailable'
                ? '附件已不可用'
                : `${Math.ceil(file.size / 1024)} KB`}
        </small>
      </div>
      {onRemove && (
        <button
          type="button"
          className={styles.icon}
          aria-label={`移除 ${file.name}`}
          onClick={onRemove}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
export function Composer({
  runtime,
  status,
  io,
  documentId,
  onDocumentIdChange,
  modelSelection,
  onModelSelectionChange,
  focusOnMount,
}: {
  runtime: RuntimeView
  status: ChatComposerStatus
  io: ChatIo
  documentId: string | null
  onDocumentIdChange: (id: string | null) => void
  modelSelection: ChatModelSelection | undefined
  onModelSelectionChange: (value: ChatModelSelection) => void
  focusOnMount?: boolean
}) {
  const { styles } = useStyles()
  const input = useRef<HTMLTextAreaElement>(null)
  const chooser = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const api = useMimirChatApi()
  useEffect(() => {
    if (focusOnMount) input.current?.focus()
  }, [focusOnMount])
  useEffect(() => {
    const node = input.current
    if (node && node.value === runtime.draft) {
      node.style.height = 'auto'
      node.style.height = `${Math.min(190, Math.max(64, node.scrollHeight))}px`
    }
  }, [runtime.draft])
  const canSend =
    !!(runtime.draft.trim() || runtime.files.length || runtime.snapshot) &&
    !runtime.uploading &&
    !runtime.loading &&
    !runtime.loadError
  const first = runtime.queue[0]
  return (
    <div className={styles.wrap}>
      <form
        className={styles.box}
        onSubmit={(event) => {
          event.preventDefault()
          if (!composing.current) runtime.send()
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault()
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length) {
            event.preventDefault()
            runtime.addFiles([...event.dataTransfer.files])
          }
        }}
      >
        {!!runtime.files.length && (
          <div className={styles.files}>
            {runtime.files.map((file) => (
              <AttachmentTile
                key={file.id}
                file={file}
                onRemove={() => runtime.removeFile(file.id)}
              />
            ))}
          </div>
        )}
        {runtime.snapshot && (
          <div className={styles.tile}>
            <ImagePart image={runtime.snapshot.image.dataUrl} name={runtime.snapshot.image.name} />
            <span>{runtime.snapshot.image.name}</span>
            <button
              type="button"
              className={styles.icon}
              aria-label="移除截图"
              onClick={() => runtime.applySnapshotDraft(undefined)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {runtime.uploading && (
          <div className={styles.notice} role="status">
            正在上传并准备附件…
          </div>
        )}
        <textarea
          ref={input}
          aria-label="提问"
          value={runtime.draft}
          placeholder={
            runtime.running
              ? '生成中 · Enter 排队这条，Esc 停止'
              : documentId
                ? '就当前文档提问…'
                : '直接向知识库提问…'
          }
          enterKeyHint="send"
          onChange={(event) => runtime.setDraft(event.target.value)}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
          }}
          onPaste={(event) => {
            const files = [...event.clipboardData.files]
            if (files.length) {
              event.preventDefault()
              runtime.addFiles(files)
            }
          }}
          onKeyDown={(event) => {
            if (
              composing.current ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229
            )
              return
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              runtime.send()
            }
            if (event.key === 'Escape' && runtime.running) {
              event.preventDefault()
              runtime.stop()
            }
          }}
        />
        {runtime.error && (
          <div className={styles.notice} role="alert">
            <span>{runtime.error}</span>
            <button
              type="button"
              className={styles.icon}
              aria-label="关闭提示"
              onClick={runtime.clearError}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {first && (
          <div className={styles.queue}>
            <span title={first.text}>
              已排队 · {first.text}
              {runtime.queue.length > 1 ? `（共 ${runtime.queue.length} 条）` : ''}
            </span>
            <button
              type="button"
              className={styles.icon}
              aria-label="取回排队的消息"
              onClick={() => {
                api.reclaimQueued?.(first.id)
                input.current?.focus()
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className={styles.bar}>
          <div className={styles.tools}>
            <button
              type="button"
              className={styles.icon}
              aria-label="添加附件"
              title="添加聊天附件"
              disabled={runtime.uploading || !!runtime.snapshot}
              onClick={() => chooser.current?.click()}
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={chooser}
              hidden
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.sql,.yaml,.yml,.docx,.xlsx,.pptx,.pdf,.png,.jpg,.jpeg,.webp"
              onChange={(event) => {
                if (event.target.files) runtime.addFiles([...event.target.files])
                event.target.value = ''
                input.current?.focus()
              }}
            />
            <ComposerMenus
              status={status}
              selection={modelSelection}
              onSelection={onModelSelectionChange}
              documentId={documentId}
              onDocumentId={onDocumentIdChange}
              onManageModels={io.onManageModels}
            />
            <ContextUsageChip usage={status.usage} />
          </div>
          {runtime.running ? (
            <button
              type="button"
              className={styles.send}
              aria-label="停止"
              onClick={(event) => {
                // React may reuse this node as submit before click's default activation.
                event.preventDefault()
                runtime.stop()
              }}
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" className={styles.send} aria-label="发送" disabled={!canSend}>
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
