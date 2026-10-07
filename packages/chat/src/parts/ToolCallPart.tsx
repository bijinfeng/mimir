import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { useToolCallElapsed } from '@assistant-ui/react'
import { createStyles } from 'antd-style'
import { Check, ChevronDown, Loader, XCircle } from 'lucide-react'
import { useState } from 'react'

/**
 * **工具调用**（`tool-call` part）——官方 ToolFallback 的换算
 * （`packages/ui/.../elements/tool-fallback.aui.tsx`）。
 *
 * ## 为什么之前会静默消失
 *
 * mimir 的服务端今天不产 `TOOL_CALL_*` 帧，但引擎的快照
 * （`MESSAGES_SNAPSHOT`）与将来的子代理 / MCP 都会带工具调用；而
 * `MessagePrimitive.Parts` 的默认 tools 组件在 react 平台上是
 * `() => null`——**没有挂 Fallback 的类型一律不渲染**，用户看到的是
 * 「模型说调用了工具，界面上什么都没有」。这一件就是那个 Fallback。
 *
 * ## 官方形态的逐条换算
 *
 * - 触发行：状态图标 + 标签 + 耗时 + chevron；`text-sm`、
 *   muted → hover 提亮、`active:scale-[0.98]`
 * - 状态图标按官方 `statusIconMap`：running = Loader（旋转
 *   `0.6s` 一圈）、complete = Check、incomplete = XCircle
 * - 标签按官方文案：Running tool / Used tool / Failed tool，后跟
 *   **加粗的工具名**；running 时 shimmer
 * - 耗时走引擎的 `useToolCallElapsed()`（官方同一只钟），格式官方
 *   `formatToolDuration`：`<1s` / `1.2s` / `45s` / `2m 3s`
 * - 内容是 `ps-6` 缩进的两段：**Args**（原始参数 JSON 文本）与
 *   **Result**（结果 JSON），各带一个小写的 10px 段标（官方同款）
 */
const formatToolDuration = (ms: number) => {
  if (ms < 1000) return '<1s'
  const seconds = ms / 1000
  if (seconds < 10) return `${(Math.floor(seconds * 10) / 10).toFixed(1)}s`
  if (seconds < 60) return `${Math.floor(seconds)}s`
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
}

const useStyles = createStyles(({ css, token }) => ({
  trigger: css`
    display: flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    max-width: 100%;
    padding: 6px 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    font-size: var(--mimir-chat-font-body, 14px);
    color: ${token.colorTextSecondary};
    transition:
      color 0.15s ease-out,
      transform 0.15s ease-out;

    &:hover,
    &:focus-visible {
      color: ${token.colorText};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
      border-radius: ${token.borderRadiusSM}px;
    }
    &:active {
      transform: scale(0.98);
    }
  `,
  statusIcon: css`
    flex: none;
    width: 16px;
    height: 16px;

    &[data-spin] {
      animation: me-tool-spin 0.6s linear infinite;
    }
    &[data-failed] {
      color: ${token.colorError};
    }

    @keyframes me-tool-spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `,
  label: css`
    line-height: 1;
    overflow-wrap: anywhere;

    b {
      color: ${token.colorText};
      font-weight: 600;
    }
    &[data-live] {
      background: linear-gradient(
        90deg,
        ${token.colorTextSecondary} 40%,
        ${token.colorText} 50%,
        ${token.colorTextSecondary} 60%
      );
      background-size: 200% 100%;
      background-clip: text;
      -webkit-background-clip: text;
      color: transparent;
      animation: me-tool-shimmer 1.6s linear infinite;
    }

    @keyframes me-tool-shimmer {
      from {
        background-position: 200% 0;
      }
      to {
        background-position: -200% 0;
      }
    }
  `,
  duration: css`
    flex: none;
    font-size: var(--mimir-chat-font-badge, 11.5px);
    font-variant-numeric: tabular-nums;
    color: ${token.colorTextQuaternary};
  `,
  chevron: css`
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 2px;
    color: inherit;
    transform: rotate(-90deg);
    transition: transform 0.2s ease-out;

    &[data-open] {
      transform: rotate(0deg);
    }
  `,
  content: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0 8px 24px;
  `,
  blockLabel: css`
    margin-bottom: 2px;
    /* 官方这里是 text-[10px]，低于本仓 DESIGN §4.2 的可读底线（10.5px）
       ——取阶梯最小的一档 badge（同 MediaParts 的徽标，同一条记录） */
    font-size: var(--mimir-chat-font-badge, 11.5px);
    font-weight: 500;
    color: ${token.colorTextQuaternary};
  `,
  pre: css`
    margin: 0;
    padding: 8px 10px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorFillQuaternary};
    font-family: ${token.fontFamilyCode};
    font-size: var(--mimir-chat-font-badge, 11.5px);
    line-height: 1.6;
    color: ${token.colorTextSecondary};
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 240px;
    overflow-y: auto;
  `,
}))

/** 结果值 → 可读文本：字符串原样、其余 JSON 两个空格缩进（官方同款） */
function formatResult(result: unknown): string {
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

export function ToolCallPart({ toolName, argsText, result, status }: ToolCallMessagePartProps) {
  const { styles } = useStyles()
  const [open, setOpen] = useState(false)

  const statusType = status?.type ?? 'complete'
  const running = statusType === 'running'
  const failed = statusType === 'incomplete'
  const elapsed = useToolCallElapsed()

  const label = running ? 'Running tool' : failed ? 'Failed tool' : 'Used tool'

  return (
    <div>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {running ? (
          <Loader className={styles.statusIcon} data-spin aria-hidden />
        ) : failed ? (
          <XCircle className={styles.statusIcon} data-failed aria-hidden />
        ) : (
          <Check className={styles.statusIcon} aria-hidden />
        )}
        <span className={styles.label} data-live={running || undefined}>
          {label}: <b>{toolName}</b>
        </span>
        {elapsed !== undefined && (
          <span className={styles.duration}>{formatToolDuration(elapsed)}</span>
        )}
        <ChevronDown
          className={styles.chevron}
          {...(open ? { 'data-open': true } : {})}
          aria-hidden
        />
      </button>

      {open && (
        <div className={styles.content}>
          {argsText ? (
            <div>
              <div className={styles.blockLabel}>Args</div>
              <pre className={styles.pre}>{argsText}</pre>
            </div>
          ) : null}
          {result !== undefined ? (
            <div>
              <div className={styles.blockLabel}>Result</div>
              <pre className={styles.pre}>{formatResult(result)}</pre>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
