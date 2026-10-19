import { Check, ChevronDown, Loader, XCircle, Wrench } from 'lucide-react'
import type { ToolCallPart as NativeToolCall } from '@tanstack/ai'
import { useProcessStyles } from './Process.style.js'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
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
  const { styles } = useProcessStyles()
  const contentId = useId()
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
        aria-controls={open ? contentId : undefined}
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
        <span title={name}>{name}</span>
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
        <div id={contentId} className={styles.content}>
          <small>参数</small>
          <pre tabIndex={0} aria-label="工具参数">
            {part?.arguments ?? argsText ?? '{}'}
          </pre>
          {output !== undefined && (
            <>
              <small>结果</small>
              <pre tabIndex={0} aria-label="工具结果">
                {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
              </pre>
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
  children,
}: {
  parts: NativeToolCall[]
  children?: ReactNode
  halted?: 'cancelled' | 'error' | undefined
}) {
  const { styles } = useProcessStyles()
  const contentId = useId()
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
    <section className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        onClick={() => setOpen(!open)}
      >
        <Wrench size={15} />
        <span>工具调用 · {parts.length}</span>
        <small>
          {running
            ? '调用中…'
            : halted === 'cancelled'
              ? '已取消'
              : halted === 'error' ||
                  parts.some((part) => part.state === 'error' || outputFailed(part.output))
                ? '调用失败'
                : '已完成'}
        </small>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div id={contentId} className={styles.group}>
          {children ??
            parts.map((part) => <ToolCallPart key={part.id} part={part} halted={halted} />)}
        </div>
      )}
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
