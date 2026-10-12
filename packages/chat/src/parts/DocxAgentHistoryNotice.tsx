import type { DocxAgentHistory } from '@mimir/shared'
import { Button } from 'antd'
import { createStyles } from 'antd-style'
import { useState } from 'react'
import { useMimirChatApi } from '../runtime/chat-context.js'

const LABELS = {
  pending: '待处理',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
} as const

const useStyles = createStyles(({ css, token }) => ({
  box: css`
    margin-top: 10px;
    padding: 11px 13px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorFillQuaternary};
    font-size: var(--mimir-chat-font-note, 12.5px);
    line-height: 1.6;
    color: ${token.colorTextSecondary};
  `,
  title: css`
    font-weight: 600;
    color: ${token.colorText};
  `,
  tools: css`
    margin: 5px 0 0;
    padding-inline-start: 18px;
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  `,
}))

/** Persisted tool status never includes arguments, results, or document body. */
export function DocxAgentHistoryNotice({ agent }: { agent: DocxAgentHistory }) {
  const { styles } = useStyles()
  const api = useMimirChatApi()
  const [cancelled, setCancelled] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = cancelled ? 'cancelled' : agent.status
  const pending = status === 'pending'

  return (
    <div className={styles.box} role={pending ? 'alert' : 'status'}>
      <div className={styles.title}>文档编辑工具 · {LABELS[status]}</div>
      {pending ? <div>编辑已中断。请打开原文档，确认画布内容后重新发送指令。</div> : null}
      {agent.tools.length > 0 && (
        <ul className={styles.tools}>
          {agent.tools.map((tool) => (
            <li key={tool.interruptId}>
              {tool.name} · {LABELS[cancelled ? 'cancelled' : tool.status]}
              {tool.changed ? ' · 已修改画布' : ''}
            </li>
          ))}
        </ul>
      )}
      {error && <div role="alert">{error}</div>}
      {pending && (
        <div className={styles.actions}>
          {api.onOpenDocument && (
            <Button size="small" onClick={() => api.onOpenDocument?.(agent.documentId)}>
              打开文档
            </Button>
          )}
          {api.cancelDocxAgentRun && (
            <Button
              size="small"
              loading={cancelling}
              onClick={async () => {
                setCancelling(true)
                setError(null)
                try {
                  await api.cancelDocxAgentRun?.(agent.runId)
                  setCancelled(true)
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : '取消失败，请稍后再试')
                }
                setCancelling(false)
              }}
            >
              取消待处理工具
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
