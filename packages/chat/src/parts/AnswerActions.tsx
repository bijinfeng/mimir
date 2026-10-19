import { useChatMessage } from '../runtime/runtime-context.js'
import { SEARCH_ONLY_RESULT_TEXT, type Citation } from '@mimir/shared'
import { App as AntApp, Tooltip } from 'antd'
import { Check, Copy, ExternalLink, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createStyles } from 'antd-style'
import { useMimirChatApi } from '../runtime/chat-context.js'
import { useCitationsPart } from './data-parts.js'

/** 检索结果复制原文和来源；模型回答保持已有的正文复制语义。 */
export function copyAnswerText(text: string, citations: Citation[]): string {
  if (text !== SEARCH_ONLY_RESULT_TEXT || citations.length === 0) return text

  return citations
    .map(
      (citation) => `${citation.snippet}\n来源：[${citation.title}](/doc/${citation.documentId})`,
    )
    .join('\n\n')
}

/** Copy reads the visible message; saving uses its verified persisted ID, including local branches. */
const useStyles = createStyles(({ css, token }) => ({
  /*
   * 动作条（assistant-ui 的 AssistantActionBar 形态）：`mt-2` 的一排
   * **图标幽灵钮**，`muted-foreground/70` → hover 提到 foreground，
   * 不铺底色、不带文字标签——它是次级动作，扫一眼有、读起来不吵。
   * 左对齐跟在回答下面（上游同款），不靠右。
   */
  row: css`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  `,
  /*
   * 单颗钮 = 官方 TooltipIconButton 的换算：size-6（24px）p-1、
   * ghost（hover 浅底）、**按下缩 0.9**（active:scale-90，官方那枚
   * 按钮的「按下去」手感）、tooltip 包在外层。
   */
  button: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 4px;
    border: none;
    background: none;
    border-radius: ${token.borderRadiusSM}px;
    color: ${token.colorTextQuaternary};
    cursor: pointer;
    transition:
      color 0.12s ease-out,
      background-color 0.12s ease-out,
      transform 0.12s ease-out;

    &:hover,
    &:focus-visible {
      color: ${token.colorText};
      background: ${token.colorFillTertiary};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }
    &:active {
      transform: scale(0.9);
    }
    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  `,
  saved: css`
    color: ${token.colorLink};

    &:hover,
    &:focus-visible {
      color: ${token.colorLink};
    }
  `,
}))

export function AnswerActions() {
  const { styles } = useStyles()
  const api = useMimirChatApi()
  const citations = useCitationsPart()
  const { message: antdMessage } = AntApp.useApp()

  /**
   * 这条消息的正文。动作条挂在消息根上，所以 `s.message` 就是它自己。
   * **`getCopyText()` 不走它**：它是「整条消息的纯文本」，而我们要的是
   * 「用户看到的正文」——同一条消息里还有 trace / 引用那几个 data part，
   * 它们的 JSON 不该被复制进去。
   */
  const { message, sidecar, running } = useChatMessage()
  const text = message.parts.map((part) => (part.type === 'text' ? part.content : '')).join('')
  const status = running ? 'running' : 'complete'

  const [savedNoteId, setSavedNoteId] = useState<string | null>(sidecar.savedNoteId ?? null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  /* 复制状态 2 秒后自己回去（与代码块复制同一套） */
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  /**
   * 正文为空、还在生成、或没有会话 id → 整条不渲染。
   *
   * 没有 activeId 是不可能的（有回答就有会话），但它是 undefined 时
   * `saveAsNote` 会拿到 undefined——宁可少个按钮。
   */
  if (text.trim().length === 0 || status === 'running' || api.activeId === undefined) {
    return null
  }

  const save = async () => {
    setSaving(true)
    /**
     * **没有 `finally` 是刻意的。** React Compiler 遇到 `try … finally`
     * 会跳过整个组件（实测报 `CompileError (BuildHIR::lowerStatement)
     * Handle TryStatement with a finalizer ('finally') clause`，而它是**静默的**
     * ——不报错，只是这个组件不再被优化，见铁律 1 的同类问题）。
     * 收尾改成两条路径各写一次，行为不变：无论走哪条，`setSaving(false)` 都会执行。
     */
    try {
      const result = await api.saveAsNote(message.id)
      setSavedNoteId(result.noteId)
      antdMessage.success('已存成笔记')
      setSaving(false)
    } catch (error) {
      antdMessage.error(error instanceof Error ? error.message : '存成笔记失败')
      setSaving(false)
    }
  }

  return (
    <div className={styles.row}>
      {savedNoteId === null ? (
        <Tooltip title="存成笔记">
          <button
            type="button"
            className={styles.button}
            aria-label="存成笔记"
            disabled={saving || api.canSaveMessage?.(message.id) === false}
            onClick={() => void save()}
          >
            <Save size={16} />
          </button>
        </Tooltip>
      ) : (
        <Tooltip title="打开笔记">
          <button
            type="button"
            className={`${styles.button} ${styles.saved}`}
            aria-label="打开笔记"
            onClick={() => api.onOpenNote(savedNoteId)}
          >
            <ExternalLink size={16} />
          </button>
        </Tooltip>
      )}
      {/* 复制态换图标（官方同款：Copy ↔ Check） */}
      <Tooltip title={copied ? '已复制' : '复制回答'}>
        <button
          type="button"
          className={styles.button}
          aria-label={copied ? '已复制' : '复制回答'}
          onClick={() => {
            void navigator.clipboard
              .writeText(copyAnswerText(text, citations))
              .then(() => {
                setCopied(true)
                antdMessage.success('已复制')
              })
              .catch(() => antdMessage.error('复制失败'))
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </Tooltip>
    </div>
  )
}
