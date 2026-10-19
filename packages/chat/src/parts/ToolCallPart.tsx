import { Check, ChevronDown, Loader, XCircle, Wrench } from 'lucide-react'
import type { ToolCallPart as NativeToolCall } from '@tanstack/ai'
import { createStyles } from 'antd-style'
import { useState } from 'react'
const useStyles = createStyles(({ css, token }) => ({
  root: css`
    margin: 8px 0;
    border: 0;
    background: ${token.colorFillQuaternary};
    border-radius: 6px;
    font-size: var(--mimir-chat-font-meta, 12px);
    overflow: hidden;
  `,
  trigger: css`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    padding: 4px 12px;
    border: 0;
    background: ${token.colorFillQuaternary};
    text-align: left;
    font: inherit;
    color: ${token.colorTextSecondary};
    cursor: pointer;
    &:hover {
      color: ${token.colorText};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimary};
      outline-offset: -2px;
    }
    small {
      margin-left: auto;
      color: ${token.colorTextTertiary};
    }
    svg:last-child {
      flex: none;
    }
  `,
  content: css`
    padding: 10px 12px;
    pre {
      margin: 4px 0 10px !important;
      max-height: 240px;
      overflow: auto;
    }
    small {
      color: ${token.colorTextTertiary};
    }
  `,
}))
export function ToolCallPart({
  part,
  toolName,
  argsText,
  result,
  status,
  halted,
}: {
  part?: NativeToolCall
  toolName?: string
  argsText?: string
  result?: unknown
  halted?: 'cancelled' | 'error' | undefined
  status?: { type: string }
  [key: string]: unknown
}) {
  const { styles } = useStyles()
  const [open, setOpen] = useState(false)
  const name = part?.name ?? toolName ?? '工具'
  const state = part?.state ?? status?.type
  const output = part?.output ?? result
  const awaitingOutput =
    state === 'awaiting-input' ||
    state === 'input-streaming' ||
    state === 'input-complete' ||
    state === 'running'
  const cancelled = halted === 'cancelled' && awaitingOutput
  const running = awaitingOutput && !halted
  const failed =
    outputFailed(output) ||
    state === 'error' ||
    state === 'incomplete' ||
    (halted === 'error' && awaitingOutput)
  const waiting = state === 'approval-requested' || state === 'approval-responded'
  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {running || waiting ? (
          <Loader size={14} />
        ) : failed || cancelled ? (
          <XCircle size={14} />
        ) : output !== undefined ? (
          <Check size={14} />
        ) : (
          <Wrench size={14} />
        )}
        <span>{name}</span>
        <small>
          {running
            ? '调用中…'
            : cancelled
              ? '已取消'
              : failed
                ? '调用失败'
                : waiting
                  ? '等待确认'
                  : '已完成'}
        </small>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className={styles.content}>
          <small>参数</small>
          <pre>{part?.arguments ?? argsText ?? '{}'}</pre>
          {output !== undefined && (
            <>
              <small>结果</small>
              <pre>{typeof output === 'string' ? output : JSON.stringify(output, null, 2)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Consecutive protocol tool calls share one disclosure; individual payloads stay inspectable. */
export function ToolGroup({
  parts,
  halted,
}: {
  parts: NativeToolCall[]
  halted?: 'cancelled' | 'error' | undefined
}) {
  const { styles } = useStyles()
  const [open, setOpen] = useState(false)
  const running =
    !halted &&
    parts.some(
      (part) =>
        part.state === 'awaiting-input' ||
        part.state === 'input-streaming' ||
        part.state === 'input-complete',
    )
  return (
    <section style={{ margin: '8px 0' }}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        style={{ background: 'transparent', paddingLeft: 0 }}
        onClick={() => setOpen(!open)}
      >
        <Wrench size={15} />
        <span>工具调用 · {parts.length}</span>
        <small>
          {running
            ? '调用中…'
            : halted === 'cancelled'
              ? '已取消'
              : halted === 'error' || parts.some((part) => outputFailed(part.output))
                ? '调用失败'
                : '已完成'}
        </small>
        <ChevronDown size={13} />
      </button>
      {open && parts.map((part) => <ToolCallPart key={part.id} part={part} halted={halted} />)}
    </section>
  )
}

function outputFailed(output: unknown): boolean {
  let value = output
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return false
    }
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    (('ok' in value && value.ok === false) || ('error' in value && typeof value.error === 'string'))
  )
}
