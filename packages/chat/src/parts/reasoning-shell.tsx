import { createStyles } from 'antd-style'
import { Brain, ChevronDown } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * 官方 Reasoning 外壳（assistant-ui registry `reasoning.tsx` 的换算），
 * 两处共用：
 *
 *  - `parts/TraceActivity.tsx` 的**检索过程**（label 是「思考 N 轮 ·
 *    调用 M 次工具 (Xs)」）
 *  - `parts/ReasoningPart.tsx` 的**模型思考**（reasoning part，label 是
 *    「模型思考 (Xs)」）
 *
 * 两者的皮完全是同一个东西（Brain + 标签 + chevron 的触发行、描边圆角盒、
 * `ps-6` 缩进的内容、live 的 shimmer），差别只在标签文案与内容——
 * 各写一份必然漂移，所以外壳只此一处。
 *
 * 形态出处（每一条都是官方换算）：
 * - root：`rounded-lg border px-3 py-2 mb-4`（variant=outline 为默认）
 * - trigger：`text-sm text-muted-foreground hover:text-foreground py-1.5
 *   gap-2 active:scale-[0.98]`；标签 live 时 `.shimmer`
 * - chevron：`-rotate-90` → 打开 `rotate-0`，
 *   `ease-[cubic-bezier(0.32,0.72,0,1)]` 换算成 0.2s ease-out
 * - content：`ps-6 pt-2 pb-2` 的 muted 正文
 */
export const useReasoningStyles = createStyles(({ css, token }) => ({
  root: css`
    margin-bottom: 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    padding: 8px 12px;
  `,
  trigger: css`
    display: flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    max-width: 75%;
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
  triggerIcon: css`
    flex: none;
    width: 16px;
    height: 16px;
  `,
  label: css`
    line-height: 1;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
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
    max-height: 256px;
    overflow-y: auto;
    padding: 8px 0 8px 24px;
    font-size: var(--mimir-chat-font-body, 14px);
    line-height: 1.7;
    color: ${token.colorTextSecondary};
  `,
  meta: css`
    color: ${token.colorTextQuaternary};
  `,
  /* live 的文字微光（官方 `.shimmer` 的换算） */
  shimmer: css`
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
    animation: me-reasoning-shimmer 1.6s linear infinite;
  `,
}))

/** shimmer 的 keyframes 挂在恒在的容器类上（见 TraceActivity 原注释） */
export const useReasoningKeyframes = createStyles(({ css }) => ({
  hold: css`
    @keyframes me-reasoning-shimmer {
      from {
        background-position: 200% 0;
      }
      to {
        background-position: -200% 0;
      }
    }
  `,
}))

/**
 * 活着时的秒数。计时在叶子组件里（D-077 的规矩）：挂载起算、卸载即停
 * ——组件只在 `live` 的那些相位挂载，所以每轮自动归零。
 */
export function LiveSeconds() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const startedAt = performance.now()
    const tick = () => setSeconds(Math.floor((performance.now() - startedAt) / 1000))
    tick()
    const timer = window.setInterval(tick, 500)
    return () => window.clearInterval(timer)
  }, [])

  return <span>{seconds}s</span>
}

/** 外壳盒。`hold` 那个类把 shimmer 的 keyframes 放进样式表（见上面的说明） */
export function ReasoningRoot({ children }: { children: ReactNode }) {
  const { styles } = useReasoningStyles()
  const { styles: kf } = useReasoningKeyframes()

  return <div className={`${styles.root} ${kf.hold}`}>{children}</div>
}

/**
 * 触发行：Brain + 标签 + chevron。`live` 时标签 shimmer。
 * 内容是 children（标签文案由调用方组装）。
 */
export function ReasoningTrigger({
  live,
  open,
  onClick,
  children,
}: {
  live: boolean
  open: boolean
  onClick: () => void
  children: ReactNode
}) {
  const { styles } = useReasoningStyles()

  return (
    <button type="button" className={styles.trigger} aria-expanded={open} onClick={onClick}>
      <Brain className={styles.triggerIcon} aria-hidden />
      <span className={`${styles.label} ${live ? styles.shimmer : ''}`}>{children}</span>
      <ChevronDown
        className={styles.chevron}
        {...(open ? { 'data-open': true } : {})}
        aria-hidden
      />
    </button>
  )
}

/** 缩进内容（`ps-6` 的换算）：外面还是同一套 muted 正文 */
export function ReasoningContent({ children }: { children: ReactNode }) {
  const { styles } = useReasoningStyles()

  return <div className={styles.content}>{children}</div>
}
