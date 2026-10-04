import { Button } from 'antd'
import { RefreshCw } from 'lucide-react'
import { createStyles } from 'antd-style'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 读取失败 + 重试。
 *
 * ## 为什么必须有它（而不是让失败的查询渲染成「空」）
 *
 * 全仓有六处列表/分区只写了 `isLoading` 分支，失败时 `data` 是 undefined，
 * 于是界面走进「空」那一支：文档列表说「这里还是空的」、知识库说
 * 「还没有知识库，点上方 ＋ 创建」、会话列表说「还没有对话」、
 * 设置分区则永远停在骨架屏上。**这是界面在说谎**——用户会以为数据没了、
 * 或者以为它在加载，而真实情况是请求失败了，刷新一下就能好。
 *
 * 判据因此是 `isError`（不是 `!data`）：`!data` 会把「还在加载」与
 * 「加载失败」混成一种形态。
 *
 * ## 为什么动作是「重试」而不是自动重试
 *
 * 与根路由的错误兜底同一条规矩（`routes/__root.tsx`）：先如实说出发生了什么，
 * 再给一个用户按得下去的动作。react-query 自己会为网络错误重试几次，
 * 走到这里说明它已经放弃了——再自动重试只是把「失败」变成「一直在转」。
 *
 * 文案不出现技术细节（URL、状态码）：能给用户参考的是「东西没丢，
 * 刷新即可」这一层信息。
 */
export function LoadError({
  message = '读取失败',
  detail = '数据还在，重试一下就能出来。',
  onRetry,
  compact = false,
}: {
  message?: string
  detail?: string
  onRetry: () => void
  /** 紧凑档：侧栏这类窄容器里用，纵向内距更小 */
  compact?: boolean
}) {
  const { styles } = useStyles()
  return (
    <div className={`${styles.box} ${compact ? styles.boxCompact : ''}`}>
      <span className={styles.text}>
        <b>{message}</b>
        <span className={styles.detail}>{detail}</span>
      </span>
      <Button size="small" icon={<RefreshCw size={14} />} onClick={onRetry}>
        重试
      </Button>
    </div>
  )
}

const useStyles = createStyles(({ css, token }) => ({
  box: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 8px;
    background: ${token.colorFillQuaternary};
  `,
  boxCompact: css`
    padding: 10px 12px;
  `,
  text: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.6;
  `,
  detail: css`
    color: ${token.colorTextTertiary};
    font-size: ${FONT_SIZE.meta}px;
  `,
}))
