import type { FailureKind } from '@mimir/shared'
import { Button } from 'antd'
import { createStyles } from 'antd-style'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 模型侧失败。
 *
 * `docs/PRD.md` §5.8：**每类失败给不同出路**，而不是统一一个「重试」。
 * 统一重试等于把判断推回给用户，而用户此刻恰恰最缺判断依据——
 * 他不知道这次花没花钱、内容丢没丢、换个做法有没有用。
 *
 * 下表就是那一节的三个问题 × 四种失败的落点。
 *
 * 分类由服务端给出（`mimir.failure` 事件，见 packages/shared 的
 * `FailureEventPayload`）：它看得到 HTTP 状态码与原始错误，而前端只看到
 * 一句被规范化过的文本。让前端按字符串猜会得到反复漂移的判断逻辑。
 */

const useStyles = createStyles(({ css, token }) => ({
  box: css`
    padding: 13px 15px;
    margin-top: 12px;
    border: 1px solid ${token.colorErrorBorder};
    border-radius: 10px;
    background: ${token.colorErrorBg};
  `,
  head: css`
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: ${FONT_SIZE.item}}px;
    font-weight: 600;
    color: ${token.colorErrorText};
    margin-bottom: 7px;
  `,
  detail: css`
    font-size: ${FONT_SIZE.note}}px;
    line-height: 1.75;
    color: ${token.colorTextSecondary};
    word-break: break-word;
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 11px;
  `,
  note: css`
    margin-top: 9px;
    font-size: ${FONT_SIZE.badge}}px;
    color: ${token.colorTextTertiary};
    line-height: 1.7;
  `,
}))

export const FAILURE_UI: Record<
  FailureKind,
  {
    title: string
    /** 预设说明。服务端没给原文时用它 */
    detail: string
    /** 回答「内容丢了吗」与「还能做什么」 */
    note: string
    actions: { label: string; primary?: boolean }[]
  }
> = {
  quota: {
    title: '模型额度用尽',
    detail: '服务商返回余额不足。本次请求没有产生费用，检索结果仍然有效。',
    note: '检索在本地 Postgres 完成，不受额度影响',
    actions: [
      { label: '只检索，不调模型', primary: true },
      { label: '换一个模型' },
      { label: '去充值' },
    ],
  },
  timeout: {
    title: '请求超时',
    detail: '等待过久没有响应。命中的分块已经保存在上面，重试不会重新检索。',
    note: '已命中的内容没有丢',
    actions: [
      { label: '重试', primary: true },
      { label: '缩小到当前文档' },
      { label: '只检索，不调模型' },
    ],
  },
  truncated: {
    title: '回答被截断',
    detail: '已达到单次输出上限。前面的内容完整，可以接着生成。',
    note: '命中的分块没有被丢弃',
    actions: [
      { label: '接着生成', primary: true },
      { label: '只要结论' },
      { label: '只检索，不调模型' },
    ],
  },
  offline: {
    title: '网络不可达',
    detail: '无法连接模型服务。检索在本地数据库完成，仍然可用。',
    note: '离线时仍可：全文搜索、阅读与编辑笔记、整理收件箱',
    actions: [{ label: '只检索，不调模型', primary: true }, { label: '重试' }],
  },
}

export function FailureCard({
  failure,
  detail,
  onSearchOnly,
  onRetry,
}: {
  failure: FailureKind
  /** 服务端给的原始错误信息。通常比预设文案更具体 */
  detail?: string
  onSearchOnly: () => void
  onRetry: () => void
}) {
  const { styles } = useStyles()
  const ui = FAILURE_UI[failure]

  return (
    <div className={styles.box}>
      <div className={styles.head}>{ui.title}</div>
      <div className={styles.detail}>{detail || ui.detail}</div>
      <div className={styles.actions}>
        {ui.actions.map((action) => (
          <Button
            key={action.label}
            size="small"
            {...(action.primary ? { type: 'primary' as const } : {})}
            onClick={() => {
              // 只有这两条出路是当前真能执行的。其余按钮保留是为了**说清
              // 还有哪些可能**——它们背后的能力（换模型、去充值、本地模型）
              // 在 M0 还不存在，点了没反应比不显示更让人困惑，所以禁用它
              if (action.label.includes('只检索')) onSearchOnly()
              else if (action.label === '重试') onRetry()
            }}
          >
            {action.label}
          </Button>
        ))}
      </div>
      <div className={styles.note}>{ui.note}</div>
    </div>
  )
}
