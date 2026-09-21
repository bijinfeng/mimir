import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { DocumentPanel } from '@/components/DocumentPanel'
import { useAppShell } from '@/lib/app-shell-context'

/**
 * 文档模式（右栏）。
 *
 * `id` 为空时右栏显示「选一条开始看」——这是初始状态：
 * 用户从收件箱进来，中栏已经列出内容，右栏等他点。
 */
export const Route = createFileRoute('/_app/docs')({
  component: DocsRoute,
})

function DocsRoute() {
  const { setAskDraft, openDocument, cameFromChat, backToChat } = useAppShell()
  const navigate = useNavigate()
  const search = useSearch({ from: '/_app' })

  /**
   * 带着上下文进对话。
   *
   * **必须导航。** 只 `setAskDraft` 而不换路由的话，草稿存下了但界面还停在
   * 文档视图——用户点了「问 AI」什么都没发生（实测踩过：按钮有反馈、
   * 输入框却没出现）。
   *
   * 这两个入口是删掉 AI 侧栏后补的三件事里的两件（`docs/PRD.md` §5.5）：
   *  - 「问 AI」：带整篇的上下文，范围锁到当前文档
   *  - 「就这段提问」：同上，但把选中的话预填进输入框，比问整篇精确
   */
  const goAsk = (documentId: string, passage?: string) => {
    setAskDraft({
      ...(passage
        ? // 引用前缀让模型知道「这段」指什么；截断到 200 字避免输入框被撑爆
          { text: `关于这篇里这段：\n> ${passage.replace(/\n+/g, ' ').slice(0, 200)}\n\n` }
        : { text: '' }),
      documentId,
    })
    void navigate({ to: '/chat', search: { scope: search.scope } })
  }

  return (
    <DocumentPanel
      documentId={search.id}
      onBackToChat={cameFromChat ? backToChat : undefined}
      onAskAi={(documentId) => goAsk(documentId)}
      onAskAboutSelection={(documentId, passage) => goAsk(documentId, passage)}
      onOpenDocument={(id) => openDocument(id)}
    />
  )
}
