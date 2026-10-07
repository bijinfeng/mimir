import type { ChatDraft } from './types.js'
import { useChatPanelStyles } from './ChatPanel.style.js'

/**
 * 对话空态（主视图的居中舞台）。
 *
 * 它曾经列出「待整理的内容」，让刚收进来的东西一键带进对话
 * （`docs/PRD.md` §5.10）。收件箱退役后（D-054）那个列表没有依据了——
 * 新内容直接可用，不存在「待」这个状态。空态因此回到它本来的职责：
 * 说清楚这个输入框会做什么。
 *
 * 原先那条动机（「我刚收了东西，想问问」）由**库视图**承接：内容一进来
 * 就在全部文档里，选中它点「问 AI」就带着上下文进对话，不需要空态再挑几条。
 *
 * 只认 `draft` 里**有没有锁定范围**：侧栏的指南模式不走这里（它自己
 * 带问候语，见 `ChatThread` 的 guide 分支）。
 */
export function EmptyStage({ draft }: { draft: ChatDraft | null }) {
  const { styles } = useChatPanelStyles()

  return (
    <div className={styles.empty}>
      <div className={styles.emptyTitle}>{draft ? '就这一篇提问' : '问点什么'}</div>
      <div className={styles.emptySub}>
        {draft
          ? '上下文已经准备好，范围锁定在这篇文档'
          : '它会先在你的知识库里检索，再基于命中的原文回答，并给出引用'}
      </div>
    </div>
  )
}
