import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { DocumentPanel } from '../components/DocumentPanel'
import { LibraryView } from '../components/library/LibraryView'
import { useAppShell } from '../lib/app-shell-context'

/**
 * 文档模式（主区）。
 *
 * 两态由 URL 的 `id` 有无驱动（D-047）：
 *   - 无 `id` → 库视图（浏览）：搜索 + 卡片网格
 *   - 有 `id` → 阅读态：详情占满主区，顶部返回库
 *
 * 「选一条开始看」的空态不再存在——浏览态本身就是可看的内容，
 * 主区不会出现一块等用户点击的空白。
 */
export const Route = createFileRoute('/_app/docs')({
  component: DocsRoute,
})

function DocsRoute() {
  const { openDocument, citation, cameFromChat, backToChat } = useAppShell()
  const navigate = useNavigate()
  const search = useSearch({ from: '/_app' })

  /**
   * 「问 AI」与「就这段提问」由 DocumentPanel 自己的侧栏承接（D-087）——
   * 它们不再导航去主视图对话。路由只剩导航类的回调。
   */
  if (!search.id) {
    return <LibraryView scope={search.scope} />
  }

  return (
    <DocumentPanel
      documentId={search.id}
      citation={citation}
      onBack={() => void navigate({ to: '/docs', search: { scope: search.scope } })}
      onBackToChat={cameFromChat ? backToChat : undefined}
      onOpenDocument={(id) => openDocument(id)}
    />
  )
}
