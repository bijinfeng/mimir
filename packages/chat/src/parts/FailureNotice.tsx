import type { FailureKind } from '@mimir/shared'
import { Button, Tooltip } from 'antd'
import { createStyles } from 'antd-style'

/**
 * 模型侧失败。
 *
 * `.trellis/spec/project/product.md` §5.8：**每类失败给不同出路**，而不是统一一个「重试」。
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
    font-size: var(--mimir-chat-font-item, 13.5px);
    font-weight: 600;
    color: ${token.colorErrorText};
    margin-bottom: 7px;
  `,
  detail: css`
    font-size: var(--mimir-chat-font-note, 12.5px);
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
    font-size: var(--mimir-chat-font-badge, 11.5px);
    color: ${token.colorTextTertiary};
    line-height: 1.7;
  `,
  /* 未实现的出路：包一层 span 才能弹 tooltip（antd 的 Button 禁用时
     `pointer-events: none`，事件到不了它自己身上） */
  todo: css`
    display: inline-flex;
    cursor: not-allowed;
  `,
}))

/**
 * 每类失败的出路。
 *
 * `implemented` 是**诚实开关**：这一条出路在 M0 里有没有对应的动作。
 * 为假时按钮真的 `disabled` 并挂「M0 未实现」的 tooltip——原来它看着能点、
 * 点下去什么都不发生（`onClick` 里那两个 `if` 把其余的静默吃掉），
 * 那比不显示更让人困惑：用户以为点了没用，而不是知道这个能力还没有。
 *
 * 出路本身保留（`.trellis/spec/project/product.md` §5.8 要求说清「还能做什么」），
 * 所以不能删掉它们，只能如实标注。
 */

export const FAILURE_UI: Record<
  FailureKind,
  {
    title: string
    /** 预设说明。服务端没给原文时用它 */
    detail: string
    /** 回答「内容丢了吗」与「还能做什么」 */
    note: string
    actions: { label: string; primary?: boolean; implemented?: boolean }[]
  }
> = {
  quota: {
    title: '模型额度用尽',
    detail: '服务商返回余额不足。本次请求没有产生费用，检索结果仍然有效。',
    /* 不写「在 Postgres 上完成」：驱动是部署事实（服务器 PG / 本地与桌面
       SQLite，D-045），界面说死一种就在另一种上说了句可被当场证伪的话 */
    note: '检索在本地数据库完成，不受额度影响',
    actions: [
      { label: '只检索，不调模型', primary: true, implemented: true },
      { label: '换一个模型' },
      { label: '去充值' },
    ],
  },
  timeout: {
    title: '请求超时',
    detail: '等待过久没有响应。命中的分块已经保存在上面，重试不会重新检索。',
    note: '已命中的内容没有丢',
    actions: [
      { label: '重试', primary: true, implemented: true },
      { label: '缩小到当前文档' },
      { label: '只检索，不调模型', implemented: true },
    ],
  },
  truncated: {
    title: '回答被截断',
    detail: '已达到单次输出上限。前面的内容完整，可以接着生成。',
    note: '命中的分块没有被丢弃',
    actions: [
      { label: '接着生成' },
      { label: '只要结论' },
      { label: '只检索，不调模型', primary: true, implemented: true },
    ],
  },
  offline: {
    title: '网络不可达',
    detail: '无法连接模型服务。检索在本地数据库完成，仍然可用。',
    /* 「整理收件箱」随收件箱视图一起退役了（D-054/D-065）——
       那句话指向一个不存在的去处 */
    note: '离线时仍可：全文搜索、阅读与编辑笔记',
    actions: [
      { label: '只检索，不调模型', primary: true, implemented: true },
      { label: '重试', implemented: true },
    ],
  },
}

/** 未实现的动作。写在这里而不是每处现编一句，措辞只有一份 */
const NOT_IMPLEMENTED = 'M0 未实现'

