import { createStyles } from 'antd-style'
import { Brain, ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Trace } from '@mimir/shared'

/**
 * 检索过程 —— **assistant-ui 官方 registry 的 Reasoning 形态**
 * （`packages/ui/src/components/react/assistant-ui/elements/reasoning.tsx`，
 * shadcn 分发的那一份；用户点名「一定要参考官方实现」。）：
 *
 * - 浅色折叠行承载检索过程，不把过程做成大卡片或时间轴
 * - 触发行：**Brain 图标 + 标签 + ChevronDown**，`text-sm`、muted →
 *   hover 提到正文色；chevron 关闭时 -90°（朝右）、打开时转正
 * - 标签在 live 时 **shimmer**（官方的 `.shimmer` 工具类，这里用
 *   background-clip:text 的渐变扫光换算）并带计秒
 * - 内容：`ps-6 pt-2 pb-2` 的 **muted 正文**（非等宽、无行首标记），
 *   max-h-64 内滚动；分词结果与每步数字是裸文本，比步骤文字再浅一档
 *
 * ## 一个表面，两种状态（D-098 的行为不变，皮按官方）
 *
 * - **干活时（`live`）**：发送后立刻出现——检索结果没到时只有触发行
 *   （shimmer「正在检索知识库…」）；结果一到就地展开成步骤；秒数持续走；
 *   正文一开始输出就折叠回摘要行（折叠标题里的秒数**继续走**）
 * - **干完**：秒数换成服务端记的整轮真实 `tookMs`（流结束前服务端会再推
 *   一份带完整耗时的 trace 覆盖），回到安静的折叠摘要，可点开回看
 *
 * ## 数字必须是真的
 *
 * 摘要里的三个数字与每一步的明细都来自服务端真实执行的结果（见
 * `apps/server/src/services/assistant-stream.ts`）。编的数字比没有更糟。
 * 活着的秒数是唯一一个客户端的钟——它量的是「用户已经等了几秒」，
 * 与服务端的 `tookMs` 不并列同屏（折叠那一刻起才换成服务端的数）。
 */

const useStyles = createStyles(({ css, token }) => ({
  /* 安静的过程记录，贴在它所解释的回答上方。 */
  root: css`
    width: fit-content;
    max-width: 100%;
    margin-bottom: 18px;
    border-radius: ${token.borderRadiusSM}px;
    padding: 2px 9px;
    background: ${token.colorFillQuaternary};
  `,
  /* 触发行：Brain + 标签 + chevron，text-sm，muted → hover 提亮 */
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
    font-size: var(--mimir-chat-font-note, 12.5px);
    color: ${token.colorTextSecondary};
    transition: color 0.15s ease-out;

    &:hover,
    &:focus-visible {
      color: ${token.colorText};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
      border-radius: ${token.borderRadiusSM}px;
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
  /* 官方 chevron：关闭 -90°（朝右）、打开转正，弹簧曲线换算成 antd 的
     motionDurationSlow——旋转本身就是「这行能开」的表达 */
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
  /**
   * 内容：`ps-6 pt-2 pb-2` 的 muted 正文（非等宽、无行首标记），
   * max-h-64（256px）内滚动——官方 ReasoningText 同款。
   * 分词结果与每步数字是裸文本，比步骤文字再浅一档。
   */
  content: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 256px;
    overflow-y: auto;
    padding: 8px 5px 11px 24px;
    font-size: var(--mimir-chat-font-note, 12.5px);
    line-height: 1.7;
    color: ${token.colorTextSecondary};
  `,
  meta: css`
    color: ${token.colorTextQuaternary};
  `,
  /**
   * live 的文字微光（官方 `.shimmer` 工具类的换算）：一段高光扫过文字。
   * background-clip:text 让渐变只涂在字上；keyframes 挂在恒在的容器类上
   * （见 useKeyframes）。
   */
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

const useKeyframes = createStyles(({ css }) => ({
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
 * 活着时的秒数。**计时在叶子组件里**（D-077 的规矩）：不读渲染期的时钟，
 * 挂载起算、卸载即停——组件只在 `live` 的那些相位挂载，所以每轮自动归零。
 */
function LiveSeconds() {
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

export function TraceDisclosure({
  trace,
  live = false,
  expanded = false,
}: {
  trace: Trace | null
  /** 这一轮还在跑（标记变蓝、文字微光；折叠状态由 expanded 驱动） */
  live?: boolean
  /** 还在等正文（正文一出翻 false → 自动折叠） */
  expanded?: boolean
}) {
  const { styles } = useStyles()
  const { styles: kf } = useKeyframes()

  /**
   * 展开/折叠受控。`expanded`（等正文）翻转时跟随——正文一出收起、
   * 新一轮开始展开；两次翻转之间以用户的手动开合为准（他收起的不再被
   * 自动展开）。跟随用的是 React 认可的**渲染期调整**模式，不走
   * effect——「从 props 派生 state」的 effect 是多余的级联渲染
   * （lint 的 set-state-in-effect），这里在渲染里直接改自己的状态。
   */
  const [open, setOpen] = useState(expanded)
  const [followedExpanded, setFollowedExpanded] = useState(expanded)
  if (followedExpanded !== expanded) {
    setFollowedExpanded(expanded)
    setOpen(expanded)
  }

  const seconds = live ? <LiveSeconds /> : <span>{((trace?.tookMs ?? 0) / 1000).toFixed(1)}s</span>

  /* 检索还没回来：只有触发行，shimmer 的「正在检索知识库…」（官方
     streaming 相位的同款——label 微光，内容暂时为空） */
  if (live && trace === null) {
    return (
      <div className={`${styles.root} ${kf.hold}`}>
        <button type="button" className={styles.trigger} aria-expanded={false}>
          <Brain className={styles.triggerIcon} aria-hidden />
          <span className={`${styles.label} ${styles.shimmer}`}>正在检索知识库…</span>
        </button>
      </div>
    )
  }

  if (trace === null) return null

  return (
    <div className={`${styles.root} ${kf.hold}`}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Brain className={styles.triggerIcon} aria-hidden />
        <span className={`${styles.label} ${live ? styles.shimmer : ''}`}>
          思考 {trace.rounds} 轮 · 调用 {trace.tools} 次工具 ({seconds})
        </span>
        <ChevronDown
          className={styles.chevron}
          {...(open ? { 'data-open': true } : {})}
          aria-hidden
        />
      </button>

      {open && (
        <div className={styles.content}>
          {trace.steps.map((step) => (
            <div key={`${step.text}|${step.meta ?? ''}|${step.keywords?.join(',') ?? ''}`}>
              {step.text}
              {/* 分词结果跟在步骤文字后面：裸文本，比步骤文字再浅一档
                  （官方 ReasoningText 是纯 muted prose，没有 Tag 盒子） */}
              {step.keywords && step.keywords.length > 0 && (
                <span className={styles.meta}> {step.keywords.join(' ')}</span>
              )}
              {/* 每一步的具体数字：「词级召回 3 段 · 子串兜底 1 段」。
                  这一行是 trace 里信息量最大的部分——它把「没存过」和
                  「存了但分词没匹配上」区分开 */}
              {step.meta && <span className={styles.meta}> {step.meta}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
