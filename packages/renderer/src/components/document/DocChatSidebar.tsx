import { ChatPanel } from '@mimir/chat'
import type { ChatDocumentAgent } from '@mimir/chat'
import { documentAgentCanvasSupported, documentAgentFormatOf } from '@mimir/shared'
import type { Citation, DocumentDetail } from '@mimir/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button } from 'antd'
import { X } from 'lucide-react'
import { useState } from 'react'
import { ChatThemeBridge } from '../chat/ChatThemeBridge'
import { DocQuickAsks } from './DocChatGuide'
import { useAppShell } from '../../lib/app-shell-context'
import { createChatIo } from '../../lib/chat-io'
import { api } from '../../lib/api'
import { availableDocxAgent } from '../../lib/docx-agent-availability'
import { useUnsaved } from '../../lib/unsaved'
import type { AskDraft } from '../../lib/app-shell-context'
import { useChatComposerStatus } from '../../lib/use-chat-composer-status'
import { useStyles } from './DocumentPanel.style'
import { DocxCapabilityStatus } from './DocxCapabilityStatus'

/**
 * 文档页右侧的对话侧栏（「问 AI」）。
 *
 * ## 为什么回到侧栏（PRD §5.5 的修订，D-087）
 *
 * §5.5 原先规定「AI 只有一个入口：主视图对话」，侧栏被整体删过一次。
 * 这次按用户的决定加回来——**但只加在文档页**：读一篇文档时的提问
 * 天然锚定这一篇，跳去主视图对话意味着离开正在读的内容；语雀的
 * 阅读助手证明了这个场景里「留在原地」是对的。主视图对话仍然是
 * 库级提问的家（它有自己的页面与导航），两个入口并存、分工不同。
 *
 * ## 复用而不是另写一套
 *
 * 对话体是**整个 `ChatPanel`**：流式、检索过程、引用卡、失败卡、
 * 停止、存为笔记——主视图有的它都有。差异只有三个 prop：
 *
 * - `draft.documentId` 锁定单篇：后端的检索只在这一篇里做
 *   （`assistant-stream.ts` 的单篇模式），composer 上显示「当前文档」
 * - `onConversationCreated` 是 no-op：会话 id 由 hook 内部持有，
 *   侧栏不进 URL、不进左侧会话历史的高亮
 * - `onOpenCitation` 由父级决定：同一篇 → 原地滚动高亮；
 *   别的文档 → 走 `openDocument` 导航
 *
 * ## 侧栏活着的时候关闭是**隐藏**而不是卸载
 *
 * 流式进行中关掉再打开，回答还在继续、已生成的内容还在——
 * 卸载会把这些全部丢掉（`useChat` 的客户端随组件销毁）。
 * 所以关闭只把容器折起（宽度 0 + overflow hidden），组件保持挂载，
 * 直到离开这一篇文档才真正卸载。
 */
export interface DocChatSidebarProps {
  doc: DocumentDetail
  /** 打开时的预填（「就这段提问」带选中的话；「问 AI」为空） */
  draft: AskDraft
  onClose: () => void
  /** 引用被点击。同一篇由父级原地高亮，别的文档由父级导航 */
  onOpenCitation: (documentId: string, citation: Citation) => void
  documentAgent?: ChatDocumentAgent | null
}

/** Keep the composer pinned without putting a tutorial in the empty conversation. */
function renderEmptyGuide(): null {
  return null
}

/** 输入框上方的快捷提问。同样必须在模块级（理由见上） */
function renderQuickAsks(ask: (question: string) => void): ReturnType<typeof DocQuickAsks> {
  return <DocQuickAsks onAsk={ask} />
}

