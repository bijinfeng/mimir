import { createContext, useContext } from 'react'
import type { Citation } from '@mimir/shared'

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

/** 打开收集对话框时的预置项。全部可省——省略即保持对话框自己的默认 */
export interface CaptureOptions {
  /** 初始页签。缺省「粘贴链接」——那是收集对话框的第一入口 */
  tab?: 'url' | 'upload'
  /** 上传文件夹（webkitdirectory 选择器）。与 tab: 'upload' 搭配使用 */
  directory?: boolean
  /** 内容落进的目录（知识库页把它当前路径带进来）；不带 = 库根 */
  folder?: string | null
}

export interface AppShellContextValue {
  askDraft: AskDraft | null
  setAskDraft: (draft: AskDraft | null) => void

  /**
   * 被点击的引用。
   *
   * 文档打开后据此滚动到原文区间并高亮——「点击跳回原文位置」的下半句，
   * 只跳到文档而不指出位置，在长文里等于没跳（`.trellis/spec/project/product.md` §5.1）。
   * 消费一次后由消费方清掉，否则它会跟着用户去下一篇文档。
   */
  citation: Citation | null
  clearHighlight: () => void

  /** 打开某篇文档。scope 决定返回库时回到哪个视图 */
  openDocument: (id: string, scope?: string) => void

  /**
   * 打开「收集内容」对话框。
   *
   * 对话框的实例挂在应用壳（_app.tsx），侧边栏、命令面板与库视图都要能
   * 唤起它——入口可以多个，**对话框必须只有一个**，否则各处自挂一份，
   * 上传进度与粘贴的链接就各活各的了。
   *
   * `options` 让唤起方**跳过一次选择**：库视图的「添加文档」菜单知道用户
   * 想要哪个页签（上传 / 抓取）、也知道内容该落进哪个知识库——这些由
   * 打开它的人决定，而不是让用户在对话框里再选一遍。
   */
  openCapture: (options?: CaptureOptions) => void

  /**
   * 从对话的引用跳去文档。
   *
   * 与 openDocument 的区别是它记住「从哪来」，这样文档顶部能显示
   * 「返回对话」（§5.5）——没有它用户会以为对话没了。
   */
  openCitation: (documentId: string, citation: Citation) => void

  /** 是否从对话跳过来，文档顶部据此决定要不要显示返回入口 */
  cameFromChat: boolean

  /** 新建入口的一次性正文聚焦意图；不能从标题或空正文推断。 */
  newNoteFocusId: string | null
  requestNewNoteFocus: (id: string | null) => void

  /** 跳回刚才那次对话 */
  backToChat: () => void
}

export const AppShellContext = createContext<AppShellContextValue | null>(null)

export function useAppShell(): AppShellContextValue {
  const value = useContext(AppShellContext)
  if (!value) throw new Error('useAppShell 必须在 AppShellContext.Provider 内使用')
  return value
}
