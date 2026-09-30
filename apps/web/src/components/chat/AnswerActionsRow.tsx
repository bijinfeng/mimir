import { ExportOutlined, SaveOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { App as AntApp, Button } from 'antd'
import { useState } from 'react'
import { useChatPanelStyles } from '@/components/chat/ChatPanel.style'
import { api } from '@/lib/api'

/**
 * 「存成笔记」——闭环的最后一环（`docs/PRD.md` §5.7）：对话产出结论，
 * 界面上必须有地方把它沉淀下来。服务端把回答与引用写成站内链接，
 * 存出来的笔记自动进双链系统（services/conversations.ts）。
 *
 * 作用对象是**最后一条助手回答**（读完整篇想存下的就是它）。
 * 落库消息的 id 与界面消息的 id 不同（useChat 会重新生成 id），
 * 所以点击时按会话现取落库记录、按「最后一条助手消息」对齐——
 * 与 `resolveRound` 的取用是同一个模式。服务端按 messageId 幂等：
 * 重复点击返回同一篇笔记，按钮转成「打开笔记」。
 *
 * ## 为什么调用方必须挡住「本轮没有落库回答」的情况
 *
 * 这里的 `save()` 取的是**库里最后一条 assistant**。停止生成、或流一开始
 * 就断掉的时候，服务端根本没写下这一轮的助手行（落库只在 for-await 正常
 * 走完之后发生，`assistant-stream.ts` 的 `persistAssistant`），于是这个
 * 「最后一条」会是**上一轮**的答案——点一下就把上一轮的答案存成笔记，
 * 还提示「已存为笔记」。所以渲染它的条件是「本轮真的有一条非空的回答」，
 * 由 `RoundResult` 把关，不在这里再猜一遍。
 */
export function AnswerActionsRow({
  activeId,
  answerText,
  onOpenNote,
}: {
  activeId: string | undefined
  answerText: string
  onOpenNote: (noteId: string) => void
}) {
  const { styles } = useChatPanelStyles()
  const { message: antdMessage } = AntApp.useApp()
  const queryClient = useQueryClient()
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!activeId) return null

  const save = async () => {
    setSaving(true)
    /**
     * **没有 `finally` 是刻意的。** React Compiler 遇到 `try … finally`
     * 会跳过整个组件（实测报 `CompileError (BuildHIR::lowerStatement)
     * Handle TryStatement with a finalizer ('finally') clause`，而它是**静默的**
     * ——不报错，只是这个组件不再被优化，见 `AGENTS.md` 铁律 1 的同类问题）。
     * 收尾改成两条路径各写一次，行为不变：无论走哪条，`setSaving(false)` 都会执行。
     */
    try {
      // 现取落库消息：流式完成后 onFinish 已让缓存失效，这里拿到的是
      // 含最新回答 id 的一份
      const conversation = await queryClient.fetchQuery({
        queryKey: ['conversation', activeId],
        queryFn: () => api.conversations.get(activeId),
      })
      const lastAssistant = conversation.messages
        .toReversed()
        .find((item) => item.role === 'assistant')
      if (!lastAssistant) {
        antdMessage.warning('没有可保存的回答')
      } else {
        const result = await api.conversations.saveAsNote({ messageId: lastAssistant.id })
        setSavedNoteId(result.noteId)
        void queryClient.invalidateQueries({ queryKey: ['conversation', activeId] })
        antdMessage.success('已存为笔记')
      }
      setSaving(false)
    } catch (error) {
      antdMessage.error(error instanceof Error ? error.message : '存为笔记失败')
      setSaving(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answerText)
      antdMessage.success('已复制')
    } catch {
      antdMessage.error('复制失败')
    }
  }

  return (
    <div className={styles.saveRow}>
      {savedNoteId ? (
        <Button
          type="text"
          size="small"
          icon={<ExportOutlined />}
          onClick={() => onOpenNote(savedNoteId)}
        >
          打开笔记
        </Button>
      ) : (
        <Button
          type="text"
          size="small"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={() => void save()}
        >
          存成笔记
        </Button>
      )}
      <Button type="text" size="small" onClick={() => void copy()}>
        复制
      </Button>
    </div>
  )
}
