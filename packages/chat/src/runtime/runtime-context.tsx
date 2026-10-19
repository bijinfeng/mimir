import { createContext, useContext } from 'react'
import type { UIMessage } from '@tanstack/ai'
import type {
  Citation,
  DocxAgentHistory,
  FailureKind,
  ChatAttachment,
  ChatModelSelection,
} from '@mimir/shared'
import type { ChatPptxSnapshot } from '../types.js'

export interface MessageSidecar {
  savedNoteId?: string
  citations?: Citation[]
  failure?: { kind: FailureKind; detail: string }
  agent?: DocxAgentHistory
  error?: string
  stopped?: boolean
  reasoningRunning?: boolean
  modelSelection?: ChatModelSelection
  retrievalScope?: import('@mimir/shared').RetrievalScope
  attachments?: ChatAttachment[]
  snapshot?: ChatPptxSnapshot
}
export interface SendIntent {
  id: string
  text: string
  agent?: import('../types.js').ChatDocxAgent
  documentId: string | null
  modelSelection?: ChatModelSelection
  scope?: 'search'
  attachments: ChatAttachment[]
  snapshot?: ChatPptxSnapshot
  config: Record<string, unknown>
}
export interface ClientInterrupt {
  id: string
  reason: string
  metadata?: Record<string, unknown>
}
export interface ResumeTarget {
  threadId: string
  runId: string
}
export interface ToolResponse {
  interruptId: string
  status: 'resolved' | 'cancelled'
  payload?: unknown
}
export interface RuntimeView {
  messages: UIMessage[]
  sidecars: Record<string, MessageSidecar>
  running: boolean
  canEditBranch: boolean
  branch: { index: number; count: number; select: (index: number) => void }
  loading: boolean
  loadError: string | null
  reloadHistory: () => void
  draft: string
  setDraft: (text: string) => void
  queue: SendIntent[]
  files: ChatAttachment[]
  uploading: boolean
  addFiles: (files: File[]) => void
  removeFile: (id: string) => void
  snapshot: ChatPptxSnapshot | undefined
  applySnapshotDraft: (snapshot?: ChatPptxSnapshot) => boolean
  error: string | null
  clearError: () => void
  send: (text?: string, options?: { scope?: 'search'; documentId?: string | null }) => void
  stop: () => void
  interrupts: ClientInterrupt[]
  resumeTarget: ResumeTarget | null
  submit: (responses: ToolResponse[], target?: ResumeTarget) => Promise<void>
  getRound: () => { id: string; version: number } | null
  advanceVersion: (version: number) => void
  registerToolCancel: (cancel: (() => void) | null) => void
}
export const RuntimeContext = createContext<RuntimeView | null>(null)
export function useChatRuntime(): RuntimeView {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error('聊天运行时缺失')
  return runtime
}
export const MessageContext = createContext<{
  message: UIMessage
  sidecar: MessageSidecar
  running: boolean
} | null>(null)
export function useChatMessage() {
  const context = useContext(MessageContext)
  if (!context) throw new Error('消息上下文缺失')
  return context
}
