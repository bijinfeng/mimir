import type { ChatDocumentAgent, ChatPanelProps } from '@mimir/chat'
import type { ChatModelCatalog, DocumentDetail } from '@mimir/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import { DocChatSidebar } from './DocChatSidebar'

const capture = vi.hoisted(() => ({ panel: null as ChatPanelProps | null }))
vi.mock('@mimir/chat', () => ({
  ChatPanel: (props: ChatPanelProps) => {
    capture.panel = props
    return null
  },
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn<() => void>() }))
vi.mock('../../lib/app-shell-context', () => ({
  useAppShell: () => ({ openDocument: vi.fn<() => void>() }),
}))
vi.mock('../../lib/unsaved', () => ({
  useUnsaved: () => ({ runGuarded: (action: () => void) => action() }),
}))
vi.mock('../../lib/chat-io', () => ({ createChatIo: () => ({}) }))
vi.mock('../chat/ChatThemeBridge', () => ({
  ChatThemeBridge: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('../../lib/use-chat-composer-status', () => ({
  useChatComposerStatus: () => ({
    models: { catalog, isLoading: false, isError: false, refetch: vi.fn<() => void>() },
  }),
}))

const catalog: ChatModelCatalog = {
  providers: [
    {
      providerId: 'configured',
      providerName: 'Configured provider',
      models: [
        {
          providerId: 'configured',
          modelId: 'selected',
          label: 'Selected model',
          reasoning: { status: 'unsupported' },
          tools: 'supported',
          vision: 'supported',
        },
      ],
    },
  ],
  defaultSelection: { providerId: 'configured', modelId: 'selected' },
}
const doc: DocumentDetail = {
  id: 'doc-1',
  kind: 'file',
  status: 'ready',
  title: '产品说明',
  excerpt: '',
  tags: [],
  path: null,
  url: null,
  mime: null,
  fileExtension: null,
  size: null,
  folder: null,
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
  body: '',
  sourceKey: null,
  parseError: null,
  links: { sources: [], backlinks: [] },
}

it.each(['docx', 'pptx'] as const)(
  'connects the %s host and screenshot transport without a legacy role model',
  async (format) => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    })
    const capabilities = {
      documentId: doc.id,
      format,
      executorReady: true,
      modelReady: false,
      mediaKinds: [],
      availableTools: [],
      unavailableTools: [],
    }
    client.setQueryData(['docx-agent-capabilities', doc.id], capabilities)
    client.setQueryData(['document-agent-capabilities', doc.id], capabilities)
    const agent = { documentId: doc.id, format } as ChatDocumentAgent
    const mime =
      format === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    try {
      await act(async () =>
        root.render(
          <MimirProvider>
            <QueryClientProvider client={client}>
              <DocChatSidebar
                doc={{ ...doc, mime, fileExtension: format }}
                draft={{ documentId: doc.id, text: '' }}
                documentAgent={agent}
                onClose={() => {}}
                onOpenCitation={() => {}}
              />
            </QueryClientProvider>
          </MimirProvider>,
        ),
      )
      expect(capture.panel?.docxAgent).toBe(format === 'docx' ? agent : null)
      expect(capture.panel?.documentAgent).toBe(format === 'pptx' ? agent : null)
      expect(capture.panel?.draftAgent).toBe(agent)
      expect(capture.panel?.snapshotVisionReady).toBe(format === 'pptx')
      expect(host.textContent).toContain('工具能力以输入框所选模型为准')
      expect(host.textContent).not.toContain('尚未配置')
    } finally {
      await act(async () => root.unmount())
      client.clear()
      host.remove()
      capture.panel = null
    }
  },
)