export function DocChatSidebar({
  doc,
  draft,
  onClose,
  onOpenCitation,
  documentAgent,
}: DocChatSidebarProps) {
  const { styles } = useStyles()
  const [revisionMode, setRevisionMode] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { runGuarded } = useUnsaved()
  const format = documentAgentFormatOf(doc)
  const isDocx = format === 'docx' && documentAgentCanvasSupported(doc)
  const capabilities = useQuery({
    queryKey: ['docx-agent-capabilities', doc.id],
    queryFn: () => api.conversations.docxAgentCapabilities(doc.id),
    enabled: isDocx && Boolean(documentAgent),
  })
  const documentCapabilities = useQuery({
    queryKey: ['document-agent-capabilities', doc.id],
    queryFn: () => api.conversations.documentAgentCapabilities(doc.id),
    enabled: Boolean(format) && !isDocx,
  })
  const activeAgent =
    documentCapabilities.data?.executorReady &&
    documentCapabilities.data.modelReady &&
    (documentAgent?.format ?? 'docx') === documentCapabilities.data.format
      ? documentAgent
      : null
  const openSettings = (section: 'models' | 'network-search') => {
    runGuarded(() => void navigate({ to: '/settings', search: { scope: 'all', section } }))
  }
  /* 「打开笔记」：存成笔记之后跳到那篇。侧栏不自己处理导航——与
     「问 AI」进来的方式对称（那条也走 appShell） */
  const { openDocument } = useAppShell()
  /* 侧栏的会话不在 URL 里，所以容量 chip 拿不到会话 id——`conversationId`
     传 undefined 时那一支查询是 disabled 的（它会显示「没有记账就不渲染」，
     与侧栏的定位一致：这里不看上下文开销） */
  const composerStatus = useChatComposerStatus(undefined)

  const io = createChatIo({
    invalidate: (keys) => {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: key })
    },
    /* 会话 id 由包内部持有：侧栏不进 URL、不进左侧会话历史的高亮
       （D-087 的三条差异之一）。这里的 no-op 是刻意的 */
    onConversationCreated: () => {},
    onManageModels: () => {
      openSettings('models')
    },
    onOpenDocument: (id) => runGuarded(() => openDocument(id)),
  })

  return (
    /* 注意：这里**不能**用 `styles.aiSidebar`——那是外层折叠容器（宽度过渡 +
       overflow hidden）的类。侧栏内容自己只需要「固定 400px、占满高」，
       套两层折叠类会让内容被自己的 overflow 折成 0.8px（实测踩过）。 */
    <aside className={styles.aiSidebarInner} aria-label="问 AI 侧栏">
      <div className={styles.aiSidebarHeader}>
        <span className={styles.aiSidebarTitle}>问 AI · {doc.title}</span>
        <Button
          type="text"
          size="small"
          aria-label="关闭侧栏"
          icon={<X size={16} />}
          onClick={onClose}
        />
      </div>
      {isDocx ? (
        <DocxCapabilityStatus
          capabilities={capabilities.data}
          loading={!documentAgent || capabilities.isPending}
          error={capabilities.isError}
          onRetry={() => void capabilities.refetch()}
          onSettings={openSettings}
          revisionMode={revisionMode}
          onRevisionModeChange={setRevisionMode}
        />
      ) : format &&
        (documentCapabilities.isError ||
          (documentCapabilities.data &&
            (!documentCapabilities.data.executorReady ||
              !documentCapabilities.data.modelReady ||
              !activeAgent))) ? (
        <section aria-label="文档编辑能力状态" className={styles.aiSidebarStatus}>
          {documentCapabilities.isError
            ? '能力状态读取失败'
            : !documentCapabilities.data?.executorReady
              ? '当前格式暂不可编辑'
              : !documentCapabilities.data.modelReady
                ? '需要聊天模型'
                : '当前画布编辑不可用'}
          {documentCapabilities.isError ? (
            <Button type="link" size="small" onClick={() => void documentCapabilities.refetch()}>
              重试
            </Button>
          ) : documentCapabilities.data?.executorReady && !documentCapabilities.data.modelReady ? (
            <Button type="link" size="small" onClick={() => openSettings('models')}>
              模型设置
            </Button>
          ) : null}
        </section>
      ) : null}
      {/*
        侧栏的内容边距。`--mimir-chat-gutter` 是 ChatPanel 与 Composer
        共用的「栏宽 → 左右边距」比例：主视图 860px 列用 40px（默认值），
        400px 的面板用 16px。设在这里而不是改两个 style 文件——那样会
        把主视图一起改窄。
      */}
      <div className={styles.aiSidebarBody}>
        {/* 边距与字号由这个桥填给包（`--mimir-chat-gutter: 16px` 是
            400px 窄栏的比例；主视图吃 40px 的默认值）。它必须包住面板 */}
        <ChatThemeBridge gutter="16px">
          <ChatPanel
            conversationId={undefined}
            draft={draft}
            onOpenCitation={onOpenCitation}
            onOpenNote={(noteId) => runGuarded(() => openDocument(noteId))}
            io={io}
            composerStatus={composerStatus}
            showReasoningControl={false}
            docxAgent={isDocx ? availableDocxAgent(documentAgent, capabilities.data) : null}
            documentAgent={isDocx ? null : activeAgent}
            docxRevisionMode={revisionMode}
            /* Empty conversation keeps the composer and actionable suggestions at the bottom. */
            guide={renderEmptyGuide}
            guideActions={(ask) => renderQuickAsks(ask)}
          />
        </ChatThemeBridge>
      </div>
    </aside>
  )
}