export function FailureCard({
  failure,
  detail,
  deepReasoningKnown = true,
  onSearchOnly,
  onRetry,
}: {
  failure: FailureKind
  /** 服务端给的原始错误信息。通常比预设文案更具体 */
  detail?: string
  /**
   * 「重试 / 只检索」要重发的那一轮，**深度思考开关的值**是不是真的知道。
   *
   * 本轮发出的文本与开关由 ChatPanel 在发送时记下；但失败也可能是**打开
   * 历史会话**时从落库记录回退来的（D-074），而库里没有这两个字段
   * （`packages/shared/src/conversations.ts` 的 messageSchema 只有 text /
   * trace / citations / failure）。那时只能按关闭重发，并且**说出来**——
   * 否则用户以为重试与原轮一模一样，而它其实换了个模型。
   */
  deepReasoningKnown?: boolean
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
        {ui.actions.map((action) => {
          /**
           * 每条出路的可用性写在数据里（见 FAILURE_UI 的 implemented）。
           * 禁用时**保留按钮**：`.trellis/spec/project/product.md` §5.8 的意思是「说清还有哪些
           * 可能」，直接删掉用户就找不到这个入口了。
           *
           * tooltip 包一层 `<span>`：antd 的 Button 在禁用态是
           * `pointer-events: none`，事件到不了按钮自己，Tooltip 也就不会弹。
           */
          const button = (
            <Button
              key={action.label}
              size="small"
              {...(action.primary ? { type: 'primary' as const } : {})}
              disabled={!action.implemented}
              onClick={() => {
                if (action.label.includes('只检索')) onSearchOnly()
                else if (action.label === '重试') onRetry()
              }}
            >
              {action.label}
            </Button>
          )

          return action.implemented ? (
            button
          ) : (
            <Tooltip key={action.label} title={NOT_IMPLEMENTED}>
              <span className={styles.todo}>{button}</span>
            </Tooltip>
          )
        })}
      </div>
      <div className={styles.note}>{ui.note}</div>
      {!deepReasoningKnown && (
        <div className={styles.note}>
          这是历史记录：当时有没有开「深度思考」没有存下来，重试按「关闭」处理
        </div>
      )}
    </div>
  )
}

/**
 * 流中断（不是模型侧失败）。
 *
 * ## 为什么它和 FailureCard 是两张卡
 *
 * `.trellis/spec/project/product.md` §5.8 的四类失败是**模型侧的**：额度、超时、截断、网络。
 * 它们由服务端分类（服务端看得到 HTTP 状态码），每类给不同出路，
 * 而且服务端会**为它们落一条助手消息**（所以历史上还能回看）。
 *
 * 这里说的是另一回事：**请求根本没走完**——建会话的请求失败了，
 * 或者 fetch 抛了（连接被切断、代理挂了）。
 *
 * 出路也因此不同：这一轮没有产生回答，能做的就是重发或把问题捡回输入框。
 *
 * ## 与失败卡互斥的判据变了，但意思没变
 *
 * 服务端先发 `mimir.failure` 再发 `RUN_ERROR`（`assistant-stream.ts`），
 * 所以「服务端已经分类过的失败」会同时让消息进入错误态、也带上
 * `mimir.failure` 这个 part——那时该显示的是 FailureCard 的四条出路，
 * 同一件事说两遍只会更糊。
 *
 * 旧实现的判据是「`chat.failure` 有没有值」；现在是**这条消息里有没有
 * `mimir.failure` part**（由 `MessageItem` 判）。判据的形状变了，效果一样：
 * 分类失败走四类出路那张卡，真·连接中断才走这张。
 */
export function StreamErrorCard({
  detail,
  onRetry,
  onRefill,
}: {
  /** 原始错误文本（`error.message`）。不加工——它通常带着状态码 */
  detail: string
  onRetry: () => void
  onRefill: () => void
}) {
  const { styles } = useStyles()

  return (
    <div className={styles.box}>
      <div className={styles.head}>连接中断</div>
      <div className={styles.detail}>{detail}</div>
      <div className={styles.actions}>
        <Button size="small" type="primary" onClick={onRetry}>
          重试
        </Button>
        <Button size="small" onClick={onRefill}>
          把问题放回输入框
        </Button>
      </div>
      <div className={styles.note}>这一轮没有生成回答，所以知识库里也不会多出一条记录</div>
    </div>
  )
}
