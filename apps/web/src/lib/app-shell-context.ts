import { createContext, useContext } from 'react'

/**
 * 三栏之间共享的状态。
 *
 * 为什么用 React context 而不是路由的 Outlet context：这一版 TanStack Router
 * 没有 `useOutletContext`。更重要的是，这些状态**不完全属于路由**——
 * 「问 AI 的草稿」是一次跳转的瞬时状态，「当前会话」要被中栏和右栏同时消费。
 * 它们不改变路由本身，也不该被写进 URL（刷新后草稿应当消失）。
 *
 * 放在这里而不是各栏内部：消费它们的是兄弟栏位。放在任何一栏里，
 * 另一栏都拿不到，只能把状态一路往上提——提到这里就是它的归宿。
 */

/**
 * 从文档工具条或内联工具条「问 AI」时带进对话的上下文。
 *
 * 瞬时状态，不进 URL：它只在跳转的那一次有意义，刷新后就该消失。
 */
export interface AskDraft {
  /** 预填进输入框的内容。空串表示只锁范围、不预填 */
  text: string
  /** 锁定的范围：这一篇 */
  documentId?: string
}

export interface AppShellContextValue {
  askDraft: AskDraft | null
  setAskDraft: (draft: AskDraft | null) => void

  /** 打开某篇文档。scope 决定返回库时回到哪个视图 */
  openDocument: (id: string, scope?: string) => void

  /**
   * 从对话的引用跳去文档。
   *
   * 与 openDocument 的区别是它记住「从哪来」，这样文档顶部能显示
   * 「返回对话」（§5.5）——没有它用户会以为对话没了。
   * （原设计还带 citation 做原文区间高亮，那个功能尚未实现、
   * 死状态已随 D-047 移除；实现时把它加回签名。）
   */
  openCitation: (documentId: string) => void

  /** 是否从对话跳过来，文档顶部据此决定要不要显示返回入口 */
  cameFromChat: boolean

  /** 跳回刚才那次对话 */
  backToChat: () => void
}

export const AppShellContext = createContext<AppShellContextValue | null>(null)

export function useAppShell(): AppShellContextValue {
  const value = useContext(AppShellContext)
  if (!value) throw new Error('useAppShell 必须在 AppShellContext.Provider 内使用')
  return value
}
