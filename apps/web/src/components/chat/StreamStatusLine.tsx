import { LoadingOutlined } from '@ant-design/icons'
import { createStyles } from 'antd-style'
import { useEffect, useState } from 'react'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 生成期的状态行：检索中 → 生成中 → 出第一个字即撤。
 *
 * ## 为什么需要它
 *
 * 从按下发送到第一个 token 到达之间，界面上**什么都没有**——检索要跑通道
 * 召回、模型还要建立连接，这段常常是整轮里最长的等待，而它恰恰是唯一
 * 没有任何反馈的一段。落库的「检索过程」要等流结束才是最终版，
 * 引用卡片在检索完成后才发出来，正文更是最后一个。用户看到的是一块空。
 *
 * ## 相位全部由现有数据算出，不新增服务端字段
 *
 *  - `trace` 未到 → 正在检索
 *  - `trace` 到了 → 检索完成，正在生成。命中数只在 `citations` 非空时显示
 *    （两者是背靠背发出来的，但解析可能把它们分到两批；先显示一个
 *    「命中 0 段」再跳成「命中 4 段」是明显的错数字）
 *
 * `docs/PRD.md` §5.6 说这条对个人知识库比对企业的更重要：AI 说「没找到」时
 * 你能分辨是没存过、还是分词没匹配上。状态行是同一件事的前半段——
 * 让「正在找」和「找完了在写」可见。
 *
 * ## 正文一出就撤（不与流式并存两个进度指示）
 *
 * 判据由调用方算（`ChatPanel` 的 `awaitingAnswer`），本组件只管渲染。
 * 光秃秃转着圈的加载指示与正在写的正文同时出现，是两种「还在跑」的说法。
 *
 * ## 计时在这个叶子组件里，不在渲染里读 `Date.now()`
 *
 * 从**挂载**起算（挂载 == 这一轮开始等待），每秒 setState 一次。
 * 与服务端的 `trace.tookMs` 是两个钟，**不要在同一屏并列显示两个「耗时」**。
 */
const useStyles = createStyles(({ css, token }) => ({
  line: css`
    display: flex;
    align-items: center;
    gap: 8px;
    /* 与消息之间同一个间距（thread 的 gap: 20px）：它占的正是回答要出现的位置 */
    margin-top: 20px;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextTertiary};
    font-variant-numeric: tabular-nums;
  `,
  /* 行内图标按 DESIGN §7.1 的 14px，不跟着 12.5px 的文字缩 */
  glyph: css`
    font-size: 14px; /* 图标字形，非文本 */
  `,
}))

export interface StreamStatusLineProps {
  /** 检索过程到了没有（`chat.trace` 为 null 表示还没到） */
  retrieved: boolean
  /** 本轮命中的分块数。`retrieved` 为真且它 > 0 时才显示 */
  hitCount: number
}

export function StreamStatusLine({ retrieved, hitCount }: StreamStatusLineProps) {
  const { styles } = useStyles()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className={styles.line} role="status" aria-live="polite">
      <LoadingOutlined className={styles.glyph} />
      <span>
        {retrieved
          ? `检索完成${hitCount > 0 ? ` · 命中 ${hitCount} 段` : ''} · 正在生成`
          : '正在检索知识库'}{' '}
        · {elapsed}s
      </span>
    </div>
  )
}
