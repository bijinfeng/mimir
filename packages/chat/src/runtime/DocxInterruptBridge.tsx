import { useAgUiInterrupts, useAgUiSubmitInterruptResponses } from '@assistant-ui/react-ag-ui'
import { useAuiState } from '@assistant-ui/react'
import {
  agentAttachmentName,
  pptxMediaAnalysisSchema,
  pptxImageGenerationSchema,
  agentImageAspectRatioSchema,
  documentAgentToolResultSchema,
} from '@mimir/shared'
import type { DocumentAgentToolResult } from '@mimir/shared'
import { Button, Upload } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { ChatDocxAgent } from '../types.js'
import type { ChatIo } from './io.js'

type ClientInterrupt = {
  id: string
  metadata?: Record<string, unknown>
  reason: string
}

type ToolResponse = { interruptId: string; status: 'resolved'; payload: unknown }

type PendingSubmission = {
  key: string
  documentId: string
  format: string
  roundId: string
  version: number
  responses: ToolResponse[]
  createdDocumentId: string | null
}

function clientToolOf(interrupt: ClientInterrupt): { name: string; input: unknown } | null {
  if (interrupt.reason !== 'tanstack:client_tool_execution') return null
  const metadata = interrupt.metadata
  if (metadata?.kind !== 'client_tool' || typeof metadata.toolName !== 'string') return null
  return { name: metadata.toolName, input: metadata.input }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function objectInput(input: unknown, name: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error(`${name} 参数无效`)
  return input as Record<string, unknown>
}

async function executeWithRevision(
  agent: ChatDocxAgent,
  tool: string,
  input: unknown,
  options: { expectedVersion: number; roundId: string; signal: AbortSignal },
  revisionMode: boolean,
): Promise<unknown> {
  agent.setRevisionMode?.(revisionMode)
  try {
    return await agent.execute(tool, input, options)
  } finally {
    agent.setRevisionMode?.(false)
  }
}

/** Capture the canvas version before any external request that can outlive a human edit. */
export async function executeDocxTool(
  agent: ChatDocxAgent,
  tool: { name: string; input: unknown },
  roundId: string,
  expectedVersion: number,
  signal: AbortSignal,
  generateDocxImage?: ChatIo['generateDocxImage'],
  revisionMode = false,
  fetchDocxImage?: ChatIo['fetchDocxImage'],
): Promise<unknown> {
  if (agent.getVersion() !== expectedVersion)
    throw new Error('文档已在指令发送后变化，请重新读取当前画布')
  if ((agent.format ?? 'docx') !== 'docx') {
    return agent.execute(tool.name, tool.input, { expectedVersion, roundId, signal })
  }
  if (
    tool.name === 'insert_image' ||
    tool.name === 'insert_picture' ||
    tool.name === 'set_watermark'
  ) {
    const args = objectInput(tool.input, tool.name)
    const url = tool.name === 'set_watermark' ? args.image : args.url
    if (url !== undefined && url !== null) {
      if (typeof url !== 'string' || !url.trim()) throw new Error('图片地址无效')
      if (!fetchDocxImage) throw new Error('图片下载服务未接入')
      const image = await fetchDocxImage(agent.documentId, url, signal)
      if (signal.aborted) throw new Error('图片下载已停止')
      const safeArgs = { ...args }
      delete safeArgs.dataUrl
      delete safeArgs.url
      return executeWithRevision(
        agent,
        tool.name,
        { ...safeArgs, ...image },
        { expectedVersion, roundId, signal },
        revisionMode,
      )
    }
    if (tool.name !== 'set_watermark') throw new Error('图片地址不能为空')
    if (args.dataUrl !== undefined) throw new Error('水印图片必须使用受控下载地址')
  }
  if (tool.name === 'generate_image') {
    const input = objectInput(tool.input, 'generate_image')
    const prompt = input.prompt
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('图片描述不能为空')
    if (!generateDocxImage) throw new Error('图像生成服务未接入')
    const aspectRatio =
      input.aspectRatio === undefined
        ? undefined
        : agentImageAspectRatioSchema.parse(input.aspectRatio)
    const image =
      aspectRatio === undefined
        ? await generateDocxImage(agent.documentId, prompt, signal)
        : await generateDocxImage(agent.documentId, prompt, signal, aspectRatio)
    if (signal.aborted) throw new Error('工具调用已停止')
    const afterBlockIndex = input.afterBlockIndex
    const maxWidthPx = input.maxWidthPx
    return executeWithRevision(
      agent,
      'generate_image',
      {
        ...image,
        ...(afterBlockIndex === undefined ? {} : { afterBlockIndex }),
        ...(maxWidthPx === undefined ? {} : { maxWidthPx }),
      },
      { expectedVersion, roundId, signal },
      revisionMode,
    )
  }
  return executeWithRevision(
    agent,
    tool.name,
    tool.input,
    { expectedVersion, roundId, signal },
    revisionMode,
  )
}
export async function executeWritingTool(
  agent: ChatDocxAgent,
  input: unknown,
  roundId: string,
  expectedVersion: number,
  signal: AbortSignal,
  writeDocxDocument: ChatIo['writeDocxDocument'],
  revisionMode: boolean,
): Promise<unknown> {
  if (agent.getVersion() !== expectedVersion)
    throw new Error('文档已在指令发送后变化，请重新读取当前画布')
  const args = objectInput(input, 'write_document')
  const instruction = args.instruction
  if (typeof instruction !== 'string' || !instruction.trim()) throw new Error('写作要求不能为空')
  if (!writeDocxDocument || !agent.beginDraft || !agent.appendDraft || !agent.commitDraft)
    throw new Error('流式写作尚未接入当前编辑器')
  const context = agent.getContext()
  const text =
    typeof context === 'object' && context !== null && 'text' in context ? String(context.text) : ''
  agent.beginDraft(roundId)
  await writeDocxDocument(
    { documentId: agent.documentId, instruction, context: text.slice(0, 20_000) },
    signal,
    (delta) => agent.appendDraft?.(roundId, delta),
  )
  if (signal.aborted) throw new Error('写作已停止')
  agent.setRevisionMode?.(revisionMode)
  try {
    return await agent.commitDraft(roundId, { expectedVersion })
  } finally {
    agent.setRevisionMode?.(false)
  }
}

type BridgeToolOptions = {
  agent: ChatDocxAgent
  tool: { name: string; input: unknown }
  roundId: string
  expectedVersion: number
  signal: AbortSignal
  batchChanged: boolean
  revisionMode: boolean
  generateDocxImage?: ChatIo['generateDocxImage']
  fetchDocxImage?: ChatIo['fetchDocxImage']
  writeDocxDocument?: ChatIo['writeDocxDocument']
  analyzeDocxMedia?: ChatIo['analyzeDocxMedia']
  createDocxDocument?: ChatIo['createDocxDocument']
  requestMediaSource: (
    kind: 'image' | 'audio' | 'video',
  ) => Promise<File | { dataUrl: string; mimeType: string }>
  setProgress: (progress: string) => void
  onCreatedDocument: (documentId: string) => void
}

/** Keep tool validation and thrown errors outside the React component's control flow. */
export async function executeBridgeTool({
  agent,
  tool,
  roundId,
  expectedVersion,
  signal,
  batchChanged,
  revisionMode,
  generateDocxImage,
  fetchDocxImage,
  writeDocxDocument,
  analyzeDocxMedia,
  createDocxDocument,
  requestMediaSource,
  setProgress,
  onCreatedDocument,
}: BridgeToolOptions): Promise<DocumentAgentToolResult> {
  if (batchChanged) throw new Error('同一批工具已有修改，后续操作需等模型重新读取文档后再执行')

  let result: unknown
  if (
    agent.format === 'pptx' &&
    tool.name === 'analyze_media' &&
    objectInput(tool.input, tool.name).kind !== undefined &&
    objectInput(tool.input, tool.name).kind !== 'image'
  ) {
    const input = pptxMediaAnalysisSchema.parse(tool.input)
    if (input.kind === 'image') throw new Error('媒体类型无效')
    if (input.mediaUrls?.length) throw new Error('原音视频分析请省略mediaUrls并选择本地原文件')
    if (!analyzeDocxMedia) throw new Error('媒体分析服务未接入')
    if (agent.getVersion() !== expectedVersion || signal.aborted)
      throw new Error('画布版本已变化或操作已停止')
    setProgress(input.kind === 'video' ? '请选择原视频文件' : '请选择原音频文件')
    const source = await requestMediaSource(input.kind)
    if (!(source instanceof File)) throw new Error('请选择原音视频文件')
    if (agent.getVersion() !== expectedVersion || signal.aborted)
      throw new Error('选择媒体期间画布已变化或操作已停止')
    setProgress(input.kind === 'video' ? '正在提取并分析视频画面' : '正在转录并分析音频')
    const analyzed = await analyzeDocxMedia(
      {
        documentId: agent.documentId,
        instruction: input.requirements,
        kind: input.kind,
        source,
        includeAudio: input.includeAudio,
      },
      signal,
    )
    if (agent.getVersion() !== expectedVersion || signal.aborted)
      throw new Error('媒体分析期间画布已变化或操作已停止')
    result = {
      ok: true,
      changed: false,
      version: expectedVersion,
      summary: '媒体分析完成',
      data: {
        ...analyzed,
        sourceName: source.name,
        scope:
          input.kind === 'audio'
            ? 'audio_transcript'
            : input.includeAudio
              ? 'visual_frames_and_audio'
              : 'visual_frames_only',
      },
    }
  } else if (
    agent.format === 'pptx' &&
    ['insert_web_image', 'replace_image', 'generate_image', 'analyze_media'].includes(tool.name)
  ) {
    const input = objectInput(tool.input, tool.name)
    const urls =
      tool.name === 'generate_image'
        ? (pptxImageGenerationSchema.parse(input).referenceImageUrls ?? [])
        : tool.name === 'analyze_media'
          ? (pptxMediaAnalysisSchema.parse(input).mediaUrls ?? [])
          : typeof input.url === 'string'
            ? [input.url]
            : []
    const names = [...new Set(urls.map(agentAttachmentName).filter((name) => name !== null))]
    const attachments: { name: string; mimeType: string; bytes: Uint8Array }[] = []
    for (const name of names) {
      if (signal.aborted || agent.getVersion() !== expectedVersion)
        throw new Error('画布版本已变化或操作已停止')
      setProgress(`请选择原附件「${name}」`)
      const file = await requestMediaSource('image')
      if (!(file instanceof File) || file.name !== name)
        throw new Error(`请选择名称为「${name}」的原文件`)
      if (
        file.size === 0 ||
        file.size > 8 * 1024 * 1024 ||
        !['image/png', 'image/jpeg'].includes(file.type)
      )
        throw new Error('原附件须为8 MiB以内的PNG或JPEG')
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (signal.aborted || agent.getVersion() !== expectedVersion)
        throw new Error('读取附件期间画布已变化或操作已停止')
      attachments.push({ name: file.name, mimeType: file.type, bytes })
    }
    if (signal.aborted || agent.getVersion() !== expectedVersion)
      throw new Error('选择附件期间画布已变化或操作已停止')
    setProgress('正在处理媒体')
    result = await agent.execute(tool.name, tool.input, {
      expectedVersion,
      roundId,
      signal,
      attachments,
    })
  } else if ((agent.format ?? 'docx') === 'docx' && tool.name === 'write_document') {
    result = await executeWritingTool(
      agent,
      tool.input,
      roundId,
      expectedVersion,
      signal,
      writeDocxDocument,
      revisionMode,
    )
  } else if ((agent.format ?? 'docx') === 'docx' && tool.name === 'analyze_media') {
    if (agent.getVersion() !== expectedVersion)
      throw new Error('文档已在指令发送后变化，请重新读取当前画布')
    const args = objectInput(tool.input, 'analyze_media')
    const kind = args.kind
    const instruction = args.instruction
    if (kind !== 'image' && kind !== 'audio' && kind !== 'video') throw new Error('媒体类型无效')
    if (typeof instruction !== 'string' || !instruction.trim()) throw new Error('分析要求不能为空')
    if (!analyzeDocxMedia) throw new Error('媒体分析服务未接入')
    setProgress('请选择要分析的媒体文件')
    const source = await requestMediaSource(kind)
    if (agent.getVersion() !== expectedVersion)
      throw new Error('选择媒体期间文档已变化，请重新发送指令')
    setProgress('正在分析媒体')
    const analyzed = await analyzeDocxMedia(
      { documentId: agent.documentId, instruction, kind, source },
      signal,
    )
    if (signal.aborted || agent.getVersion() !== expectedVersion)
      throw new Error('媒体分析期间文档已变化或操作已停止')
    result = {
      ok: true,
      summary: '媒体分析完成',
      changed: false,
      version: expectedVersion,
      data: { text: analyzed.text },
    }
  } else if (tool.name === 'create_document') {
    if (agent.getVersion() !== expectedVersion)
      throw new Error('文档已在指令发送后变化，请重新读取当前画布')
    const args = objectInput(tool.input, 'create_document')
    const sourceFormat = agent.format ?? 'docx'
    const format =
      args.type ??
      args.format ??
      (sourceFormat === 'pdf' ? 'pdf' : sourceFormat === 'xlsx' ? 'xlsx' : 'docx')
    if (args.type !== undefined && args.format !== undefined && args.type !== args.format)
      throw new Error('type 与 format 不一致')
    if (!createDocxDocument) throw new Error('新文件创建服务未接入')
    let created
    if (format === 'xlsx' || format === 'csv') {
      if (sourceFormat !== 'xlsx' || !agent.exportSheet) throw new Error('当前文档不能导出工作表')
      if (args.content !== undefined && (typeof args.content !== 'string' || args.content.trim()))
        throw new Error('xlsx/csv 导出使用当前工作表，不接受 content')
      if (args.sheetId !== undefined && typeof args.sheetId !== 'string')
        throw new Error('sheetId 必须是工作表 ID')
      const exported = await agent.exportSheet(format, args.sheetId as string | undefined)
      if (signal.aborted || agent.getVersion() !== expectedVersion)
        throw new Error('导出期间文档已变化或操作已停止')
      const title =
        typeof args.title === 'string' && args.title.trim()
          ? args.title.trim()
          : exported.fileName.replace(/\.(xlsx|csv)$/i, '')
      const copy = new Uint8Array(exported.bytes)
      created = await createDocxDocument(
        {
          documentId: agent.documentId,
          title,
          format,
          file: new File([copy], exported.fileName, { type: exported.mimeType }),
        },
        signal,
      )
    } else {
      if (format !== 'docx' && format !== 'pdf' && format !== 'md' && format !== 'html')
        throw new Error('新文件格式无效')
      if (
        typeof args.title !== 'string' ||
        !args.title.trim() ||
        typeof args.content !== 'string' ||
        !args.content.trim()
      )
        throw new Error('新文件标题或内容无效')
      created = await createDocxDocument(
        { documentId: agent.documentId, title: args.title, format, content: args.content },
        signal,
      )
    }
    if (signal.aborted) throw new Error(`创建操作已停止；新文件 ${created.title} 已保存到知识库`)
    onCreatedDocument(created.documentId)
    result = {
      ok: true,
      summary: created.parseError
        ? `文件已保存，但解析或索引失败：${created.parseError}`
        : `已创建并保存 ${created.title}`,
      changed: false,
      version: expectedVersion,
      data: {
        documentId: created.documentId,
        format: created.format,
        parseError: created.parseError,
      },
    }
  } else {
    result = await executeDocxTool(
      agent,
      tool,
      roundId,
      expectedVersion,
      signal,
      generateDocxImage,
      revisionMode,
      fetchDocxImage,
    )
  }
  const parsedResult = documentAgentToolResultSchema.safeParse(result)
  if (!parsedResult.success) throw new Error('编辑器返回了无效的工具结果')
  return parsedResult.data
}

async function commitInterruptedDraft(
  agent: ChatDocxAgent,
  roundId: string,
  version: number,
  revisionMode: boolean,
): Promise<unknown> {
  try {
    if (!agent.commitDraft) throw new Error('当前编辑器无法提交草稿')
    agent.setRevisionMode?.(revisionMode)
    return await agent.commitDraft(roundId, { expectedVersion: version })
  } finally {
    agent.setRevisionMode?.(false)
  }
}

async function undoValidatedRound(agent: ChatDocxAgent, roundId: string): Promise<void> {
  const undone = await agent.undoRound(roundId)
  if (undone === false) throw new Error('画布已有后续修改，无法安全回退')
}

/**
 * TanStack's client tool completes with RUN_FINISHED/outcome=interrupt. assistant-ui's
 * ordinary addToolResult path resumes a different AG-UI state, so these requests
 * are executed here and answered through the explicit interrupt API exactly once.
 */
export function DocxInterruptBridge({
  agent,
  getRound,
  advanceVersion,
  registerToolCancel,
  generateDocxImage,
  fetchDocxImage,
  writeDocxDocument,
  analyzeDocxMedia,
  createDocxDocument,
  onOpenDocument,
  revisionMode,
}: {
  agent: ChatDocxAgent
  getRound: () => { id: string; version: number } | null
  advanceVersion: (version: number) => void
  registerToolCancel: (cancel: (() => void) | null) => void
  generateDocxImage?: ChatIo['generateDocxImage']
  fetchDocxImage?: ChatIo['fetchDocxImage']
  writeDocxDocument?: ChatIo['writeDocxDocument']
  analyzeDocxMedia?: ChatIo['analyzeDocxMedia']
  createDocxDocument?: ChatIo['createDocxDocument']
  onOpenDocument?: ChatIo['onOpenDocument']
  revisionMode: boolean
}) {
  const interrupts = useAgUiInterrupts()
  const running = useAuiState((state) => state.thread.isRunning)
  const submit = useAgUiSubmitInterruptResponses()
  const submitRef = useRef(submit)
  const interruptsRef = useRef(interrupts)
  const registerRef = useRef(registerToolCancel)
  const cancelRef = useRef<(() => void) | null>(null)
  const activeRef = useRef<{ key: string; controller: AbortController } | null>(null)
  const activeRoundRef = useRef<{ id: string; version: number } | null>(null)
  const completedRef = useRef(new Set<string>())
  const retryingRef = useRef(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [undoRound, setUndoRound] = useState<string | null>(null)
  const [partialDraft, setPartialDraft] = useState<{ roundId: string; version: number } | null>(
    null,
  )
  const [mediaRequest, setMediaRequest] = useState<'image' | 'audio' | 'video' | null>(null)
  const [createdDocId, setCreatedDocId] = useState<string | null>(null)
  const autoOpenedRef = useRef<string | null>(null)
  const mediaPickerRef = useRef<{
    resolve: (source: File | { dataUrl: string; mimeType: string }) => void
    reject: (error: Error) => void
  } | null>(null)

  useEffect(() => {
    submitRef.current = submit
    interruptsRef.current = interrupts
    registerRef.current = registerToolCancel
  })

  useEffect(() => {
    if (!createdDocId || running || interrupts.length > 0 || autoOpenedRef.current === createdDocId)
      return
    autoOpenedRef.current = createdDocId
    onOpenDocument?.(createdDocId)
  }, [createdDocId, running, interrupts, onOpenDocument])

  useEffect(() => {
    const key = `${agent.documentId}:${interrupts.map((item) => item.id).join(',')}`
    // RUN_FINISHED can publish interrupts before the SSE body has drained.
    // assistant-ui rejects submitInterruptResponses while that run is still
    // active, so wait for the runtime to finish it before executing tools.
    if (running || interrupts.length === 0 || completedRef.current.has(key)) return
    if (activeRef.current?.key === key && !activeRef.current.controller.signal.aborted) return

    const controller = new AbortController()
    activeRef.current = { key, controller }
    const round = getRound()

    const requestMediaSource = (
      kind: 'image' | 'audio' | 'video',
    ): Promise<File | { dataUrl: string; mimeType: string }> =>
      new Promise((resolve, reject) => {
        const abort = () => {
          mediaPickerRef.current = null
          setMediaRequest(null)
          reject(new Error('媒体分析已停止'))
        }
        controller.signal.addEventListener('abort', abort, { once: true })
        mediaPickerRef.current = {
          resolve: (source) => {
            controller.signal.removeEventListener('abort', abort)
            mediaPickerRef.current = null
            setMediaRequest(null)
            resolve(source)
          },
          reject: (error) => {
            controller.signal.removeEventListener('abort', abort)
            mediaPickerRef.current = null
            setMediaRequest(null)
            reject(error)
          },
        }
        setMediaRequest(kind)
      })

    async function run() {
      if (round === null) {
        setFailure('编辑轮次已失效，请重新发送指令')
        activeRef.current = null
        return
      }
      activeRoundRef.current = round
      const responses: ToolResponse[] = []
      let changed = false
      let batchChanged = false
      let expectedVersion = round.version
      let createdDocumentId: string | null = null
      for (const interrupt of interrupts) {
        if (controller.signal.aborted) return
        const tool = clientToolOf(interrupt)
        if (!tool) {
          setFailure(`需要处理的中断类型不受支持：${interrupt.reason}`)
          setProgress(null)
          activeRef.current = null
          return
        }
        setProgress(`正在执行 ${tool.name}`)
        let payload: unknown
        try {
          const validatedResult = await executeBridgeTool({
            agent,
            tool,
            roundId: round.id,
            expectedVersion,
            signal: controller.signal,
            batchChanged,
            revisionMode,
            generateDocxImage,
            fetchDocxImage,
            writeDocxDocument,
            analyzeDocxMedia,
            createDocxDocument,
            requestMediaSource,
            setProgress,
            onCreatedDocument: (documentId) => {
              createdDocumentId = documentId
            },
          })
          if (controller.signal.aborted) return
          payload = validatedResult
          if (validatedResult.ok === false) {
            const reason = validatedResult.error ?? '工具未完成'
            setFailure(`${tool.name} 执行失败：${reason}`)
          }
          if (validatedResult.changed === true) {
            changed = true
            batchChanged = true
            if (typeof validatedResult.version === 'number') {
              expectedVersion = validatedResult.version
              advanceVersion(expectedVersion)
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return
          payload = { ok: false, error: errorText(error) }
          setFailure(`${tool.name} 执行失败：${errorText(error)}`)
          if (agent.getDraft?.(round.id))
            setPartialDraft({ roundId: round.id, version: expectedVersion })
        }
        responses.push({ interruptId: interrupt.id, status: 'resolved', payload })
      }
      if (controller.signal.aborted) return
      completedRef.current.add(key)
      if (changed) setUndoRound(round.id)
      setProgress('正在继续生成回答')
      const submission: PendingSubmission = {
        key,
        documentId: agent.documentId,
        format: agent.format ?? 'docx',
        roundId: round.id,
        version: expectedVersion,
        responses,
        createdDocumentId,
      }
      try {
        await submitRef.current(responses)
        if (!controller.signal.aborted) setProgress(null)
        if (activeRef.current?.key === key) activeRef.current = null
        activeRoundRef.current = null
        if (createdDocumentId) setCreatedDocId(createdDocumentId)
      } catch (error) {
        if (controller.signal.aborted) return
        setPendingSubmission(submission)
        setFailure(`工具结果续轮失败：${errorText(error)}`)
        setProgress(null)
        if (activeRef.current?.key === key) activeRef.current = null
        activeRoundRef.current = null
      }
    }

    void run()
  }, [
    agent,
    getRound,
    advanceVersion,
    interrupts,
    generateDocxImage,
    fetchDocxImage,
    writeDocxDocument,
    analyzeDocxMedia,
    createDocxDocument,
    revisionMode,
    running,
  ])

  useEffect(() => {
    const documentId = agent.documentId
    return () => {
      if (activeRef.current?.key.startsWith(`${documentId}:`)) {
        activeRef.current.controller.abort()
      }
    }
  }, [agent])

  useEffect(() => {
    const cancel = () => {
      const active = activeRef.current
      if (!active || active.controller.signal.aborted) return
      active.controller.abort()
      mediaPickerRef.current?.reject(new Error('媒体分析已停止'))
      const activeRound = activeRoundRef.current
      if (activeRound && agent.getDraft?.(activeRound.id))
        setPartialDraft({ roundId: activeRound.id, version: activeRound.version })
      completedRef.current.add(active.key)
      activeRef.current = null
      activeRoundRef.current = null
      setProgress(null)
      setFailure('已停止工具执行；已经落到画布的修改仍是未保存状态')
      void submitRef
        .current(
          interruptsRef.current.map((item) => ({
            interruptId: item.id,
            status: 'cancelled' as const,
          })),
        )
        .catch((error: unknown) => setFailure(`停止工具失败：${errorText(error)}`))
    }
    cancelRef.current = cancel
    registerRef.current(cancel)
    return () => {
      registerRef.current(null)
      cancelRef.current = null
      activeRef.current?.controller.abort()
    }
  }, [agent])

  async function retrySubmission(): Promise<void> {
    const pending = pendingSubmission
    if (!pending || retryingRef.current || running) return
    const round = getRound()
    const currentKey = `${agent.documentId}:${interrupts.map((item) => item.id).join(',')}`
    if (
      agent.documentId !== pending.documentId ||
      (agent.format ?? 'docx') !== pending.format ||
      currentKey !== pending.key ||
      round?.id !== pending.roundId ||
      round.version !== pending.version ||
      agent.getVersion() !== pending.version
    ) {
      setPendingSubmission(null)
      setFailure('文档或画布已变化，无法续传旧工具结果，请重新发送指令')
      return
    }
    retryingRef.current = true
    setRetrying(true)
    setFailure(null)
    try {
      // Reuse the computed payload. The server atomically rejects replay if
      // the first request arrived despite the client seeing an error.
      await submitRef.current(pending.responses)
      setPendingSubmission(null)
      if (pending.createdDocumentId) setCreatedDocId(pending.createdDocumentId)
    } catch (error) {
      setFailure(`工具结果续轮失败：${errorText(error)}`)
    }
    retryingRef.current = false
    setRetrying(false)
  }

  if (
    !progress &&
    !failure &&
    !pendingSubmission &&
    !undoRound &&
    !partialDraft &&
    !mediaRequest &&
    !createdDocId
  )
    return null
  return (
    <div role="status" aria-live="polite">
      {progress && <span>{progress}</span>}
      {failure && <span>{failure}</span>}
      {pendingSubmission && (
        <Button size="small" loading={retrying} disabled={running} onClick={retrySubmission}>
          重试续传工具结果
        </Button>
      )}
      {createdDocId && (
        <Button size="small" onClick={() => onOpenDocument?.(createdDocId)}>
          打开新文档
        </Button>
      )}
      {mediaRequest && (
        <div>
          <Upload
            accept={
              mediaRequest === 'image'
                ? 'image/png,image/jpeg,image/webp'
                : mediaRequest === 'audio'
                  ? 'audio/wav,audio/mpeg,audio/mp4,audio/ogg'
                  : 'video/*'
            }
            showUploadList={false}
            beforeUpload={(file) => {
              mediaPickerRef.current?.resolve(file)
              return Upload.LIST_IGNORE
            }}
          >
            <Button size="small">选择本地文件</Button>
          </Upload>
          {mediaRequest === 'image' && agent.readImage ? (
            <Button
              size="small"
              onClick={() => {
                try {
                  const image = agent.readImage?.()
                  if (image) mediaPickerRef.current?.resolve(image)
                } catch (error) {
                  setFailure(`读取文档图片失败：${errorText(error)}`)
                }
              }}
            >
              使用文档中选中的图片
            </Button>
          ) : null}
        </div>
      )}
      {progress && (
        <Button size="small" onClick={() => cancelRef.current?.()}>
          停止工具
        </Button>
      )}
      {partialDraft && (
        <div>
          <span>写作已中断，草稿仍显示在画布中。请选择保留或丢弃。</span>
          <Button
            size="small"
            onClick={async () => {
              try {
                const result = await commitInterruptedDraft(
                  agent,
                  partialDraft.roundId,
                  partialDraft.version,
                  revisionMode,
                )
                if (
                  typeof result === 'object' &&
                  result !== null &&
                  'version' in result &&
                  typeof result.version === 'number'
                )
                  advanceVersion(result.version)
                setUndoRound(partialDraft.roundId)
                setPartialDraft(null)
                setFailure(null)
              } catch (error) {
                setFailure(`保留草稿失败：${errorText(error)}`)
              }
            }}
          >
            保留草稿
          </Button>
          <Button
            size="small"
            onClick={() => {
              agent.discardDraft?.(partialDraft.roundId)
              setPartialDraft(null)
              setFailure(null)
            }}
          >
            丢弃草稿
          </Button>
        </div>
      )}
      {undoRound && (
        <Button
          size="small"
          onClick={async () => {
            try {
              await undoValidatedRound(agent, undoRound)
              setUndoRound(null)
              setFailure(null)
            } catch (error) {
              setFailure(`无法回退本轮：${errorText(error)}`)
            }
          }}
        >
          回退本轮修改
        </Button>
      )}
    </div>
  )
}
