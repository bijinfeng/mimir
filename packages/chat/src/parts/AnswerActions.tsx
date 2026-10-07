import { useAuiState } from '@assistant-ui/react'
import { App as AntApp, Tooltip } from 'antd'
import { Check, Copy, ExternalLink, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createStyles } from 'antd-style'
import { useMimirChatApi } from '../runtime/chat-context.js'

/**
 * 回答下的动作条：「存成笔记」与「复制」。
 *
 * ## 「存成笔记」是闭环的最后一环（`docs/PRD.md` §5.7）
 *
 * 对话产出结论，界面上必须有地方把它沉淀下来。服务端把回答与引用写成
 * 站内链接，存出来的笔记自动进双链系统（services/conversations.ts）。
 *
 * 作用对象是**最后一条助手回答**（读完整篇想存下的就是它）。落库消息的 id
 * 与界面消息的 id 不同（引擎会把客户端的乐观 id 换成服务端 id），所以
 * 点击时按会话**现取落库记录**、取「最后一条助手消息」——那段逻辑留在宿主
 * （它手上有 queryClient），包只调 `io.saveAsNote(activeId)`。
 * 服务端按 messageId 幂等：重复点击返回同一篇笔记，按钮转成「打开笔记」。
 *
 * ## 门控只有两条
 *
 * 旧实现是三个（`round.visible` / `!stopped` / `answerText` 非空），因为
 * 「本轮结果」是另一条数据流，得自己判断它在不在。现在动作条是**消息的一部分**
 * （挂在消息根上、只在最后一条渲染），所以只剩：
 *
 *  1. **这条消息的正文非空**——停止生成、或流一开始就断掉时引擎会留下
 *     一个没有正文的助手消息；`saveAsNote` 取的是库里最后一条 assistant，
 *     那时它会是**上一轮**的答案（点一下就把上一轮的答案存成笔记，还提示
 *     「已存为笔记」）。宁可少一个按钮，也不许它说谎
 *  2. **这一轮结束了**（状态不是 running）——生成中不给保存入口：
 *     落库发生在流走完之后
 *
 * 「停止之后不给动作条」那条门控由这两个条件自然覆盖：停止的轮次要么没有
 * 正文、要么状态是 incomplete——两者都不该保存（库里没有这一轮的助手行）。
 */
const useStyles = createStyles(({ css, token }) => ({
  /*
   * 动作条（assistant-ui 的 AssistantActionBar 形态）：`mt-2` 的一排
   * **图标幽灵钮**，`muted-foreground/70` → hover 提到 foreground，
   * 不铺底色、不带文字标签——它是次级动作，扫一眼有、读起来不吵。
   * 左对齐跟在回答下面（上游同款），不靠右。
   */
  row: css`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  `,
  /*
   * 单颗钮 = 官方 TooltipIconButton 的换算：size-6（24px）p-1、
   * ghost（hover 浅底）、**按下缩 0.9**（active:scale-90，官方那枚
   * 按钮的「按下去」手感）、tooltip 包在外层。
   */
  button: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 4px;
    border: none;
    background: none;
    border-radius: ${token.borderRadiusSM}px;
    color: ${token.colorTextQuaternary};
    cursor: pointer;
    transition:
      color 0.12s ease-out,
      background-color 0.12s ease-out,
      transform 0.12s ease-out;

    &:hover,
    &:focus-visible {
      color: ${token.colorText};
      background: ${token.colorFillTertiary};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }
    &:active {
      transform: scale(0.9);
    }
    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  `,
  saved: css`
    color: ${token.colorLink};

    &:hover,
    &:focus-visible {
      color: ${token.colorLink};
    }
  `,
}))

export function AnswerActions() {
  const { styles } = useStyles()
  const api = useMimirChatApi()
  const { message: antdMessage } = AntApp.useApp()

  /**
   * 这条消息的正文。动作条挂在消息根上，所以 `s.message` 就是它自己。
   * **`getCopyText()` 不走它**：它是「整条消息的纯文本」，而我们要的是
   * 「用户看到的正文」——同一条消息里还有 trace / 引用那几个 data part，
   * 它们的 JSON 不该被复制进去。
   */
  const text = useAuiState((state) =>
    state.message.parts.map((part) => (part.type === 'text' ? part.text : '')).join(''),
  )
  const status = useAuiState((state) => state.message.status?.type)

  const [savedNoteId, setSavedNoteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  /* 复制状态 2 秒后自己回去（与代码块复制同一套） */
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  /**
   * 正文为空、还在生成、或没有会话 id → 整条不渲染。
   *
   * 没有 activeId 是不可能的（有回答就有会话），但它是 undefined 时
   * `saveAsNote` 会拿到 undefined——宁可少个按钮。
   */
  if (text.trim().length === 0 || status === 'running' || api.activeId === undefined) {
    return null
  }

  const save = async () => {
    setSaving(true)
    /**
     * **没有 `finally` 是刻意的。** React Compiler 遇到 `try … finally`
     * 会跳过整个组件（实测报 `CompileError (BuildHIR::lowerStatement)
     * Handle TryStatement with a finalizer ('finally') clause`，而它是**静默的**
     * ——不报错，只是这个组件不再被优化，见铁律 1 的同类问题）。
     * 收尾改成两条路径各写一次，行为不变：无论走哪条，`setSaving(false)` 都会执行。
     */
    try {
      const result = await api.saveAsNote()
      setSavedNoteId(result.noteId)
      antdMessage.success('已存成笔记')
      setSaving(false)
    } catch (error) {
      antdMessage.error(error instanceof Error ? error.message : '存成笔记失败')
      setSaving(false)
    }
  }

  return (
    <div className={styles.row}>
      {savedNoteId === null ? (
        <Tooltip title="存成笔记">
          <button
            type="button"
            className={styles.button}
            aria-label="存成笔记"
            disabled={saving}
            onClick={() => void save()}
          >
            <Save size={16} />
          </button>
        </Tooltip>
      ) : (
        <Tooltip title="打开笔记">
          <button
            type="button"
            className={`${styles.button} ${styles.saved}`}
            aria-label="打开笔记"
            onClick={() => api.onOpenNote(savedNoteId)}
          >
            <ExternalLink size={16} />
          </button>
        </Tooltip>
      )}
      {/* 复制态换图标（官方同款：Copy ↔ Check） */}
      <Tooltip title={copied ? '已复制' : '复制回答'}>
        <button
          type="button"
          className={styles.button}
          aria-label={copied ? '已复制' : '复制回答'}
          onClick={() => {
            void navigator.clipboard
              .writeText(text)
              .then(() => {
                setCopied(true)
                antdMessage.success('已复制')
              })
              .catch(() => antdMessage.error('复制失败'))
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </Tooltip>
    </div>
  )
}
