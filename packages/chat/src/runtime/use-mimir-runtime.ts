import { useChat } from '@tanstack/ai-react'
import type { StreamChunk, ContentPart, UIMessage } from '@tanstack/ai'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { ChatAttachment, ChatModelSelection, Citation, FailureKind } from '@mimir/shared'
import type {
  ChatComposerStatus,
  ChatDocxAgent,
  ChatDraftAgent,
  ChatPptxSnapshot,
} from '../types.js'
import type { ChatIo } from './io.js'
import type { AskOptions, MimirChatApi } from './chat-context.js'
import type {
  MessageSidecar,
  RuntimeView,
  SendIntent,
  ClientInterrupt,
  ResumeTarget,
  ToolResponse,
} from './runtime-context.js'
import { createChatTransport } from './transport.js'
import { createHistoryAdapter } from './history.js'
import { PptxSnapshotRegistry, assertSnapshotTarget } from './pptx-snapshot.js'
import { emptyProtocolState, reduceProtocolState } from './protocol-state.js'
import { assertModel } from './model-settings.js'

/** One TanStack engine, one Mimir FIFO, and one synchronous immutable intent per submission. */
export function useMimirRuntime(options: {
  io: ChatIo
  conversationId: string | undefined
  onOpenCitation: (id: string, citation: Citation) => void
  onOpenNote: (id: string) => void
  docxAgent?: ChatDocxAgent | null
  draftAgent?: ChatDraftAgent | null
  snapshotVisionReady?: boolean
  composerStatus: ChatComposerStatus
  modelSelection: ChatModelSelection | undefined
  setModelSelection: (value: ChatModelSelection | undefined) => void
  documentId: string | null
  setDocumentId: (id: string | null) => void
}) {
  const { io } = options
  const [activeId, setActiveId] = useState(options.conversationId)
  const [draft, setDraftState] = useState('')
  const [files, setFiles] = useState<ChatAttachment[]>([])
  const [snapshot, setSnapshot] = useState<ChatPptxSnapshot>()
  const [queue, setQueue] = useState<SendIntent[]>([])
  const [branchIndex, setBranchIndex] = useState(0)
  const [branchCount, setBranchCount] = useState(1)
  const [sidecars, setSidecars] = useState<Record<string, MessageSidecar>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(options.conversationId))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [sentHere, setSentHere] = useState(false)
  const [interrupts, setInterrupts] = useState<ClientInterrupt[]>([])
  const [resumeTarget, setResumeTarget] = useState<ResumeTarget | null>(null)
  const [registry] = useState(() => new PptxSnapshotRegistry())
  const [round] = useState<{ id: string | null; version: number | null }>(() => ({
    id: null,
    version: null,
  }))
  const [selection] = useState<{ value: unknown }>(() => ({ value: null }))
  const [cell] = useState(() => ({
    busy: false,
    protocol: emptyProtocolState(),
    failed: false,
    stopped: false,
    draft: '',
    files: [] as ChatAttachment[],
    snapshot: undefined as ChatPptxSnapshot | undefined,
    queue: [] as SendIntent[],
    current: undefined as SendIntent | undefined,
    assistantId: '',
    canonicalIds: new Map<string, string>(),
    branches: [] as { messages: UIMessage[]; sidecars: Record<string, MessageSidecar> }[],
    branchIndex: 0,
    pending: {} as MessageSidecar,
    target: null as ResumeTarget | null,
    interrupts: [] as ClientInterrupt[],
    uploads: new Set<AbortController>(),
    pendingFiles: new Map<string, AbortController>(),
    leaseId: crypto.randomUUID(),
    leases: new Map<string, ChatAttachment>(),
    boundFiles: new Set<string>(),
    sent: new Map<string, SendIntent>(),
    transportError: false,
    tools: null as (() => void) | null,
    live: true,
  }))
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  const [transport] = useState(() =>
    createChatTransport({
      io,
      ...(options.conversationId ? { conversationId: options.conversationId } : {}),
      round,
      selection,
      agent: () => latest.current.docxAgent,
      onCreated: (id) => {
        if (!cell.live) return
        setActiveId(id)
        io.onConversationCreated(id)
      },
      validate: (config, resuming) => {
        if (
          config.agentRoundId &&
          (cell.current?.agent !== latest.current.docxAgent ||
            config.agentDocumentId !== latest.current.docxAgent?.documentId ||
            config.agentFormat !== (latest.current.docxAgent?.format ?? 'docx'))
        )
          throw new Error('文档来源已关闭或替换，请重新发送指令')
        const selected = config.agentSelection as { pptxSnapshotId?: string } | undefined
        if (!selected?.pptxSnapshotId) return
        const item = registry.byId(selected.pptxSnapshotId)
        if (!item.sourceIsCurrent()) throw new Error('截图来源已关闭或替换，请重新准备美化草稿')
        if (!latest.current.docxAgent || !latest.current.snapshotVisionReady)
          throw new Error('截图美化需要可用的聊天模型并启用视觉输入，请前往模型设置')
        if (!resuming)
          assertSnapshotTarget(item, latest.current.draftAgent ?? latest.current.docxAgent)
      },
    }),
  )
  function patchSidecar(patch: Partial<MessageSidecar>) {
    cell.pending = { ...cell.pending, ...patch }
    if (cell.assistantId)
      setSidecars((current) => ({
        ...current,
        [cell.assistantId]: { ...current[cell.assistantId], ...cell.pending },
      }))
  }
  function observe(chunk: StreamChunk) {
    // Inspect only documented fields. Business data never becomes synthetic model reasoning.
    const event = chunk as unknown as Record<string, unknown>
    cell.protocol = reduceProtocolState(cell.protocol, event)
    if (event.type === 'RUN_STARTED') {
      cell.target = { threadId: String(event.threadId), runId: String(event.runId) }
      setResumeTarget(cell.target)
    }
    if (
      (event.type === 'TEXT_MESSAGE_START' && event.role === 'assistant') ||
      event.type === 'REASONING_MESSAGE_START'
    ) {
      cell.assistantId = String(event.messageId)
      patchSidecar({})
    }
    if (event.type === 'TOOL_CALL_START' && typeof event.parentMessageId === 'string') {
      cell.assistantId = event.parentMessageId
      patchSidecar({})
    }
    if (event.type === 'REASONING_START') patchSidecar({ reasoningRunning: true })
    if (event.type === 'REASONING_END') patchSidecar({ reasoningRunning: false })
    if (event.type === 'CUSTOM') {
      const value = event.value as Record<string, unknown> | undefined
      if (
        event.name === 'mimir.message' &&
        typeof value?.messageId === 'string' &&
        typeof value.clientMessageId === 'string'
      ) {
        cell.canonicalIds.set(value.clientMessageId, value.messageId)
        if (value.role === 'user')
          cell.current?.attachments.forEach((file) => cell.boundFiles.add(file.id))
      }
      if (event.name === 'mimir.citations' && Array.isArray(value?.citations))
        patchSidecar({ citations: value.citations as Citation[] })
      if (event.name === 'mimir.failure' && typeof value?.failure === 'string')
        patchSidecar({
          failure: { kind: value.failure as FailureKind, detail: String(value.message ?? '') },
        })
      if (
        (event.name === 'mimir.documentAgent' || event.name === 'mimir.docxAgent') &&
        value?.agent
      )
        patchSidecar({ agent: value.agent as MessageSidecar['agent'] })
    }
    if (event.type === 'RUN_ERROR') {
      cell.failed = true
      const detail = typeof event.message === 'string' ? event.message : '连接中断'
      patchSidecar({ error: detail, reasoningRunning: false })
    }
    if (event.type === 'RUN_FINISHED') {
      patchSidecar({ reasoningRunning: false })
      const outcome = event.outcome as { type?: string; interrupts?: ClientInterrupt[] } | undefined
      const list = outcome?.type === 'interrupt' ? (outcome.interrupts ?? []) : []
      cell.interrupts = list
      setInterrupts(list)
    }
  }
  const chat = useChat({
    connection: transport.connection,
    ...(options.conversationId ? { threadId: options.conversationId } : {}),
    onChunk: observe,
    onError: (failure) => {
      cell.failed = true
      cell.transportError = true
      patchSidecar({ error: failure.message, reasoningRunning: false })
      setError(failure.message)
    },
  })
  const chatRef = useRef(chat)
  useEffect(() => {
    chatRef.current = chat
  })
  function setDraft(text: string) {
    cell.draft = text
    setDraftState(text)
  }
  function updateFiles(next: ChatAttachment[]) {
    cell.files = next
    setFiles(next)
  }
  function updateQueue(next: SendIntent[]) {
    cell.queue = next
    setQueue(next)
  }
  function applySnapshotDraft(next?: ChatPptxSnapshot) {
    try {
      if (next) {
        assertSnapshotTarget(next, latest.current.draftAgent ?? latest.current.docxAgent)
        registry.add(
          next,
          [...cell.queue, ...(cell.current ? [cell.current] : [])].flatMap((item) =>
            item.snapshot ? [item.snapshot.image.name] : [],
          ),
        )
      }
      cell.snapshot = next
      setSnapshot(next)
      if (!cell.transportError) setError(null)
      return true
    } catch (failure) {
      setError(errorText(failure))
      return false
    }
  }
  function restore(intent: SendIntent, automatic = false) {
    if (automatic && (cell.draft.trim() || cell.files.length || cell.snapshot)) return false
    cell.snapshot = intent.snapshot
    setSnapshot(intent.snapshot)
    setDraft(intent.text)
    updateFiles(intent.attachments)
    latest.current.setDocumentId(intent.documentId)
    latest.current.setModelSelection(intent.modelSelection)
    return true
  }
  function restoreQueued(id?: string) {
    const item = id ? cell.queue.find((entry) => entry.id === id) : cell.queue[0]
    if (item && restore(item, !id)) updateQueue(cell.queue.filter((entry) => entry.id !== item.id))
  }
  function capture(text: string, overrides?: AskOptions): SendIntent {
    const settings = latest.current
    const model =
      overrides?.scope === 'search'
        ? undefined
        : assertModel(settings.composerStatus.models?.catalog, settings.modelSelection)
    if (
      overrides?.scope !== 'search' &&
      (settings.composerStatus.models?.isLoading || settings.composerStatus.models?.isError)
    )
      throw new Error('模型列表尚未就绪，请重试')
    const capturedSnapshot = overrides?.snapshotName
      ? registry.get(overrides.snapshotName)
      : cell.snapshot
    if (cell.files.some((file) => file.status !== 'ready'))
      throw new Error('附件尚未准备完成，请移除后重选')
    if (
      cell.files.length &&
      (settings.docxAgent || capturedSnapshot || overrides?.scope === 'search')
    )
      throw new Error('聊天附件不能与文档编辑、专用截图或只检索混用，请移除附件后重试')
    if (cell.files.some((file) => file.kind === 'image') && model?.vision !== 'supported')
      throw new Error('当前模型的视觉能力未确认，请切换支持图片的模型')
    if (settings.docxAgent && model && model.tools !== 'supported')
      throw new Error('当前模型的工具能力未确认，请切换支持文档工具的模型')
    const config: Record<string, unknown> = {
      documentId: overrides?.documentId !== undefined ? overrides.documentId : settings.documentId,
      ...(overrides?.scope ? { scope: overrides.scope } : {}),
    }
    if (capturedSnapshot) {
      assertSnapshotTarget(capturedSnapshot, settings.draftAgent ?? settings.docxAgent)
      if (
        !settings.docxAgent ||
        !settings.snapshotVisionReady ||
        overrides?.scope === 'search' ||
        model?.vision !== 'supported'
      )
        throw new Error('截图美化需要可用的聊天模型并启用视觉输入，请前往模型设置')
    }
    if (settings.docxAgent) {
      const roundId = crypto.randomUUID()
      const frozen = settings.docxAgent.freezeSelection(roundId)
      const version = settings.docxAgent.getVersion()
      Object.assign(config, {
        agentRoundId: roundId,
        agentDocumentId: settings.docxAgent.documentId,
        agentFormat: settings.docxAgent.format ?? 'docx',
        agentVersion: version,
        agentSelection: capturedSnapshot
          ? {
              ...(frozen as Record<string, unknown>),
              elementId: null,
              elementIds: [],
              elements: [],
              pptxSnapshotId: capturedSnapshot.id,
            }
          : frozen,
      })
    }
    return {
      id: crypto.randomUUID(),
      ...(settings.docxAgent ? { agent: settings.docxAgent } : {}),
      text:
        text.trim() ||
        (cell.files.some((file) => file.kind === 'document')
          ? '请概括附件内容'
          : '请描述并分析这些图片'),
      documentId: config.documentId as string | null,
      ...(overrides?.scope ? { scope: overrides.scope } : {}),
      ...(model && settings.modelSelection
        ? { modelSelection: structuredClone(settings.modelSelection) }
        : {}),
      attachments: structuredClone(cell.files),
      ...(capturedSnapshot ? { snapshot: capturedSnapshot } : {}),
      config: structuredClone(config),
    }
  }
  async function dispatch(intent: SendIntent, prefix?: UIMessage[]) {
    const settings = latest.current
    // Revalidate the frozen identity; never silently send using the current menu instead.
    cell.current = intent
    try {
      const model =
        intent.scope !== 'search'
          ? assertModel(settings.composerStatus.models?.catalog, intent.modelSelection)
          : undefined
      if (
        intent.agent &&
        (intent.agent !== settings.docxAgent ||
          intent.config.agentDocumentId !== settings.docxAgent?.documentId)
      )
        throw new Error('文档来源已关闭或替换，请重新发送指令')
      if (intent.agent && model?.tools !== 'supported')
        throw new Error('当前模型的工具能力未确认，请重新选择模型')
      if (
        (intent.snapshot || intent.attachments.some((file) => file.kind === 'image')) &&
        model?.vision !== 'supported'
      )
        throw new Error('当前模型的视觉能力未确认，请重新选择模型')
      if (intent.snapshot)
        assertSnapshotTarget(intent.snapshot, settings.draftAgent ?? settings.docxAgent)
      cell.busy = true
      cell.transportError = false
      cell.failed = false
      cell.stopped = false
      cell.current = intent
      cell.assistantId = `pending-${intent.id}`
      cell.pending = {}
      cell.interrupts = []
      setInterrupts([])
      setError(null)
      setSidecars((current) => ({
        ...current,
        [intent.id]: {
          attachments: intent.attachments,
          modelSelection: intent.modelSelection,
          retrievalScope: intent.documentId
            ? { type: 'document', documentId: intent.documentId }
            : { type: 'all' },
          ...(intent.snapshot ? { snapshot: intent.snapshot } : {}),
        },
      }))
      cell.sent.set(intent.id, intent)
      const body = structuredClone({
        runConfig: intent.config,
        ...(intent.config.branchMode ? { branchMode: intent.config.branchMode } : {}),
        ...(!settings.docxAgent
          ? {
              historyMessageIds: (prefix ?? chatRef.current.messages)
                .flatMap((message) => {
                  const id = cell.canonicalIds.get(message.id)
                  return id ? [id] : []
                })
                .slice(-100),
            }
          : {}),
        ...(intent.modelSelection ? { modelSelection: intent.modelSelection } : {}),
        ...(intent.attachments.length
          ? { attachments: intent.attachments.map(({ id, sha256 }) => ({ id, sha256 })) }
          : {}),
      })
      const content: ContentPart[] = [
        { type: 'text', content: intent.text },
        ...(intent.snapshot
          ? [
              {
                type: 'image' as const,
                source: {
                  type: 'data' as const,
                  value: intent.snapshot.image.dataUrl.split(',')[1]!,
                  mimeType: 'image/png',
                },
              },
            ]
          : []),
      ]
      await chatRef.current.sendMessage(
        { id: intent.id, content: intent.snapshot ? content : intent.text },
        { body, whenBusy: 'drop' },
      )
      // Associate user media with SDK identity after the optimistic append.
      io.onTurnSettled(activeId ?? (await transport.ensureConversation()))
      cell.busy = false
      if (cell.failed || cell.stopped) {
        restoreQueued()
        if (intent.snapshot || intent.attachments.length) restore(intent, true)
      } else if (!cell.interrupts.length && cell.queue.length) {
        const [next, ...rest] = cell.queue
        updateQueue(rest)
        if (next) void dispatch(next)
      }
    } catch (failure) {
      cell.busy = false
      cell.failed = true
      cell.transportError = true
      const detail = errorText(failure)
      setError(detail)
      cell.sent.set(intent.id, intent)
      const messages = chatRef.current.messages
      if (!messages.some((message) => message.id === intent.id)) {
        const failedId = `blocked-${intent.id}`
        chatRef.current.setMessages([
          ...messages,
          { id: intent.id, role: 'user', parts: [{ type: 'text', content: intent.text }] },
          { id: failedId, role: 'assistant', parts: [] },
        ])
        setSidecars((current) => ({
          ...current,
          [intent.id]: {
            attachments: intent.attachments,
            modelSelection: intent.modelSelection,
            retrievalScope: intent.documentId
              ? { type: 'document', documentId: intent.documentId }
              : { type: 'all' },
            ...(intent.snapshot ? { snapshot: intent.snapshot } : {}),
          },
          [failedId]: { error: detail },
        }))
      }
      restoreQueued()
      restore(intent, true)
      io.onTurnSettled(activeId)
    }
  }
  function send(text = cell.draft, overrides?: AskOptions) {
    if (loading || loadError || uploading || (!text.trim() && !cell.files.length && !cell.snapshot))
      return
    try {
      const intent = capture(text, overrides)
      const userFiles = intent.attachments
      if (cell.draft === text) setDraft('')
      const ids = new Set(userFiles.map((file) => file.id))
      updateFiles(cell.files.filter((file) => !ids.has(file.id)))
      if (cell.snapshot === intent.snapshot) {
        cell.snapshot = undefined
        setSnapshot(undefined)
      }
      setSentHere(true)
      if (cell.busy || chatRef.current.isLoading || cell.interrupts.length)
        updateQueue([...cell.queue, intent])
      else void dispatch(intent)
    } catch (failure) {
      setError(errorText(failure))
    }
  }
  function stop() {
    cell.stopped = true
    cell.tools?.()
    cell.uploads.forEach((controller) => controller.abort())
    chatRef.current.stop()
    patchSidecar({ stopped: true, reasoningRunning: false })
    restoreQueued()
    if (cell.current && (cell.current.snapshot || cell.current.attachments.length))
      restore(cell.current, true)
    io.onTurnSettled(activeId)
  }
  async function submit(responses: ToolResponse[], target?: ResumeTarget) {
    const original = target ?? cell.target
    if (!original) throw new Error('工具结果续轮目标已失效')
    cell.busy = true
    cell.failed = false
    let success: boolean
    try {
      success = await chatRef.current.resumeInterruptsUnsafe(responses, original)
    } catch (failure) {
      cell.busy = false
      restoreQueued()
      throw failure
    }
    cell.busy = false
    if (!success || cell.failed) throw new Error('工具结果续轮失败，请重试续传')
    cell.interrupts = []
    setInterrupts([])
    io.onTurnSettled(activeId)
    if (cell.queue.length) {
      const [next, ...rest] = cell.queue
      updateQueue(rest)
      if (next) void dispatch(next)
    }
  }
  function addFiles(selected: File[]) {
    if (!io.uploadChatAttachment) {
      setError('聊天附件服务尚未接通')
      return
    }
    if (cell.snapshot || latest.current.docxAgent) {
      setError('聊天附件不能与文档编辑或专用截图混用')
      return
    }
    if (selected.length + cell.files.length > 4) {
      setError('每条消息最多添加 4 个附件')
      return
    }
    setError(null)
    for (const file of selected) {
      const temporaryId = `upload-${crypto.randomUUID()}`
      const controller = new AbortController()
      cell.uploads.add(controller)
      cell.pendingFiles.set(temporaryId, controller)
      updateFiles([
        ...cell.files,
        {
          id: temporaryId,
          conversationId: '',
          name: file.name,
          mime: file.type,
          size: file.size,
          sha256: '',
          kind: file.type.startsWith('image/') ? 'image' : 'document',
          status: 'processing',
          originalUrl: '',
          createdAt: new Date().toISOString(),
          bound: false,
        },
      ])
      setUploading(true)
      setPreparing(true)
      void (async () => {
        try {
          const id = await transport.ensureConversation()
          if (!controller.signal.aborted) {
            const attachment = await io.uploadChatAttachment!(
              id,
              file,
              temporaryId,
              controller.signal,
            )
            if (!controller.signal.aborted && cell.live)
              updateFiles(
                cell.files.map((entry) => (entry.id === temporaryId ? attachment : entry)),
              )
            else if (!attachment.bound)
              void io.deleteChatAttachment?.(id, attachment.id).catch(() => {})
          }
        } catch (failure) {
          if (!controller.signal.aborted && cell.live) {
            const detail = errorText(failure)
            updateFiles(
              cell.files.map((entry) =>
                entry.id === temporaryId ? { ...entry, status: 'failed', error: detail } : entry,
              ),
            )
            setError(detail)
          }
        }
        cell.uploads.delete(controller)
        cell.pendingFiles.delete(temporaryId)
        if (cell.live) {
          if (controller.signal.aborted)
            updateFiles(cell.files.filter((entry) => entry.id !== temporaryId))
          setUploading(cell.uploads.size > 0)
          setPreparing(cell.uploads.size > 0)
        }
      })()
    }
  }

  function removeFile(id: string) {
    const file = cell.files.find((entry) => entry.id === id)
    if (!file) return
    updateFiles(cell.files.filter((entry) => entry.id !== id))
    const pending = cell.pendingFiles.get(id)
    if (pending) {
      pending.abort()
      cell.pendingFiles.delete(id)
      cell.uploads.delete(pending)
      setUploading(cell.uploads.size > 0)
      setPreparing(cell.uploads.size > 0)
      return
    }
    if (!file.conversationId) return
    void (async () => {
      try {
        cell.leases.delete(id)
        await io.releaseChatAttachmentLease?.(file.conversationId, id, cell.leaseId)
        if (!file.bound && !cell.boundFiles.has(id))
          await io.deleteChatAttachment?.(file.conversationId, id)
      } catch (failure) {
        setError(errorText(failure))
      }
    })()
  }
  useEffect(() => {
    let live = true
    void createHistoryAdapter(io, options.conversationId)
      .load()
      .then((history) => {
        if (!live) return
        chatRef.current.setMessages(history.messages)
        for (const message of history.messages) cell.canonicalIds.set(message.id, message.id)
        setSidecars(history.sidecars)
        setLoading(false)
      })
      .catch((failure: unknown) => {
        if (live) {
          setLoadError(errorText(failure))
          setLoading(false)
        }
      })
    return () => {
      live = false
    }
  }, [io, options.conversationId, historyVersion, cell.canonicalIds])
  // One stable lease identity avoids a release/renew race when draft and FIFO change together.
  const renewLeases = useEffectEvent(
    (staged: ChatAttachment[], queued: SendIntent[], _running: boolean) => {
      const protectedFiles = [
        ...staged,
        ...queued.flatMap((item) => item.attachments),
        ...(cell.busy || cell.interrupts.length ? (cell.current?.attachments ?? []) : []),
      ].filter(isLeaseableAttachment)
      for (const file of protectedFiles) {
        if (!cell.leases.has(file.id)) {
          cell.leases.set(file.id, file)
          void io
            .leaseChatAttachment?.(file.conversationId, file.id, cell.leaseId)
            .catch((failure: unknown) => setError(errorText(failure)))
        }
      }
      const ids = new Set(protectedFiles.map((file) => file.id))
      for (const [id, file] of cell.leases)
        if (!ids.has(id)) {
          cell.leases.delete(id)
          void io
            .releaseChatAttachmentLease?.(file.conversationId, id, cell.leaseId)
            .catch(() => {})
        }
    },
  )
  useEffect(() => {
    renewLeases(files, queue, chat.isLoading)
  }, [files, queue, chat.isLoading])
  useEffect(() => {
    const timer = window.setInterval(() => {
      for (const file of cell.leases.values())
        if (isLeaseableAttachment(file))
          void io.leaseChatAttachment?.(file.conversationId, file.id, cell.leaseId).catch(() => {})
    }, 60_000)
    return () => {
      window.clearInterval(timer)
      for (const file of cell.leases.values())
        void io
          .releaseChatAttachmentLease?.(file.conversationId, file.id, cell.leaseId)
          .catch(() => {})
    }
  }, [io, cell])
  useEffect(() => {
    // React StrictMode replays setup/cleanup while preserving this cell.
    cell.live = true
    return () => {
      cell.live = false
      cell.uploads.forEach((controller) => controller.abort())
      cell.tools?.()
      chatRef.current.stop()
    }
  }, [cell])
  const displayedSidecars = { ...sidecars }
  const lastMessage = chat.messages.at(-1)
  if (lastMessage?.role === 'assistant' && cell.assistantId.startsWith('pending-'))
    displayedSidecars[lastMessage.id] = { ...displayedSidecars[lastMessage.id], ...cell.pending }
  const view: RuntimeView = {
    messages:
      chat.messages.at(-1)?.role === 'user' &&
      (cell.busy || cell.failed || cell.stopped) &&
      cell.current
        ? [...chat.messages, { id: `pending-${cell.current.id}`, role: 'assistant', parts: [] }]
        : chat.messages,
    sidecars: displayedSidecars,
    running: chat.isLoading || preparing,
    canEditBranch:
      !options.docxAgent &&
      !Object.values(sidecars).some((sidecar) => sidecar.agent || sidecar.snapshot),
    branch: {
      index: branchIndex,
      count: branchCount,
      select: (index) => {
        if (cell.busy || chatRef.current.isLoading || !cell.branches[index]) return
        cell.branches[cell.branchIndex] = { messages: chatRef.current.messages, sidecars }
        cell.branchIndex = index
        setBranchIndex(index)
        chatRef.current.setMessages(cell.branches[index]!.messages)
        setSidecars(cell.branches[index]!.sidecars)
      },
    },
    loading,
    loadError,
    reloadHistory: () => {
      setLoading(true)
      setLoadError(null)
      setHistoryVersion((value) => value + 1)
    },
    draft,
    setDraft,
    queue,
    files,
    uploading,
    addFiles,
    removeFile,
    snapshot,
    applySnapshotDraft,
    error,
    clearError: () => setError(null),
    send,
    stop,
    interrupts,
    resumeTarget,
    submit,
    getRound: () =>
      round.id !== null && round.version !== null ? { id: round.id, version: round.version } : null,
    advanceVersion: (version) => {
      round.version = version
    },
    registerToolCancel: (cancel) => {
      cell.tools = cancel
    },
  }
  function intentFor(id: string): SendIntent | undefined {
    const live = cell.sent.get(id)
    if (live) return live
    const message = chatRef.current.messages.find(
      (entry) => entry.id === id && entry.role === 'user',
    )
    if (!message) return undefined
    const sidecar = sidecars[id] ?? {}
    const index = chatRef.current.messages.findIndex((entry) => entry.id === id)
    const answer = chatRef.current.messages[index + 1]
    if (sidecar.agent || (answer && sidecars[answer.id]?.agent) || sidecar.snapshot) {
      setError('这条文档指令需要重新打开原文档，并从当前画布重新发送')
      return undefined
    }
    const documentId =
      sidecar.retrievalScope?.type === 'document' ? sidecar.retrievalScope.documentId : null
    return {
      id,
      text: message.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.content)
        .join(''),
      documentId,
      modelSelection: sidecar.modelSelection ?? latest.current.modelSelection,
      attachments: sidecar.attachments ?? [],
      config: {
        documentId,
        ...(sidecar.retrievalScope ? { retrievalScope: sidecar.retrievalScope } : {}),
      },
    }
  }
  function branchFrom(id: string, text?: string) {
    if (cell.busy || chatRef.current.isLoading || cell.interrupts.length) return
    if (latest.current.docxAgent) {
      setError('文档编辑请使用受保护的重试或工具续传')
      return
    }
    const intent = intentFor(id)
    const messages = chatRef.current.messages
    const index = messages.findIndex((message) => message.id === id)
    if (!intent || index < 0 || (text !== undefined && !text.trim())) return
    cell.branches[cell.branchIndex] = { messages: [...messages], sidecars: { ...sidecars } }
    const prefix = messages.slice(0, index)
    const nextIndex = cell.branches.length
    cell.branches.push({ messages: prefix, sidecars: { ...sidecars } })
    cell.branchIndex = nextIndex
    setBranchIndex(nextIndex)
    setBranchCount(cell.branches.length)
    chatRef.current.setMessages(prefix)
    void dispatch(
      {
        ...intent,
        id: crypto.randomUUID(),
        text: text?.trim() ?? intent.text,
        config: { ...intent.config, branchMode: text === undefined ? 'regenerate' : 'edit' },
      },
      prefix,
    )
  }
  // Last immutable intent also restores all queued/retry settings, even after menus change.
  const api: MimirChatApi = {
    activeId,
    sentHere,
    onOpenCitation: options.onOpenCitation,
    onOpenNote: options.onOpenNote,
    onOpenDocument: io.onOpenDocument,
    docxDocumentId: options.docxAgent?.documentId,
    cancelDocxAgentRun: io.cancelDocxAgentRun
      ? async (runId) => {
          if (!activeId) throw new Error('没有会话')
          await io.cancelDocxAgentRun!(activeId, runId)
          io.onTurnSettled(activeId)
        }
      : undefined,
    canSaveMessage: (id) => cell.canonicalIds.has(id),
    saveAsNote: (id) => {
      if (!activeId) throw new Error('还没有会话，无法存成笔记')
      const canonicalId = id ? cell.canonicalIds.get(id) : undefined
      if (!canonicalId) throw new Error('回答尚未保存完成，请稍后重试')
      return io.saveAsNote(activeId, canonicalId)
    },
    ask: send,
    editTurn: (id, text) => branchFrom(id, text),
    regenerateTurn: (id) => branchFrom(id),
    stop,
    refill: (text, name) => {
      if (applySnapshotDraft(name ? registry.get(name) : undefined)) setDraft(text)
    },
    retryTurn: (id, searchOnly = false) => {
      const intent = intentFor(id)
      if (!intent) return true
      if (searchOnly && (intent.snapshot || intent.attachments.length)) {
        restore(intent)
        setError(
          intent.snapshot
            ? '截图美化需要可用的聊天模型，不能降级为只检索'
            : '聊天附件不能降级为只检索',
        )
        return true
      }
      if (
        cell.draft === intent.text &&
        cell.snapshot?.id === intent.snapshot?.id &&
        cell.files.every((file) => intent.attachments.some((entry) => entry.id === file.id))
      ) {
        setDraft('')
        updateFiles([])
        cell.snapshot = undefined
        setSnapshot(undefined)
      }
      const next = {
        ...intent,
        id: crypto.randomUUID(),
        ...(searchOnly
          ? {
              scope: 'search' as const,
              modelSelection: undefined,
              config: { ...intent.config, scope: 'search' },
            }
          : {}),
      }
      if (cell.busy || chatRef.current.isLoading || cell.interrupts.length)
        updateQueue([...cell.queue, next])
      else void dispatch(next)
      return true
    },
    refillTurn: (id) => {
      const intent = intentFor(id)
      return intent ? restore(intent) : true
    },
    reclaimQueued: restoreQueued,
    clearSnapshotAttachmentError: () => setError(null),
  }
  return { runtime: view, api }
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Local upload placeholders have no server resource and must never enter lease traffic. */
function isLeaseableAttachment(file: ChatAttachment): boolean {
  return (
    file.status === 'ready' &&
    Boolean(file.conversationId.trim()) &&
    Boolean(file.id) &&
    !file.id.startsWith('upload-') &&
    /^[a-f\d]{64}$/i.test(file.sha256)
  )
}
