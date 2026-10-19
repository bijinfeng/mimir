import { useEffect, useRef, useState } from 'react'
import type { ThreadMessageLike } from './local-types'
import type { AttachmentMode } from './attachment-adapter'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, Tooltip, theme } from 'antd'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Folder,
  Info,
  Library,
  LoaderCircle,
  Menu,
  MessageCircle,
  PanelLeftClose,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  Square,
  TriangleAlert,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import manifest from './scenes.json'
import pdfGlyph from './assets/phosphor/file-pdf-duotone.svg?raw'
import audioGlyph from './assets/phosphor/file-audio-duotone.svg?raw'
import docGlyph from './assets/phosphor/file-doc-duotone.svg?raw'
import { canRestoreQueuedDraft, captureSendIntent } from './composer-send-intent'
import type { ComposerSendIntent } from './composer-send-intent'
import {
  demoModels,
  initialModel,
  selectModel,
  modelKey,
  validateModelSelection,
} from './model-settings'
import type { ModelSelection } from './model-settings'
import { updateToolbar } from './composer-toolbar'
import { ThreadFrame } from './thread-frame'
import { createThreadMessages } from './thread-fixtures'
import { BrandLockup } from '../../../../../packages/renderer/src/components/BrandMark'
import './review.css'

type Scene = (typeof manifest.scenes)[number]
type Recipe = Scene['ui']
type RunPhase =
  | 'empty'
  | 'loading'
  | 'idle'
  | 'creating'
  | 'searching'
  | 'streaming'
  | 'complete'
  | 'stopped'
  | 'error'
type MenuName = 'none' | 'scope' | 'model' | 'strength' | 'usage' | 'history'
type DialogName = 'none' | 'guard' | 'search' | 'model-boundary' | 'note' | 'source' | 'media'
const question = '怎样把零散收藏整理成能反复使用的知识？'
const articleTitle = '让知识保持可连接：从收集到理解'
const sampleDocs = [articleTitle, '个人知识库的三种组织方式', '实践记录：每周回顾与双向链接']
const longModel = 'Qwen3-235B-A22B-Instruct-2507'
const failureUI: Record<string, { title: string; detail: string; actions: [string, boolean][] }> = {
  quota: {
    title: '模型请求受限',
    detail: '服务商拒绝了本次请求。请检查额度或稍后重试；模型用量以服务商账单为准。',
    actions: [
      ['只检索，不调模型', true],
      ['换一个模型', false],
      ['去充值', false],
    ],
  },
  timeout: {
    title: '请求超时',
    detail: '模型响应超时。可以重试，或只查看检索结果。',
    actions: [
      ['重试', true],
      ['缩小到当前文档', false],
      ['只检索，不调模型', true],
    ],
  },
  truncated: {
    title: '回答被截断',
    detail: '回答达到输出上限。已显示的内容仍可查看。',
    actions: [
      ['接着生成', false],
      ['只要结论', false],
      ['只检索，不调模型', true],
    ],
  },
  offline: {
    title: '网络不可达',
    detail: '无法连接模型服务。仍可查看检索结果或稍后重试。',
    actions: [
      ['只检索，不调模型', true],
      ['重试', true],
    ],
  },
}
function Btn({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`btn ${className}`} {...props}>
      {children}
    </button>
  )
}
function Notice({
  children,
  kind = 'info',
}: {
  children: ReactNode
  kind?: 'info' | 'error' | 'success'
}) {
  return (
    <div className={`inline-notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'error' ? (
        <TriangleAlert size={14} style={{ flexShrink: 0, marginTop: 3 }} />
      ) : (
        <Info size={14} style={{ flexShrink: 0, marginTop: 3 }} />
      )}
      <div>{children}</div>
    </div>
  )
}
function Disclosure({
  title,
  children,
  openInitially = false,
  live = false,
  tool = false,
  failed = false,
  after = false,
}: {
  title: string
  children: ReactNode
  openInitially?: boolean
  live?: boolean
  tool?: boolean
  failed?: boolean
  after?: boolean
}) {
  const [open, setOpen] = useState(openInitially)
  const [wasLive, setWasLive] = useState(live)
  const [manual, setManual] = useState(false)
  if (wasLive !== live) {
    setWasLive(live)
    if (!live && (!after || !manual)) setOpen(false)
  }
  return (
    <div className={`disclosure ${tool ? 'tool-disclosure' : ''}`}>
      <Btn
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setManual(true)
        }}
      >
        {live ? (
          <LoaderCircle size={15} className="spin" />
        ) : failed ? (
          <TriangleAlert size={15} />
        ) : tool ? (
          <Check size={15} />
        ) : (
          <Brain size={15} />
        )}
        <span>{title}</span>
        <ChevronDown size={14} className={`chevron ${open ? 'open' : ''}`} />
      </Btn>
      {open && <div className="disclosure-content">{children}</div>}
    </div>
  )
}
function FileGlyph({ kind }: { kind: 'pdf' | 'audio' | 'doc' }) {
  const glyph = kind === 'pdf' ? pdfGlyph : kind === 'audio' ? audioGlyph : docGlyph
  return (
    <img
      className="file-format-icon"
      src={`data:image/svg+xml,${encodeURIComponent(glyph.replaceAll('currentColor', kind === 'pdf' ? '#bd504c' : kind === 'audio' ? '#9470ad' : '#5983b4'))}`}
      alt=""
    />
  )
}
function Snapshot({
  removable,
  onRemove,
  sent = false,
}: {
  removable?: boolean
  onRemove?: () => void
  sent?: boolean
}) {
  return (
    <div className="snapshot">
      <div className="slide-thumbnail" aria-label="示例幻灯片的示意图">
        <b>知识的连接</b>
        <span>从收集，到理解与创造</span>
      </div>
      <div className="snapshot-desc">
        第3页截图<small>{sent ? '准备时的页面' : '准备时的页面 · 发送后用于美化'}</small>
      </div>
      {removable && (
        <Btn className="icon" aria-label="移除第3页截图" onClick={onRemove}>
          <X size={14} />
        </Btn>
      )}
    </div>
  )
}
function ChatDemo({
  scene,
  after,
  zoom,
  narrow,
  reduced,
  dark,
}: {
  scene: Scene
  after: boolean
  zoom: boolean
  narrow: boolean
  reduced: boolean
  dark: boolean
}) {
  const ui: Recipe = scene.ui
  const sidebar = ui.sidebar
  const ref = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const composing = useRef(false)
  const [phase, setPhase] = useState<RunPhase>(ui.phase as RunPhase)
  const [delivered, setDelivered] = useState(
    (ui.failure && ui.failure !== 'truncated') ||
      ui.emptyAnswer ||
      ['empty', 'creating', 'loading', 'searching'].includes(ui.phase)
      ? 'none'
      : ui.failure === 'truncated' || ['streaming', 'stopped'].includes(ui.phase)
        ? 'partial'
        : 'full',
  )
  const [traceReady, setTraceReady] = useState(
    ui.phase !== 'searching' || (ui.special === 'trace' && ui.specialState === 'live'),
  )
  const [menu, setMenu] = useState<MenuName>(ui.menu as MenuName)
  const [dialog, setDialog] = useState<DialogName>(ui.dialog as DialogName)
  const [text, setText] = useState(ui.draft)
  const [sentFiles, setSentFiles] = useState<NonNullable<ThreadMessageLike['attachments']>>([])
  const [restoreFiles, setRestoreFiles] = useState<NonNullable<ThreadMessageLike['attachments']>>(
    [],
  )
  const attachmentScene = scene.groupId.startsWith('ATT-')
  const [attachmentMode, setAttachmentMode] = useState<AttachmentMode>(
    (attachmentScene
      ? {
          cancel: 'uploading',
          remove: 'ready',
          multiple: 'ready',
          sent: 'ready',
          policy: 'ready',
          'attachment-only': 'ready',
          'image-only': 'image',
          'no-vision': 'image',
          'search-only': 'ready',
          ttl: 'expired',
          history: 'ready',
          'agent-block': 'ready',
          'audio-demo': 'ready',
        }[scene.state] || scene.state
      : 'ready') as AttachmentMode,
  )
  const [attachmentCommand, setAttachmentCommand] = useState(
    attachmentScene && !['sent', 'policy', 'history', 'audio-demo'].includes(scene.state)
      ? `${scene.state === 'multiple' ? 'multiple' : 'add'}:${scene.id}`
      : '',
  )
  const [attachmentLifetime, setAttachmentLifetime] = useState(0)
  const [attachmentNotice, setAttachmentNotice] = useState('')
  const [queue, setQueue] = useState<
    Array<{
      text: string
      scope: string
      deep: boolean
      snapshot: boolean
      intent?: ComposerSendIntent
      files?: ThreadMessageLike['attachments']
    }>
  >(() => {
    const first = {
      text: ui.queued,
      scope: sidebar || ui.scope ? articleTitle : '',
      deep: ui.deep,
      snapshot: ui.snapshot,
      intent: after
        ? {
            scope: sidebar || ui.scope ? articleTitle : '',
            model: structuredClone(initialModel),
            kind: 'composer' as const,
            snapshot: ui.snapshot,
          }
        : undefined,
    }
    return ui.queued
      ? ui.special === 'queue' && ui.specialState === 'multiple'
        ? [first, { ...first, text: '然后请补充一个实际整理案例。' }]
        : [first]
      : []
  })
  const queued = queue[0]?.text || ''
  const queuedParams = {
    current: queue[0] || { text: '', scope: '', deep: false, snapshot: false },
  }
  function enqueue(
    prompt: string,
    parameters: {
      scope: string
      deep: boolean
      snapshot: boolean
      intent?: ComposerSendIntent
      files?: ThreadMessageLike['attachments']
    },
  ) {
    setQueue((previous) => [...previous, { text: prompt, ...parameters }])
  }

  const [scope, setScope] = useState(
    sidebar || ui.scope
      ? ui.longTitle
        ? articleTitle + '——关于阅读、写作与知识积累的长期实践记录'
        : sidebar
          ? '当前文档'
          : articleTitle
      : '',
  )
  const [deep, setDeep] = useState(ui.deep)
  const models = ui.noModel
    ? []
    : demoModels.map((model, i) =>
        ui.longModel && i === 0 ? { ...model, label: longModel } : model,
      )
  const [modelSelection, setModelSelection] = useState<ModelSelection>(() =>
    scene.id === 'CHAT-012.reasoning'
      ? selectModel(demoModels[1]!)
      : ui.deep
        ? { ...initialModel, reasoningEffort: 'high' }
        : initialModel,
  )
  const [modelsStatus, setModelsStatus] = useState<'loaded' | 'loading' | 'error' | 'empty'>(
    ui.noModel ? 'empty' : 'loaded',
  )
  const [lastRunIntent, setLastRunIntent] = useState<ComposerSendIntent | undefined>()
  const [lastSentIntent, setLastSentIntent] = useState<ComposerSendIntent | undefined>()
  const [snapshot, setSnapshot] = useState(
    ui.snapshot &&
      !(
        ui.special === 'snapshot-queue' &&
        ['stale-new', 'freeze', 'dispatch'].includes(ui.specialState)
      ),
  )
  const [snapshotIssue, setSnapshotIssue] = useState(ui.snapshotIssue)
  const [failure, setFailure] = useState(ui.failure)
  const [searchOnly, setSearchOnly] = useState(ui.searchOnly)
  const [toast, setToast] = useState(
    ui.saveError
      ? '存成笔记失败'
      : ui.copyStatus === 'error' && ui.special !== 'code'
        ? '复制失败'
        : '',
  )
  const [saving, setSaving] = useState(ui.saving)
  const [saveError, setSaveError] = useState(ui.saveError)
  const [saved, setSaved] = useState(ui.saved)
  const [copyStatus, setCopyStatus] = useState(ui.copyStatus)
  const [loadError, setLoadError] = useState(ui.loadError)
  const [docsRead, setDocsRead] = useState(ui.docsRead)
  const [historyRead, setHistoryRead] = useState(ui.historyRead)
  const [capability, setCapability] = useState(ui.capability)
  const [revision, setRevision] = useState(ui.revision)
  const [hidden, setHidden] = useState(ui.hidden)
  const [navOpen, setNavOpen] = useState(ui.navOpen)
  const [viewingSource, setViewingSource] = useState(
    ui.viewingSource || (ui.special === 'agent-create' && ui.specialState === 'autoopen'),
  )
  const [sourceTarget, setSourceTarget] = useState(
    ui.special === 'agent-create' && ui.specialState === 'autoopen' ? 'new' : 'current',
  )
  const pendingNavigation = useRef<(() => void) | null>(null)
  const [agentStage, setAgentStage] = useState(ui.agentStage)
  const [agentCancel, setAgentCancel] = useState(false)
  const [manualChanged, setManualChanged] = useState(ui.manualChanged)
  const [selectedHistory, setSelectedHistory] = useState(0)
  const [lastQuestion, setLastQuestion] = useState(ui.snapshot ? '请美化第3页。' : question)
  const [scrollAway, setScrollAway] = useState(ui.scrollAway)
  const [hostWidth, setHostWidth] = useState(narrow ? 768 : 1140)
  const overlay = sidebar && hostWidth <= 880
  const [unmounted, setUnmounted] = useState(
    ui.special === 'sidebar-lifetime' && ui.specialState === 'switch',
  )
  const [hasOlderDraft, setHasOlderDraft] = useState(false)
  const [specialState, setSpecialState] = useState(ui.specialState)
  const [operation, setOperation] = useState('idle')
  const [validationIssue, setValidationIssue] = useState(ui.snapshotIssue)
  const [sentSnapshot, setSentSnapshot] = useState(
    ui.snapshot &&
      !['empty', 'creating'].includes(ui.phase) &&
      !(ui.special === 'snapshot-queue' && ['freeze', 'dispatch'].includes(ui.specialState)),
  )
  const [imageState, setImageState] = useState(
    ui.currentDefect === 'image-broken' ? 'error' : 'loaded',
  )
  const [mediaChoice, setMediaChoice] = useState('waiting')
  const [outputMode, setOutputMode] = useState('success')
  const busy = ['creating', 'searching', 'streaming'].includes(phase)
  const showEmpty = phase === 'empty' || phase === 'creating'
  const missingSave = after && ui.special === 'save-host' && ui.specialState === 'none'
  const lastSuccessful = phase === 'complete' && !failure && !loadError && !missingSave
  const hasAnswer = delivered !== 'none'
  const isTool = scene.track.startsWith('agent')
  const showBridge =
    isTool && !['agent-history', 'agent-boundary', 'agent-end'].includes(scene.track)
  function announce(message: string) {
    setToast(message)
  }
  function openDialog(name: DialogName) {
    restoreFocus.current = document.activeElement as HTMLElement
    setMenu('none')
    setDialog(name)
  }
  function closeDialog() {
    setDialog('none')
    window.requestAnimationFrame(
      () => restoreFocus.current?.isConnected && restoreFocus.current.focus(),
    )
  }
  function openMenu(name: MenuName) {
    restoreFocus.current = document.activeElement as HTMLElement
    setMenu(menu === name ? 'none' : name)
  }
  function closeMenu() {
    setMenu('none')
    window.requestAnimationFrame(() => restoreFocus.current?.focus())
  }
  function modelIntentValid(intent?: ComposerSendIntent): boolean {
    return (
      !!intent &&
      (!intent.model || (modelsStatus === 'loaded' && validateModelSelection(models, intent.model)))
    )
  }
  function currentToolbar() {
    return {
      scope,
      sidebar,
      searchOnly,
      documents: sampleDocs,
      documentsStatus: 'loaded' as const,
      models,
      selectedModel: modelSelection,
      modelsStatus,
    }
  }
  function restoreQueued() {
    if (queued) {
      if (after && !canRestoreQueuedDraft(text)) {
        announce('当前输入已有草稿，队列保留；请先处理草稿后再取回。')
        return false
      }
      if (after && !modelIntentValid(queuedParams.current.intent)) {
        announce('队列中的模型或推理等级当前不可用，原问题与设置保留，请核对模型配置。')
        return false
      }
      if (ui.special === 'snapshot-queue' && ui.specialState === 'tampered') {
        setSnapshotIssue('排队截图与原草稿不符，请重新准备。')
        return
      }
      setText(queued)
      setRestoreFiles(
        (queuedParams.current.files || []).map((file) =>
          Object.assign({}, file, { id: `${file.id}-retrieved-${Date.now()}` }),
        ),
      )
      if (queuedParams.current.intent)
        setLastSentIntent(structuredClone(queuedParams.current.intent))
      setScope(queuedParams.current.scope)
      setDeep(sidebar ? false : queuedParams.current.deep)
      if (queuedParams.current.intent?.model)
        setModelSelection(structuredClone(queuedParams.current.intent.model))
      setSnapshot(queuedParams.current.snapshot)
      setQueue((previous) => previous.slice(1))
      input.current?.focus()
      return true
    }
    return false
  }
  function stop() {
    setPhase('stopped')
    const restored = queued ? restoreQueued() : false
    setAgentStage(isTool ? 'cancelled' : agentStage)
    announce(restored ? '已停止生成。排队的问题已取回。' : '已停止生成。当前草稿与剩余队列保留。')
  }
  const sendContext = {
    documentId: sidebar ? 'fixture-current-document' : null,
    documentTitle: sidebar ? articleTitle : null,
    canvasVersion: manualChanged ? 2 : 1,
    agentRoundId: `${scene.id}-fixture-round`,
    pageIndex: snapshot || sentSnapshot ? 2 : null,
    format: ui.docx ? 'docx' : ui.snapshot ? 'pptx' : 'markdown',
    agentActive: isTool || revision,
    revision,
    searchOnly,
    noVision: !!ui.noVision,
    noModel: !!ui.noModel,
    agentStage,
    manualChanged,
    snapshotIssue,
    validationIssue,
    fixtureOnly: true,
  }
  function send(
    value = text,
    files: ThreadMessageLike['attachments'] = [],
    intent?: ComposerSendIntent,
  ) {
    if (!value.trim() && !files?.length) return
    if (after && !intent) {
      try {
        intent = captureSendIntent(
          currentToolbar(),
          'composer',
          snapshot,
          sendContext,
          files || [],
        ).intent
      } catch (error) {
        announce(String(error))
        return
      }
    }
    if (after && !modelIntentValid(intent)) {
      announce('本次模型或推理等级不可用，原草稿保留。')
      return
    }
    const intendedSnapshot = intent?.snapshot ?? snapshot
    if (
      after &&
      intent?.context &&
      (intent.context.documentId !== sendContext.documentId ||
        intent.context.canvasVersion !== sendContext.canvasVersion ||
        intent.context.agentRoundId !== sendContext.agentRoundId ||
        intent.context.agentActive !== sendContext.agentActive ||
        intent.context.pageIndex !== sendContext.pageIndex ||
        intent.context.format !== sendContext.format ||
        intent.context.revision !== sendContext.revision ||
        intent.context.manualChanged !== sendContext.manualChanged)
    ) {
      setText((previous) => (previous.trim() ? previous : value))
      setAttachmentNotice('发送时文档目标、版本或Agent轮次已变化；原轮次取消派发，请重新核对。')
      setRestoreFiles(files)
      return
    }
    if (
      files?.some((file) => file.id.startsWith('mimir-snapshot-fixture')) &&
      files.some((file) => !file.id.startsWith('mimir-snapshot-fixture'))
    ) {
      setText(value)
      setRestoreFiles(
        files.map((file) =>
          Object.assign({}, file, { id: `${file.id}-mixed-rejected-${Date.now()}` }),
        ),
      )
      setAttachmentNotice('专用文档截图不能与通用附件混发。请移除通用附件，原稿保留。')
      return
    }
    if (
      files?.length &&
      (isTool || revision) &&
      files.some((file) => !file.id.startsWith('mimir-snapshot-fixture'))
    ) {
      setText(value)
      setRestoreFiles(
        files.map((file) =>
          Object.assign({}, file, { id: `${file.id}-agent-rejected-${Date.now()}` }),
        ),
      )
      setAttachmentNotice(
        '通用附件仅供普通问答，不授权文档Agent编辑。请切回普通问答或移除附件；原稿已恢复。',
      )
      return
    }
    if (
      files?.length &&
      (searchOnly || ui.noModel || (ui.noVision && files.some((file) => file.type === 'image')))
    ) {
      setText(value)
      setRestoreFiles(
        files.map((file) => Object.assign({}, file, { id: `${file.id}-rejected-${Date.now()}` })),
      )
      setAttachmentNotice(
        searchOnly
          ? '只检索不能发送临时附件，请切回模型问答。原稿已恢复。'
          : ui.noModel
            ? '请先配置聊天模型，原稿已恢复。'
            : '当前选中模型无视觉能力，图片和文字已恢复，请切换视觉模型。',
      )
      return
    }
    if (intendedSnapshot && (validationIssue || ui.noVision)) {
      setSnapshotIssue(
        validationIssue || '截图美化需要可用的聊天模型并启用视觉输入，请前往模型设置。',
      )
      announce('草稿已保留，请先处理截图不可发送的原因。')
      return
    }
    if (!value.trim() && files?.length) {
      value = files.every((file) => file.type === 'image')
        ? '请描述并分析这些图片'
        : '请概括附件内容'
      setAttachmentNotice(`拟定仅附件策略：宿主补充模型指令“${value}”，未将其冒充为用户键入文字。`)
    }
    if (intent) setLastSentIntent(intent)
    if (busy) {
      enqueue(value, {
        scope: intent ? intent.scope : scope,
        deep,
        snapshot: intendedSnapshot,
        intent: intent ? structuredClone(intent) : undefined,
        files: structuredClone(files),
      })
      setText('')
      if (snapshot) setSnapshot(false)
      return
    }
    if (after && intent) setLastRunIntent(structuredClone(intent))
    setDelivered('none')
    setTraceReady(false)
    setLastQuestion(value)
    setSentFiles(files || [])
    setRestoreFiles([])
    setSentSnapshot(intendedSnapshot)
    if (snapshot) setSnapshot(false)
    setText('')
    setFailure('')
    setCopyStatus('idle')
    setSaved(false)
    setPhase('searching')
    setLoadError(false)
    setViewingSource(false)
  }
  function finish(error = false) {
    if (error) {
      setPhase('error')
      setFailure(outputMode === 'success' ? 'stream' : outputMode)
      if (queued) restoreQueued()
      if (snapshot && !text) setText(lastQuestion)
      announce('模拟请求失败；问题、已生成内容和可用草稿均保留。')
    } else if (queued) {
      if (after && !modelIntentValid(queuedParams.current.intent)) {
        setPhase('error')
        announce('排队模型或推理等级已不可用，停止派发并保留队列。')
        return
      }
      const context = queue[0]?.intent?.context
      if (
        after &&
        context &&
        (context.canvasVersion !== sendContext.canvasVersion ||
          context.agentRoundId !== sendContext.agentRoundId ||
          context.documentId !== sendContext.documentId)
      ) {
        setPhase('error')
        setFailure('stream')
        restoreQueued()
        announce('队列目标或文档版本已变化，已停止派发并保留草稿。')
        return
      }
      if (queuedParams.current.snapshot && validationIssue) {
        setPhase('error')
        setFailure('stream')
        setLastQuestion(queued)
        setSentFiles(queuedParams.current.files || [])
        setSentSnapshot(true)
        setDelivered('none')
        setSnapshotIssue(validationIssue)
        if (!text.trim()) {
          setText(queued)
          setSnapshot(true)
        } else setSnapshot(false)
        setQueue((previous) => previous.slice(1))
        announce('排队截图已失效；原图文保留在失败轮，新输入保留。')
        return
      }
      if (queuedParams.current.intent)
        setLastSentIntent(structuredClone(queuedParams.current.intent))
      setScope(queuedParams.current.scope)
      setDeep(sidebar ? false : queuedParams.current.deep)
      if (queuedParams.current.intent?.model)
        setModelSelection(structuredClone(queuedParams.current.intent.model))
      if (queuedParams.current.intent)
        setLastRunIntent(structuredClone(queuedParams.current.intent))
      setSentSnapshot(queuedParams.current.snapshot)
      setLastQuestion(queued)
      setSentFiles(queuedParams.current.files || [])
      setDelivered('none')
      setTraceReady(false)
      setQueue((previous) => previous.slice(1))
      setPhase('searching')
      announce('上一轮已完成，按原模型、推理等级和范围派发排队问题。')
    } else {
      setPhase('complete')
      setDelivered('full')
      setTraceReady(true)
      setFailure('')
      setAgentStage(isTool ? 'completed' : agentStage)
      announce('模拟本轮完成；实际用量与计时由服务端返回。')
    }
  }
  function retry(search = false) {
    if ((snapshot || sentSnapshot) && validationIssue) {
      setSnapshotIssue(validationIssue)
      announce('截图目标已失效，原图文保留，请重新准备。')
      return
    }
    if ((snapshot || sentSnapshot) && search) {
      setSnapshot(true)
      setSnapshotIssue('截图美化需要可用的聊天模型并启用视觉输入，不能只检索。')
      announce('截图草稿不能降级为只检索；图文已保留。')
      return
    }
    let retryIntent: ComposerSendIntent | undefined
    if (after) {
      try {
        retryIntent =
          !search && lastRunIntent
            ? structuredClone(lastRunIntent)
            : captureSendIntent(
                { ...currentToolbar(), searchOnly: search, scope: search ? '' : scope },
                'append',
                sentSnapshot,
                sendContext,
                sentFiles || [],
              ).intent
        if (!modelIntentValid(retryIntent)) {
          announce('原问题使用的模型或等级不可用，保留原问题与草稿，请核对配置。')
          return
        }
      } catch (error) {
        announce(String(error))
        return
      }
    }
    if (after && ui.historyMode) announce('历史未保存模型参数，本次使用当前选择的模型与推理设置。')
    if (search) setScope('')
    if (busy) {
      enqueue(lastQuestion, {
        scope: after ? retryIntent?.scope || '' : search ? '' : scope,
        deep: after && ui.historyMode ? false : deep,
        snapshot: retryIntent?.snapshot ?? sentSnapshot,
        intent: retryIntent,
        files: sentFiles,
      })
      setText('')
      announce('生成中，重试的问题已排队。')
      return
    }
    if (retryIntent) {
      setLastSentIntent(structuredClone(retryIntent))
      setLastRunIntent(structuredClone(retryIntent))
    }
    setDelivered('none')
    setTraceReady(false)
    setSearchOnly(search)
    setPhase('searching')
    setFailure('')
    setText('')
    announce(
      search
        ? '模拟只检索，不调用模型。'
        : ui.historyMode
          ? after
            ? '历史未保存模型参数，本次按当前模型和推理等级重试。'
            : `历史提示为标准模式，但当前实际沿用输入区的${deep ? '深入' : '标准'}模式。`
          : '模拟重试同一问题。',
    )
  }
  function saveAnswer() {
    if (saving || missingSave) return
    setSaving(true)
    setSaveError(false)
    setCopyStatus('idle')
    announce('模拟重新读取已落库的最后一条助手回答，再保存为笔记。')
  }
  function completeSave(error: boolean) {
    setSaving(false)
    if (missingSave) {
      setSaveError(true)
      announce('没有可保存的已落库助手回答，不能保存上一轮。')
      return
    }
    if (error) {
      setSaveError(true)
      announce('存成笔记失败，回答仍在，可以重试。')
    } else {
      setSaved(true)
      announce('已存成笔记（模拟），重复保存对应同一消息。')
    }
  }
  function copyAnswer(code = false) {
    if (outputMode === 'copy-error' || (ui.special === 'code' && ui.specialState === 'failure')) {
      if (code && !after) return
      setCopyStatus('error')
      announce('复制失败，请选择文字后手动复制。')
    } else {
      setCopyStatus('copied')
      announce(
        code
          ? '代码已复制（模拟）'
          : searchOnly
            ? '已复制原文片段与来源链接（模拟）'
            : '已复制回答正文（模拟，不含工具诊断）',
      )
    }
  }
  function chooseHistory(index: number) {
    runGuarded(() => {
      setSentFiles([])
      setRestoreFiles([])
      setAttachmentLifetime((value) => value + 1)
      setSelectedHistory(index)
      setPhase('loading')
      setDelivered('none')
      setNavOpen(false)
      setText('')
      announce('模拟切换会话，重建当前运行时；不承诺原会话继续生成。')
    })
  }
  function runGuarded(action: () => void) {
    if (ui.guarded) {
      pendingNavigation.current = action
      openDialog('guard')
    } else action()
  }
  function performPendingNavigation() {
    const action = pendingNavigation.current
    pendingNavigation.current = null
    setDialog('none')
    if (action) action()
    else {
      setPhase('empty')
      setText('')
      setFailure('')
      setDelivered('none')
      announce('模拟离开原文档，进入新对话。')
    }
  }
  function showSettings() {
    runGuarded(() => openDialog('model-boundary'))
  }
  function openTarget(target = 'current') {
    setSourceTarget(target)
    setViewingSource(true)
  }
  function newConversation() {
    runGuarded(() => {
      setPhase('empty')
      setDelivered('none')
      setText('')
      setFailure('')
      setNavOpen(false)
      setViewingSource(false)
      setSentFiles([])
      setRestoreFiles([])
      setQueue([])
      setAttachmentLifetime((value) => value + 1)
    })
  }
  function changeAgent() {
    setManualChanged(true)
    setAgentStage('stale')
    announce('模拟用户修改了画布版本；旧工具结果不可再次提交。')
  }
  useEffect(() => {
    const element = ref.current?.querySelector<HTMLElement>('.demo-main')
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setHostWidth(width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const layer =
      dialog !== 'none' || menu !== 'none' || (overlay && !hidden)
        ? root.querySelector<HTMLElement>('[role="menu"]') ||
          root.querySelector<HTMLElement>('.dialog[role="dialog"]') ||
          root.querySelector<HTMLElement>('[role="dialog"]')
        : null
    if (layer) {
      const first = layer.querySelector<HTMLElement>('button:not(:disabled),input,textarea,a[href]')
      first?.focus()
    } else if (ui.autofocus) input.current?.focus()
  }, [dialog, menu, ui.autofocus, overlay, hidden])
  function handleRootKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    const root = ref.current
    if (!root) return
    const layer =
      root.querySelector<HTMLElement>('[role="menu"]') ||
      root.querySelector<HTMLElement>('.dialog[role="dialog"]') ||
      root.querySelector<HTMLElement>('[role="dialog"]')
    if (event.key === 'Escape') {
      if (dialog !== 'none') {
        event.preventDefault()
        closeDialog()
      } else if (menu !== 'none') {
        event.preventDefault()
        closeMenu()
      } else if (busy && event.target instanceof HTMLTextAreaElement) {
        event.preventDefault()
        stop()
      } else if (overlay && !hidden) {
        event.preventDefault()
        setHidden(true)
        window.requestAnimationFrame(() =>
          root.querySelector<HTMLButtonElement>('[data-ask-ai]')?.focus(),
        )
      }
    }
    if (!layer) return
    const all = Array.from(
      layer.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,a[href]'),
    )
    const current = all.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Tab') {
      if (event.shiftKey && current <= 0) {
        event.preventDefault()
        all.at(-1)?.focus()
      } else if (!event.shiftKey && current === all.length - 1) {
        event.preventDefault()
        all[0]?.focus()
      }
    }
    if (menu !== 'none' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? all.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length
      all[next]?.focus()
    }
  }
  const displayScope = scope || '全部文档'
  function renderScopeMenu() {
    if (docsRead === 'loading')
      return (
        <div className="muted" role="status">
          加载中…
        </div>
      )
    if (docsRead === 'error')
      return (
        <Btn role="menuitem" onClick={() => setDocsRead('loading')}>
          读取失败，点此重试
        </Btn>
      )
    if (docsRead === 'empty') return <div className="muted">知识库还没有文档</div>
    return sampleDocs.map((doc) => (
      <Btn
        key={doc}
        role="menuitem"
        onClick={() => {
          setScope(doc)
          closeMenu()
        }}
      >
        <FileText size={14} />
        <span>{doc}</span>
        {scope === doc && <Check size={13} />}
      </Btn>
    ))
  }
  const composer = (
    <div
      className={`composer-line ${scrollAway || (ui.special === 'scroll' && ui.specialState === 'divider') ? 'scrolled' : ''}`}
    >
      <div className="composer-wrap">
        <div className="composer-box">
          {ui.special === 'snapshot' && ui.specialState === 'other' && (
            <div className="attachment-fallback">研究资料.bin</div>
          )}
          {snapshot && !(ui.special === 'snapshot-queue' && ui.specialState === 'stale-new') && (
            <Snapshot
              removable
              onRemove={() => {
                setSnapshot(false)
                setSnapshotIssue('')
                setValidationIssue('')
                announce('已移除截图及本次目标绑定；文字保留。')
              }}
            />
          )}
          <textarea
            ref={input}
            aria-label={sidebar ? '向当前文档提问' : '向知识库提问'}
            value={text}
            rows={3}
            placeholder={
              busy
                ? '生成中 · Enter 排队这条，Esc 停止'
                : scope
                  ? `就「${scope}」提问…`
                  : '直接向知识库提问…'
            }
            onChange={(event) => {
              setText(event.target.value)
              setHasOlderDraft(true)
            }}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={() => {
              composing.current = false
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || composing.current) return
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
          />
          {snapshotIssue && (
            <Notice kind="error">
              {snapshotIssue}
              <Btn className="icon" aria-label="关闭截图提示" onClick={() => setSnapshotIssue('')}>
                <X size={13} />
              </Btn>
            </Notice>
          )}
          {snapshot && ui.noVision && !snapshotIssue && (
            <Notice>
              可先编辑草稿，发送截图需要聊天模型并启用视觉输入。
              <Btn onClick={showSettings}>设置模型</Btn>
            </Notice>
          )}
          {queued && (
            <div className="queue-row">
              <span>已排队</span>
              <span className="queued-text">{queued}</span>
              <Btn className="icon" aria-label="取回排队的消息" onClick={restoreQueued}>
                <X size={13} />
              </Btn>
            </div>
          )}
          <div className="composer-bar">
            <div className="composer-left">
              <Tooltip title={scope ? '更换本轮检索范围' : '选择本轮检索范围'}>
                <Btn onClick={() => openMenu('scope')} aria-label={`本轮检索范围：${displayScope}`}>
                  <Plus size={15} />
                  {scope ? '更换范围' : '范围：全部文档'}
                </Btn>
              </Tooltip>
              {scope && (
                <span className="scope-pill" title={`本轮检索范围：${scope}`}>
                  <span>范围：{scope}</span>
                  <Btn aria-label="清除本轮检索范围" onClick={() => setScope('')}>
                    <X size={12} />
                  </Btn>
                </span>
              )}
              {ui.usage && !sidebar && (
                <Btn aria-label="上下文容量" onClick={() => openMenu('usage')}>
                  <span className="usage-dot" />
                  <span className="usage-label">
                    {ui.specialState === 'unknown-input' ? '—' : '1.5万'} tok
                  </span>
                </Btn>
              )}
            </div>
            <div className="composer-right">
              {!sidebar && (
                <Btn
                  aria-label={`思考强度：${deep ? '深入' : '标准'}`}
                  onClick={() => openMenu('strength')}
                >
                  <Zap size={15} />
                  {deep ? '深入' : '标准'}
                  <ChevronDown size={12} />
                </Btn>
              )}
              <Btn aria-label="当前模型" onClick={() => openMenu('model')}>
                <span className="model-name">
                  {ui.noModel
                    ? '未配置模型'
                    : ui.longModel
                      ? longModel
                      : deep
                        ? 'DeepSeek R1'
                        : 'Qwen3'}
                </span>
                <ChevronDown size={12} />
              </Btn>
              <Btn
                className="send"
                aria-label={busy ? '停止' : '发送'}
                title={busy ? '停止生成 · Esc' : '发送 · Enter'}
                disabled={!busy && !text.trim()}
                onClick={() => (busy ? stop() : send())}
              >
                {busy ? <Square size={14} fill="currentColor" /> : <ArrowUp size={18} />}
              </Btn>
            </div>
          </div>
        </div>
        <div className="composer-hint">
          <span>{busy ? 'Enter 排队 · Esc 停止' : 'Enter 发送 · Shift+Enter 换行'}</span>
          <span>{sidebar ? '标准模式' : '回答请以来源为准'}</span>
        </div>
      </div>
    </div>
  )
  const citations = (
    <div className="citations" aria-label="回答引用">
      {(ui.noCitations ? [] : [articleTitle, '个人知识库的三种组织方式']).map((title, index) => (
        <button
          type="button"
          className="citation"
          key={title}
          onClick={() => {
            if (sidebar && index === 0) {
              setViewingSource(true)
              announce('模拟原地定位同篇片段。')
            } else runGuarded(() => openTarget('current'))
          }}
        >
          <span className="citation-title">
            <strong>{title}</strong>
            <small>
              {ui.unknownChannel
                ? 'custom-channel'
                : index
                  ? '子串兜底'
                  : scope
                    ? '限定本篇'
                    : '词级召回 + 向量'}
            </small>
          </span>
          <span className="citation-snippet">
            {index
              ? '链接帮助我们把一个独立的片段带回原来的语境，在回顾中建立联系。'
              : '知识库的价值，在于这些联系能够随着阅读与写作逐渐生长。'}
          </span>
        </button>
      ))}
    </div>
  )
  const failureCard =
    failure && !ui.snapshotOnlyError ? (
      <div className="failure-card" role="alert">
        <h3>{failure === 'stream' ? '连接中断' : failureUI[failure]?.title || '本轮未完成'}</h3>
        <p>
          {failure === 'stream'
            ? 'Failed to fetch · 无法连接服务器'
            : failureUI[failure]?.detail || '请求未完成，问题仍可取回。'}
        </p>
        <div className="actions">
          {failure === 'stream' ? (
            <>
              <Btn className="primary" onClick={() => retry()}>
                重试
              </Btn>
              <Btn
                className="outline"
                onClick={() => {
                  if (text.trim() && text !== lastQuestion) {
                    announce('输入区已有新草稿，请先处理当前文字，再显式取回原图文。')
                    return
                  }
                  setText(lastQuestion)
                  setRestoreFiles(
                    sentFiles.map((file) => ({
                      ...file,
                      id: `${file.id}-recovered-${Date.now()}`,
                    })),
                  )
                  if (sentSnapshot) setSnapshot(true)
                  input.current?.focus()
                  announce('问题与原附件已放回输入框，尚未发送。')
                }}
              >
                把问题放回输入框
              </Btn>
            </>
          ) : (
            (failureUI[failure]?.actions || []).map(([label, enabled]) => (
              <Tooltip key={label} title={enabled ? undefined : '暂不可用'}>
                <span>
                  <Btn
                    className={enabled ? 'outline' : ''}
                    disabled={!enabled}
                    onClick={() => retry(label.includes('只检索'))}
                  >
                    {label}
                  </Btn>
                </span>
              </Tooltip>
            ))
          )}
        </div>
        {ui.historyMode && <small>历史记录未保存思考模式；重试将使用标准模式。</small>}
        {failure === 'stream' && <small>本轮未生成回答。</small>}
      </div>
    ) : null
  const toolArgs =
    scene.track === 'tool'
      ? {
          query: question,
          documentId: scope || null,
          limit: 6,
          ...(ui.specialState === 'long'
            ? {
                filters: Array.from({ length: 24 }, (_, i) => ({
                  source: `来源${i + 1}：个人知识整理与每周回顾的原始文档`,
                  path: `/knowledge/collections/references/${'long-document-name-'.repeat(6)}${i + 1}`,
                })),
              }
            : {}),
        }
      : { documentId: 'current-document', version: 12, instruction: '整理当前内容的层级与表达' }
  const toolResult =
    agentStage === 'failed'
      ? { status: 'failed', error: '工具未完成，请查看能力或版本' }
      : agentStage === 'stale'
        ? { status: 'rejected', reason: 'canvas_version_changed' }
        : scene.track === 'tool'
          ? {
              status: agentStage,
              passages: Array.from({ length: ui.specialState === 'long' ? 32 : 1 }, (_, i) => ({
                document: `参考文档${i + 1}`,
                text: '片段内容与原始来源位置：'.repeat(ui.specialState === 'long' ? 6 : 1),
                offset: i * 256,
              })),
              count: ui.specialState === 'long' ? 32 : 1,
            }
          : { status: agentStage, changed: ui.agentChanged }
  const agentCard = (
    <section className="agent-card">
      <Disclosure
        title={`${after ? (agentStage === 'running' ? '正在执行工具' : agentStage === 'failed' || agentStage === 'stale' ? '工具未完成' : '已使用工具') : agentStage === 'running' ? 'Running tool' : agentStage === 'failed' ? 'Failed tool' : 'Used tool'}: ${ui.toolName}`}
        tool
        live={agentStage === 'running'}
        failed={['failed', 'stale'].includes(agentStage)}
        openInitially={ui.toolOpen}
      >
        <div className="diagnostic-label">Args</div>
        <pre>{JSON.stringify(toolArgs, null, 2)}</pre>
        <div className="diagnostic-label">Result</div>
        <pre>{JSON.stringify(toolResult, null, 2)}</pre>
      </Disclosure>

      {(!after || scene.track !== 'tool') && (
        <>
          {agentStage === 'awaiting' && (
            <Notice>
              编辑已中断。请打开原文档，确认画布内容后重新发送指令。
              <div className="actions">
                <Btn className="outline" onClick={() => setViewingSource(true)}>
                  打开文档
                </Btn>
                <Btn
                  onClick={() => {
                    setAgentCancel(true)
                    setAgentStage('cancelling')
                  }}
                  disabled={agentCancel}
                >
                  取消待处理工具
                </Btn>
              </div>
            </Notice>
          )}
          {agentStage === 'resubmit' && (
            <Notice kind="error">
              画布修改已完成，但工具结果提交失败。重试只提交缓存结果，不重新执行工具。
              <Btn
                className="outline"
                onClick={() =>
                  manualChanged ? setAgentStage('stale') : setAgentStage('submitting')
                }
              >
                重新提交工具结果
              </Btn>
            </Notice>
          )}
          {agentStage === 'submitting' && (
            <Notice>
              正在重新提交已完成的工具结果…<Btn disabled>提交中</Btn>
            </Notice>
          )}
          {agentStage === 'stale' && (
            <Notice kind="error">
              当前文档、来源或画布版本已改变，无法提交旧工具结果。请核对当前内容后重新发送指令。
            </Notice>
          )}
          {agentStage === 'failed' && (
            <Notice kind="error">工具执行失败。已生成的回答和诊断保留；未重新执行工具。</Notice>
          )}
          {agentStage === 'cancelled' && (
            <Notice>
              文档编辑工具 · 已取消。已修改的画布仍需人工检查，停止不会撤销已完成的编辑。
            </Notice>
          )}
          {agentStage === 'completed' && (
            <Notice kind="success">
              {ui.agentChanged
                ? '已修改当前画布。原件尚未自动保存，请使用编辑器现有保存入口。'
                : '文档编辑工具 · 已完成。'}
            </Notice>
          )}
        </>
      )}
    </section>
  )
  function beginDraftAction(action: string) {
    if (after && operation !== 'idle') return
    setOperation(action)
    if (!after) announce('模拟当前实现已发起操作；现行按钮没有专门的 loading 防重入。')
  }
  function settleDraft(error: boolean) {
    if (error) {
      setSpecialState(operation === 'undo' ? 'failed' : 'keep-error')
      announce(
        operation === 'undo'
          ? '无法回退本轮：执行失败，修改仍在。'
          : '保留草稿失败：草稿与选择仍保留。',
      )
    } else {
      setSpecialState(
        operation === 'undo' ? 'success' : operation === 'discard' ? 'discard' : 'keep',
      )
      announce(
        operation === 'undo'
          ? '已回退本轮修改（模拟），没有自动保存。'
          : operation === 'discard'
            ? '已丢弃本轮部分草稿（模拟）。'
            : '草稿已保留到画布（模拟），尚未自动保存。',
      )
    }
    setOperation('idle')
  }
  const partialDraft =
    ui.special === 'agent-draft' ||
    (ui.special === 'agent-service' &&
      ['pending', 'keep-error', 'stale', 'discard', 'keep'].includes(specialState)) ||
    (ui.special === 'agent-stop' && specialState === 'draft')
  const mediaRequest =
    ui.special === 'agent-media' ||
    (ui.special === 'agent-service' &&
      ['original-attachment', 'original-media', 'media'].includes(specialState))
  const writing =
    ui.special === 'agent-service' && ['stream-writing', 'write'].includes(specialState)
  const created =
    ui.special === 'agent-create' ||
    (ui.special === 'agent-service' && ['create', 'export-sheet'].includes(specialState))
  const undo = ui.special === 'agent-undo' || (partialDraft && specialState === 'keep')
  const bridgePanel = showBridge ? (
    <section
      className={`bridge-panel ${after ? 'polished' : ''}`}
      aria-label="Agent 执行进度"
      aria-live="polite"
    >
      {ui.special === 'agent-progress' && (
        <>
          <div className="bridge-heading">
            <Wrench size={14} />
            <strong>
              {specialState === 'resume'
                ? '正在继续生成回答'
                : specialState === 'invalid-round'
                  ? '编辑轮次已失效，请重新发送指令'
                  : specialState === 'unsupported'
                    ? '需要处理的中断类型不受支持：未知类型'
                    : specialState === 'failed'
                      ? 'update_document 执行失败：当前工具返回错误'
                      : specialState === 'dedupe'
                        ? '本次工具已完成，等待继续回答'
                        : `正在执行 ${ui.toolName}`}
            </strong>
          </div>
          {specialState === 'execute' && (
            <Btn className="outline" onClick={stop}>
              停止工具
            </Btn>
          )}
        </>
      )}
      {ui.special === 'agent-stop' && (
        <>
          <div role={specialState === 'cancel-error' ? 'alert' : 'status'}>
            {specialState === 'stopping'
              ? '正在停止工具执行…'
              : specialState === 'cancel-error'
                ? '停止工具失败：无法提交取消请求，请核对当前状态。'
                : specialState === 'unmount'
                  ? '已离开原文档，旧工具已中止，迟到结果不会写入新画布。'
                  : '已停止工具执行；已经落到画布的修改仍是未保存状态。'}
          </div>
          {specialState === 'cancel-error' && (
            <Btn
              className="outline"
              onClick={() => {
                setSpecialState('stopping')
                setAgentStage('cancelling')
              }}
            >
              停止工具
            </Btn>
          )}
        </>
      )}
      {ui.special === 'agent-resume' && (
        <>
          <div className="bridge-heading">
            <Wrench size={14} />
            <strong>
              {agentStage === 'completed'
                ? '工具结果已提交，继续生成回答'
                : agentStage === 'stale'
                  ? '文档或画布已变化，无法续传旧工具结果，请重新发送指令'
                  : agentStage === 'submitting'
                    ? '正在续传已完成的工具结果…'
                    : '工具结果续轮失败：网络连接中断'}
            </strong>
          </div>
          {['resubmit', 'submitting'].includes(agentStage) && (
            <>
              <p>画布修改已完成，重试只提交已缓存的工具结果。</p>
              <Btn
                className="outline"
                disabled={agentStage === 'submitting'}
                onClick={() =>
                  manualChanged ? setAgentStage('stale') : setAgentStage('submitting')
                }
              >
                {agentStage === 'submitting' ? <LoaderCircle size={13} /> : null}重试续传工具结果
              </Btn>
            </>
          )}
        </>
      )}
      {mediaRequest && (
        <>
          <div className="bridge-heading">
            <Wrench size={14} />
            <strong>
              {mediaChoice === 'processing' || specialState === 'processing'
                ? ui.mediaKind === 'video'
                  ? '正在提取并分析视频画面'
                  : ui.mediaKind === 'audio'
                    ? '正在转录并分析音频'
                    : '正在分析媒体'
                : specialState === 'original-attachment'
                  ? '请选择原附件「研究示意图.png」'
                  : ui.mediaKind === 'video'
                    ? '请选择原视频文件'
                    : ui.mediaKind === 'audio'
                      ? '请选择原音频文件'
                      : '请选择图片原件'}
            </strong>
          </div>
          {specialState === 'document-image' && (
            <div className="action-error" role="alert">
              读取文档图片失败：未找到当前选中的图片
            </div>
          )}
          {specialState === 'stale' && (
            <div className="action-error" role="alert">
              画布版本或原件来源已变化，拒绝迟到的媒体结果。
            </div>
          )}
          {mediaChoice === 'waiting' && specialState !== 'processing' && (
            <div className="bridge-actions">
              <Btn
                className="outline"
                onClick={() => {
                  setMediaChoice('picker')
                  announce('原生文件选择器属于系统边界。底部控制可模拟选择/取消，不读取你的文件。')
                }}
              >
                选择本地文件
              </Btn>
              {ui.mediaKind === 'image' && (
                <Btn
                  className="outline"
                  onClick={() => {
                    setMediaChoice('processing')
                    announce('模拟读取文档当前选中图片；提交前仍核对版本与来源。')
                  }}
                >
                  使用文档中选中的图片
                </Btn>
              )}
            </div>
          )}
          {specialState === 'picker-cancel' && after && (
            <p>未选择文件，仍在等待。可以重新选择，或停止工具。</p>
          )}
          {mediaChoice === 'picker' && (
            <p>等待系统选择结果。取消系统对话框后仍可重新选择或停止。</p>
          )}
          <Btn
            onClick={() => {
              setMediaChoice('cancelled')
              setAgentStage('cancelled')
              setPhase('stopped')
            }}
          >
            停止工具
          </Btn>
          {mediaChoice === 'cancelled' && <p>工具已停止，不提交媒体结果。</p>}
        </>
      )}
      {partialDraft && (
        <>
          {['pending', 'keep-error', 'stale', 'draft'].includes(specialState) ? (
            <>
              <strong>写作已中断</strong>
              <p>草稿仍显示在画布中。请选择保留或丢弃。</p>
              <div className="partial-preview">
                {`知识的连接，来自每一次主动回顾。\n把收藏整理成可以继续使用的线索，`}
                <span className="stream-caret">▍</span>
              </div>
              {specialState === 'keep-error' && (
                <div className="action-error" role="alert">
                  保留草稿失败：提交未完成，草稿仍在。
                </div>
              )}
              {specialState === 'stale' && (
                <div className="action-error" role="alert">
                  当前画布已有后续修改，无法保留旧版本草稿。
                </div>
              )}
              <div className="bridge-actions">
                <Btn
                  className="outline"
                  disabled={after && operation !== 'idle'}
                  onClick={() =>
                    specialState === 'stale'
                      ? announce('已拒绝保留过期草稿；不会覆盖人工编辑。')
                      : beginDraftAction('keep')
                  }
                >
                  {after && operation === 'keep' ? <LoaderCircle size={13} /> : null}保留草稿
                </Btn>
                <Btn
                  disabled={after && operation !== 'idle'}
                  onClick={() => beginDraftAction('discard')}
                >
                  丢弃草稿
                </Btn>
              </div>
              {after && operation !== 'idle' && (
                <p role="status">正在{operation === 'keep' ? '保留' : '丢弃'}草稿，请稍候…</p>
              )}
            </>
          ) : (
            <p>
              {specialState === 'keep'
                ? '草稿已保留到当前画布，尚未保存。'
                : '部分草稿已丢弃，原有内容由编辑器恢复。'}
            </p>
          )}
        </>
      )}
      {undo && (
        <>
          <p>
            {specialState === 'success'
              ? '本轮修改已回退，原有内容由画布恢复。'
              : specialState === 'unsafe'
                ? '无法回退本轮：画布已有后续修改，无法安全回退。'
                : specialState === 'failed'
                  ? '无法回退本轮：编辑器执行失败。'
                  : '本轮修改已经显示在画布中，尚未自动保存。'}
          </p>
          {specialState !== 'success' && (
            <Btn
              className="outline"
              disabled={after && operation !== 'idle'}
              onClick={() =>
                specialState === 'unsafe'
                  ? announce('无法安全回退；人工后续修改已保留。')
                  : beginDraftAction('undo')
              }
            >
              {after && operation === 'undo' ? <LoaderCircle size={13} /> : null}回退本轮修改
            </Btn>
          )}
        </>
      )}
      {created && (
        <>
          {specialState === 'invalid' ? (
            <div role="alert">创建或导出失败：输入、来源格式或版本无效。没有生成新文件。</div>
          ) : (
            <>
              <strong>
                {specialState === 'parse-error' ? '文件已保存，但解析或索引失败' : '新文件已创建'}
              </strong>
              <div className="created-file">
                {after ? <FileGlyph kind="doc" /> : <FileText size={18} />}
                <div>
                  知识整理行动清单.docx
                  <small>
                    {specialState === 'parse-error'
                      ? '解析失败，暂不保证可检索'
                      : specialState === 'stopped-after'
                        ? '操作已停止，文件仍保存在知识库'
                        : '已保存到知识库 · 独立的新文档'}
                  </small>
                </div>
                <Btn
                  className="outline"
                  onClick={() =>
                    runGuarded(() => {
                      openTarget('new')
                      announce('模拟打开同一新文档ID；实际导航遵守宿主守卫。')
                    })
                  }
                >
                  打开新文档
                </Btn>
              </div>
              {specialState === 'stopped-after' && (
                <p>创建操作已停止；新文件「知识整理行动清单」已保存到知识库。不自动导航。</p>
              )}
              {specialState === 'autoopen' && <p>回答结束且没有待处理中断后，交接该文档一次。</p>}
            </>
          )}
        </>
      )}
      {writing && (
        <>
          <strong>正在流式写作</strong>
          <div className="partial-preview">
            清晰的知识整理，始于一个正在使用的问题。
            <br />
            我们会先保留事实和来源，再写下自己的判断。<span className="stream-caret">▍</span>
          </div>
          <p>逐段预览，按本轮冻结版本完成后提交一次。</p>
          <Btn
            onClick={() => {
              setSpecialState('pending')
              setPhase('stopped')
              announce('写作已中断，部分草稿仍在画布。')
            }}
          >
            停止工具
          </Btn>
        </>
      )}
      {ui.special === 'agent-service' && !mediaRequest && !writing && !created && (
        <>
          <strong>{ui.toolName}</strong>
          <p>
            {specialState === 'invalid'
              ? '编辑器返回了无效的工具结果。'
              : specialState === 'image-generate' || specialState === 'image'
                ? '正在生成并读取图片，完成前不会插入画布。'
                : specialState === 'cancel'
                  ? '已停止工具执行；已修改的画布仍未保存。'
                  : '使用当前画布和发送时冻结的版本执行，不读取其他文档。'}
          </p>
          {agentStage === 'running' && (
            <Btn className="outline" onClick={stop}>
              停止工具
            </Btn>
          )}
        </>
      )}
    </section>
  ) : null
  const historyNotice =
    ui.special === 'agent-history' ? (
      <section className="agent-history">
        <strong>
          文档编辑工具 ·{' '}
          {agentStage === 'awaiting' || agentStage === 'cancelling'
            ? '待处理'
            : agentStage === 'completed'
              ? '已完成'
              : agentStage === 'failed'
                ? '失败'
                : '已取消'}
        </strong>
        <ul>
          <li>
            update_document ·{' '}
            {agentStage === 'completed'
              ? '已完成 · 已修改画布'
              : agentStage === 'failed'
                ? '失败'
                : agentStage === 'cancelled'
                  ? '已取消'
                  : '待处理'}
          </li>
        </ul>
        {['awaiting', 'cancelling'].includes(agentStage) && (
          <>
            <p>编辑已中断。请打开原文档，确认画布内容后重新发送指令。</p>
            {specialState === 'cancel-error' && (
              <div className="action-error" role="alert">
                取消失败，请稍后再试。
              </div>
            )}
            <div className="bridge-actions">
              <Btn
                className="outline"
                onClick={() => runGuarded(() => openTarget('history-original'))}
              >
                打开文档
              </Btn>
              <Btn
                className="outline"
                disabled={agentStage === 'cancelling'}
                onClick={() => setAgentStage('cancelling')}
              >
                {agentStage === 'cancelling' && <LoaderCircle size={13} />}取消待处理工具
              </Btn>
            </div>
          </>
        )}
      </section>
    ) : null
  return (
    <div
      className={`demo ${after ? 'after' : 'current'} ${sidebar ? 'sidebar' : ''} ${zoom ? 'zoom' : ''} ${reduced ? 'reduced' : ''} ${viewingSource && sourceTarget !== 'current' ? 'viewing-document' : ''} ${ui.special === 'short' ? 'short-height' : ''}`}
      ref={ref}
      onKeyDown={handleRootKey}
      data-scene={scene.id}
    >
      {sidebar && (
        <div className="demo-header">
          <FileText size={15} />
          <strong>{articleTitle}</strong>
          <span className="spacer" />
          <Btn
            data-ask-ai
            onClick={() => {
              setHidden(false)
              announce('同篇助手重新打开，保留会话与草稿。')
            }}
          >
            <Sparkles size={14} />问 AI
          </Btn>
        </div>
      )}
      <div className="demo-main">
        {overlay && !hidden && (
          <button
            type="button"
            className="overlay-dismiss"
            aria-label="关闭助手遮罩"
            onClick={() => {
              setHidden(true)
              window.requestAnimationFrame(() =>
                ref.current?.querySelector<HTMLButtonElement>('[data-ask-ai]')?.focus(),
              )
            }}
          />
        )}
        {!sidebar && (
          <aside className={`history-rail ${navOpen ? 'nav-open' : ''}`}>
            <div className="rail-brand">
              {after ? (
                <BrandLockup markSize={20} />
              ) : (
                <>
                  <span className="mimir-logo">m</span>
                  <strong>Mimir</strong>
                </>
              )}
              <Btn className="icon" aria-label="折叠导航" onClick={() => setNavOpen(false)}>
                <PanelLeftClose size={15} />
              </Btn>
            </div>
            <Btn className="outline" onClick={() => openDialog('search')}>
              <Search size={15} />
              快速搜索…
            </Btn>
            <Btn onClick={() => announce('知识库布局由已批准模块负责。')}>
              <Library size={15} />
              知识库
            </Btn>
            <Btn className="active" onClick={newConversation}>
              <MessageCircle size={15} />
              新建对话
            </Btn>
            <Btn onClick={() => announce('收集界面由已批准模块负责。')}>
              <Plus size={15} />
              收集
            </Btn>
            <div className="rail-divider" />
            <h3>知识库</h3>
            <Btn>
              <Folder size={15} />
              交互验收完成
            </Btn>
            <Btn>
              <FileText size={15} />
              开始使用
            </Btn>
            <h3>对话</h3>
            {historyRead === 'loading' ? (
              <div className="rail-status" role="status">
                正在读取对话…
              </div>
            ) : historyRead === 'empty' ? (
              <div className="rail-status">暂无对话，点上方“新建对话”。</div>
            ) : (
              <>
                {['error', 'stale', 'retry'].includes(historyRead) && (
                  <div className="rail-status" role="alert">
                    {historyRead === 'stale' ? '对话刷新失败' : '对话读取失败'}
                    <Btn onClick={() => setHistoryRead('retry')} disabled={historyRead === 'retry'}>
                      {historyRead === 'retry' ? '重试中…' : '重试'}
                    </Btn>
                  </div>
                )}
                {historyRead !== 'error' &&
                  historyRead !== 'retry' &&
                  [
                    question,
                    '如何建立每周阅读回顾',
                    ui.longTitle
                      ? '关于跨文档知识连接的深入思考与可持续个人知识管理实践探索'
                      : '阅读与写作之间的联系',
                  ].map((title, index) => (
                    <div
                      className={`history-row ${index === selectedHistory ? 'active' : ''}`}
                      key={title}
                    >
                      <button
                        type="button"
                        className="history-title"
                        aria-current={index === selectedHistory ? 'page' : undefined}
                        title={title}
                        onClick={() => chooseHistory(index)}
                      >
                        <span>{title}</span>
                        <small>{index ? '昨天' : '刚刚'}</small>
                      </button>
                    </div>
                  ))}
              </>
            )}
            <h3>最近笔记</h3>
            <Btn>
              <FileText size={14} />
              mimir 产品说明
            </Btn>
            <Btn>
              <FileText size={14} />
              搜索模块交互验收
            </Btn>
            <div className="rail-account">
              <Btn>
                <span className="avatar">A</span>admin
              </Btn>
              <Btn onClick={showSettings}>
                <Settings size={15} />
                设置
              </Btn>
            </div>
          </aside>
        )}
        {!sidebar && (
          <div className="compact-rail">
            <Btn aria-label="展开导航" className="icon" onClick={() => setNavOpen(!navOpen)}>
              <Menu size={18} />
            </Btn>
            <Btn className="icon" aria-label="新建对话" onClick={newConversation}>
              <MessageCircle size={18} />
            </Btn>
          </div>
        )}
        {sidebar && (
          <article
            className={`doc-context ${viewingSource ? 'source-highlight' : ''}`}
            inert={overlay && !hidden ? true : undefined}
          >
            <small>知识库 / 开始使用</small>
            <h2>{articleTitle}</h2>
            <p>收藏一篇文章很容易，真正困难的是在需要时重新找到它，理解它和其他想法之间的联系。</p>
            <h3>从收集开始</h3>
            <p className={viewingSource ? 'highlight' : ''}>
              知识库的价值，在于这些联系能够随着阅读与写作逐渐生长。
            </p>
            <p>保存来源，保留判断。让阅读成为下一次写作的起点。</p>
            {manualChanged && <Notice>画布已由用户修改 · 版本 13 · 未保存</Notice>}
            <Btn className="outline" onClick={changeAgent}>
              模拟人工继续编辑
            </Btn>
          </article>
        )}
        {unmounted ? (
          <div className="unmounted-boundary">
            <FileText size={25} />
            <h3>已切换到另一篇文档</h3>
            <p>原文档助手已卸载；旧工具和流不再绑定新文档。</p>
            <Btn
              className="outline"
              onClick={() => {
                setUnmounted(false)
                setPhase('empty')
                setDelivered('none')
                setText('')
                setFailure('')
                setSnapshot(false)
                setSentSnapshot(false)
                setAgentStage('completed')
              }}
            >
              重新打开新文档助手
            </Btn>
          </div>
        ) : sidebar && hidden && !after ? (
          <div className="sidebar-hidden">
            <Sparkles size={22} />
            <p>助手已隐藏</p>
            <small>{busy ? '同篇生成继续进行' : '同篇草稿和会话仍在'}</small>
            <Btn className="outline" data-ask-ai onClick={() => setHidden(false)}>
              重新打开助手
            </Btn>
          </div>
        ) : (
          <div className={`chat-panel-wrapper ${sidebar && hidden && after ? 'kept-hidden' : ''}`}>
            {sidebar && hidden && after && (
              <div className="sidebar-hidden">
                <Sparkles size={22} />
                <p>助手已隐藏</p>
                <small>同篇会话、文字与附件保留</small>
                <Btn className="outline" data-ask-ai onClick={() => setHidden(false)}>
                  重新打开助手
                </Btn>
              </div>
            )}
            <section
              hidden={sidebar && hidden && after}
              className={`chat-panel ${showEmpty ? 'empty' : ''}`}
              role={overlay ? 'dialog' : undefined}
              aria-modal={overlay ? true : undefined}
              aria-label={sidebar ? '问 AI 侧栏' : '主对话'}
            >
              {sidebar && (
                <>
                  <header className="demo-header">
                    <MessageCircle size={15} />
                    <strong>文档助手</strong>
                    <span className="spacer" />
                    <Btn
                      className="icon"
                      aria-label="关闭侧栏"
                      onClick={() => {
                        setHidden(true)
                        window.requestAnimationFrame(() =>
                          ref.current?.querySelector<HTMLButtonElement>('[data-ask-ai]')?.focus(),
                        )
                      }}
                    >
                      <X size={16} />
                    </Btn>
                  </header>
                  <div className="sidebar-scope">
                    <FileText size={14} />
                    <span title={scope || articleTitle}>
                      {ui.longTitle
                        ? `${articleTitle}——关于阅读、写作与知识积累的长期实践记录`
                        : scope || articleTitle}
                    </span>
                  </div>
                </>
              )}
              {sidebar && capability && (
                <section className="capability">
                  <strong>{ui.docx ? 'AI 修订' : '原件 Agent 编辑'}</strong>
                  <p role={capability === 'error' ? 'alert' : 'status'}>
                    {capability === 'loading'
                      ? '正在检测当前文档能力…'
                      : capability === 'error'
                        ? '读取编辑能力失败。'
                        : capability === 'nomodel'
                          ? '尚未配置支持工具调用的模型。'
                          : capability === 'nocanvas'
                            ? '原件画布尚未就绪，暂时不能编辑。'
                            : capability === 'unsupported'
                              ? '当前格式未提供可执行编辑工具。'
                              : '当前文档已连接可执行编辑工具。'}
                  </p>
                  {capability === 'error' && (
                    <Btn onClick={() => setCapability('loading')}>重试检测</Btn>
                  )}
                  {capability === 'nomodel' && <Btn onClick={showSettings}>配置模型</Btn>}
                  {ui.docx && capability === 'ready' && (
                    <>
                      <label className="revision-switch">
                        <span>保留 AI 修订</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={revision}
                          aria-label="保留 AI 修订"
                          onClick={() => setRevision(!revision)}
                        >
                          <span />
                        </button>
                      </label>
                      <small>
                        {revision ? '编辑结果保留待审阅。' : '编辑会直接更新 DOCX 原件。'}
                      </small>
                    </>
                  )}
                </section>
              )}
              {bridgePanel}
              {viewingSource &&
              (!sidebar || sourceTarget === 'new' || sourceTarget === 'history-original') ? (
                <div className="source-view">
                  <Btn onClick={() => setViewingSource(false)}>
                    <ArrowLeft size={14} />
                    返回对话
                  </Btn>
                  <h2>{sourceTarget === 'new' || saved ? '知识整理行动清单' : articleTitle}</h2>
                  <p>知识库的价值，在于这些联系能够随着阅读与写作逐渐生长。</p>
                  <mark>保留来源与自己的判断，让新的笔记连到已有主题。</mark>
                  <Notice>原文定位与格式编辑由文档模块提供。此处仅模拟返回原会话的交接。</Notice>
                </div>
              ) : after ? (
                <div className="official-host-layout">
                  <div className="official-thread-container">
                    <ThreadFrame
                      fixture={{
                        sendContext,
                        toolbar: {
                          scope,
                          sidebar,
                          models,
                          selectedModel: modelSelection,
                          modelsStatus,
                          searchOnly,
                          documents: sampleDocs,
                          documentsStatus: docsRead as 'loaded' | 'loading' | 'error' | 'empty',
                          initialMenu: ['scope', 'model', 'strength'].includes(ui.menu)
                            ? ui.menu
                            : 'none',
                        },
                        messages: createThreadMessages({
                          scene,
                          phase,
                          delivered,
                          lastQuestion,
                          toolArgs,
                          toolResult,
                          agentStage,
                          sentSnapshot,
                          searchOnly,
                          failure,
                          attachments: sentFiles,
                        }),
                        running: busy,
                        loading: phase === 'loading',
                        draft: text,
                        dark,
                        zoom,
                        attachmentMode,
                        suggestions:
                          sidebar && !snapshot && ['empty', 'creating'].includes(phase)
                            ? [
                                { title: '速读本文', prompt: '这篇讲了什么？用几句话概括。' },
                                { title: '提出要点', prompt: '这篇里最重要的几个要点是什么？' },
                                { title: '解释细节', prompt: '这篇里有哪些我需要特别注意的细节？' },
                              ]
                            : [],
                        lifetime: attachmentLifetime,
                        searchOnly,
                        noVision: !!ui.noVision,
                        noModel: !!ui.noModel,
                        snapshot,
                        agentActive: isTool || revision,
                        attachmentCommand,
                        restoreFiles,
                        queue: queue.map((item) => item.text),
                        blockSend: !!(snapshot && (validationIssue || ui.noVision)),
                        canReload:
                          !isTool && !showBridge && !snapshot && !sentSnapshot && !ui.historyMode,
                      }}
                      onToolbarAction={(action, value) => {
                        if (action === 'toolbar-scope') {
                          setScope(value || '')
                        } else if (action === 'toolbar-strength') {
                          setModelSelection(
                            updateToolbar(currentToolbar(), action, value).selectedModel!,
                          )
                        } else if (action === 'toolbar-model') {
                          const model = models.find((model) => modelKey(model) === value)
                          if (model) {
                            setModelSelection((previous) => selectModel(model, previous))
                            announce('已切换模型；兼容等级保留，其余采用该模型默认设置。')
                          }
                        } else if (action === 'toolbar-refetch-models') {
                          setModelsStatus('loaded')
                        } else if (action === 'toolbar-refetch-documents') setDocsRead('loading')
                        else if (action === 'toolbar-manage-models') showSettings()
                      }}
                      onSend={(value, files, intent) => send(value, files, intent)}
                      onCancel={stop}
                      onRetry={() => retry()}
                      onAttachmentError={setAttachmentNotice}
                      onSnapshotRemoved={() => {
                        setSnapshot(false)
                        setSnapshotIssue('')
                        setValidationIssue('')
                      }}
                      onDraft={(value) =>
                        setText((previous) => (previous === value ? previous : value))
                      }
                    />
                  </div>
                  <section className="host-context" aria-label="Mimir 对话外宿主操作">
                    <div className="host-context-header">
                      <strong>Mimir 宿主</strong>
                      {ui.usage && !sidebar && <Btn onClick={() => openMenu('usage')}>用量</Btn>}
                      {attachmentScene && (
                        <span>
                          附件模型能力：
                          {ui.noVision ? '当前模拟模型无视觉' : '当前模拟模型支持视觉'} ·{' '}
                          {searchOnly ? '只检索，禁止附件发送' : '模型问答'}
                        </span>
                      )}
                      {busy && (
                        <Btn onClick={() => send()} disabled={!text.trim()}>
                          排队当前草稿
                        </Btn>
                      )}
                      {lastSuccessful &&
                        !ui.emptyAnswer &&
                        (!isTool || agentStage === 'completed') && (
                          <Btn
                            disabled={saving}
                            onClick={() => (saved ? setViewingSource(true) : saveAnswer())}
                          >
                            {saving ? '保存中…' : saved ? '打开笔记' : '存成笔记'}
                          </Btn>
                        )}
                      {searchOnly && hasAnswer && (
                        <Btn onClick={() => copyAnswer()}>复制检索片段与来源</Btn>
                      )}
                    </div>
                    {snapshot && (
                      <Snapshot
                        removable
                        onRemove={() => {
                          setSnapshot(false)
                          setSnapshotIssue('')
                          setValidationIssue('')
                          announce('已移除截图；输入框中的文字保留。')
                        }}
                      />
                    )}
                    {snapshotIssue && (
                      <Notice kind="error">
                        {snapshotIssue}
                        <Btn aria-label="关闭截图提示" onClick={() => setSnapshotIssue('')}>
                          关闭提示
                        </Btn>
                      </Notice>
                    )}
                    {snapshot && ui.noVision && !snapshotIssue && (
                      <Notice>
                        截图发送需要配置视觉模型。<Btn onClick={showSettings}>设置模型</Btn>
                      </Notice>
                    )}
                    {queued && (
                      <div
                        className="queue-row"
                        data-frozen-scope={queuedParams.current.scope || ''}
                        data-frozen-deep={String(queuedParams.current.deep)}
                      >
                        <span>已排队</span>
                        <span className="queued-text">{queued}</span>
                        <small title="入队时冻结的本地模拟参数">
                          {queuedParams.current.scope || '全部文档'} ·{' '}
                          {after
                            ? [
                                queuedParams.current.intent?.model?.providerId,
                                queuedParams.current.intent?.model?.modelId,
                                queuedParams.current.intent?.model?.reasoningEffort,
                              ]
                                .filter(Boolean)
                                .join(' · ') || '演示队列'
                            : queuedParams.current.deep
                              ? '深入'
                              : '标准'}
                        </small>
                        <Btn aria-label="取回排队的消息" onClick={restoreQueued}>
                          取回
                        </Btn>
                      </div>
                    )}
                    {loadError && (
                      <Notice kind="error">
                        暂时无法读取这段对话。
                        <Btn
                          onClick={() => {
                            setLoadError(false)
                            setDelivered('none')
                            setPhase('loading')
                          }}
                        >
                          重试
                        </Btn>
                      </Notice>
                    )}
                    {failureCard}
                    {historyNotice}
                    {missingSave ? (
                      <Notice>没有可保存的已落库助手回答，不能误存上一轮。</Notice>
                    ) : (
                      saveError && <Notice kind="error">存成笔记失败 · 可以重试</Notice>
                    )}
                    {!ui.noCitations && delivered === 'full' && (
                      <details open={scene.track === 'citations'}>
                        <summary>查看知识库依据 · Mimir 宿主</summary>
                        {citations}
                      </details>
                    )}
                    {scene.state === 'audio-demo' && (
                      <Notice>
                        独立本地WAV模拟：真实有效PCM字节，自定义媒体组件播放，无自动播放；它不是原来源场景的媒体数据，也不代表支持音频上传。
                      </Notice>
                    )}
                    {scene.track === 'audio' && (
                      <Notice>
                        此来源场景没有真实媒体 payload，原型不伪造播放；实际 URL/base64 与 MIME
                        可由数据适配投影为媒体消息。
                      </Notice>
                    )}
                    {scene.track === 'sources' && (
                      <details open>
                        <summary>外部来源 · Mimir 宿主</summary>
                        {ui.noHref ? (
                          <p>此来源没有可跳转地址。</p>
                        ) : (
                          <a href="https://example.com/reference" target="_blank" rel="noreferrer">
                            研究来源（外部示例链接）
                          </a>
                        )}
                      </details>
                    )}
                    {attachmentNotice && <Notice>{attachmentNotice}</Notice>}
                    {attachmentScene && (
                      <section aria-label="附件原型控制">
                        <strong>附件本地模拟 · 不属于产品入口</strong>
                        <div className="actions">
                          <Btn onClick={() => setAttachmentCommand(`add:${Date.now()}`)}>
                            添加本地示例
                          </Btn>
                          <Btn
                            onClick={() => {
                              setAttachmentMode('ready')
                              setAttachmentCommand(`complete:${Date.now()}`)
                            }}
                          >
                            模拟准备完成
                          </Btn>
                          <Btn onClick={() => setAttachmentCommand(`failed:${Date.now()}`)}>
                            模拟准备失败
                          </Btn>
                          <Btn onClick={() => setAttachmentCommand(`cancel:${Date.now()}`)}>
                            取消准备
                          </Btn>
                        </div>
                        <small>
                          图片预览、附件移除、准备与错误由 Mimir
                          自定义组件渲染；文档tile不提供下载/预览，原件读取在外部宿主承接，真实HTTP留实施。失败后使用原生移除，再重新选择。Office/PDF在本稿仅模拟准备，不代表已解析。若发送被视觉/只检索/上下文限制拒绝，输入区保留稿件；移除后重选恢复。
                        </small>
                      </section>
                    )}
                    <div className="host-boundary">
                      Mimir 主题与自定义组件 ·
                      输入框内保留模型、思考强度和检索范围。附件仅为本地模拟；供应商、模型及推理能力均为演示数据。
                    </div>
                    <details open={scene.state === 'policy'}>
                      <summary>拟定附件政策与原型边界</summary>
                      <p className="host-boundary">
                        消息、输入、附件及发送使用TanStack AI React 归约与 Mimir
                        自定义组件；仅在输入框底部组合模型、思考强度和单篇检索范围。引用、存笔记、队列与
                        Agent 交接仍由外部宿主提供。本地附件适配器
                        原型，仅模拟临时附件准备；不上传服务器、不入知识库、不调用模型。拟定每条4件/合计20
                        MiB，文档10 MiB、图片5
                        MiB/最大边4096/16MP；提取每件12000字符/本轮24000，不静默截断。已发随会话、草稿24h、未绑定且无active
                        lease的准备失败/孤儿1h、每会话200
                        MiB。通用附件只供普通模型问答，不构成Agent编辑授权；AI修订/Agent开启时通用附件发送被拒绝并保留草稿，截图仍走独立来源/最多1PNG校验。支持文本/代码/CSV/TSV/JSON/YAML/XML、PDF文字层/现代Office、PNG/JPEG/静态WebP；不含音视频上传、OCR及旧Office。全部待此稿审批。图片须所选模型具视觉；只检索带附件发送前拒绝并保留稿。仅附件由宿主补充默认指令：文档“请概括附件内容”，纯图片“请描述并分析这些图片”。历史仅保留已发引用，草稿/失败TTL与每会话容量需未来服务端验证；本稿只演示本地生命周期，新建清空临时附件，关闭助手保留。正式适配器须保存服务端canonical附件ID并使用file/image引用，不能依赖AGUI的UI序号ID或本稿文本fixture；图片须绝对同源HTTP(S)地址。宿主Escape/焦点守卫不穿透iframe，输入键盘行为对齐
                        v4；产品阶段需验证文档宿主的跨document焦点交接。评审字号/减少动态开关仅作用于宿主；消息区以真实浏览器缩放和系统设置验收。
                      </p>
                    </details>
                  </section>
                </div>
              ) : (
                <div
                  className="chat-scroll"
                  ref={scroller}
                  onScroll={(event) =>
                    setScrollAway(
                      event.currentTarget.scrollHeight -
                        event.currentTarget.clientHeight -
                        event.currentTarget.scrollTop >
                        80,
                    )
                  }
                >
                  {loadError ? (
                    <div className="load-error">
                      <TriangleAlert size={22} />
                      <h3>会话读取失败</h3>
                      <p>
                        {after ? '暂时无法读取这段对话，请重试。' : '记录还在，重试一下就能打开。'}
                      </p>
                      <Btn
                        className="outline"
                        onClick={() => {
                          setLoadError(false)
                          setDelivered('none')
                          setPhase('loading')
                        }}
                      >
                        重试
                      </Btn>
                    </div>
                  ) : phase === 'loading' ? (
                    <div className="thread-inner skeleton" role="status" aria-label="正在加载会话">
                      <b />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  ) : showEmpty ? (
                    <div className="empty-stage">
                      <div className="empty-greeting">
                        {!sidebar && (
                          <div className="empty-icon">
                            <MessageCircle size={22} />
                          </div>
                        )}
                        <h2>{sidebar ? '围绕这篇文档提问' : '向知识库提问'}</h2>
                        <p>
                          {sidebar
                            ? '回答限定在本文，可回到原文查看依据。'
                            : '检索你的文档，回答会附上原文引用。'}
                        </p>
                      </div>
                      {phase === 'creating' && <Notice>正在建立新对话…</Notice>}
                      {sidebar && !snapshot && ui.specialState !== 'other' && (
                        <div className="quick-questions">
                          {['速读本文', '提出要点', '解释细节'].map((label, index) => (
                            <Btn
                              key={label}
                              onClick={() =>
                                send(
                                  [
                                    '这篇讲了什么？用几句话概括。',
                                    '这篇里最重要的几个要点是什么？',
                                    '这篇里有哪些我需要特别注意的细节？',
                                  ][index],
                                )
                              }
                            >
                              {label}
                              {after && <ArrowUp size={13} />}
                            </Btn>
                          ))}
                        </div>
                      )}
                      {failureCard}
                      {composer}
                    </div>
                  ) : (
                    <div className="thread-inner">
                      <div className="message-thread">
                        <div className="user-message">
                          {sentSnapshot && <Snapshot sent />}
                          {lastQuestion}
                        </div>
                        {!(
                          (ui.emptyAnswer && !after && ui.currentDefect === 'zero-stream') ||
                          (ui.emptyAnswer && phase === 'stopped')
                        ) && (
                          <article className="assistant-message">
                            <div className="assistant-label">
                              <MessageCircle size={14} />
                              Mimir
                            </div>
                            {!after &&
                              (ui.trace || ['searching', 'streaming'].includes(phase)) &&
                              (phase === 'searching' && !traceReady ? (
                                <div className="disclosure" role="status">
                                  <span className="trace-waiting">
                                    <Brain size={15} />
                                    正在检索知识库…
                                  </span>
                                </div>
                              ) : (
                                <Disclosure
                                  title={
                                    phase === 'searching'
                                      ? '正在检索知识库…'
                                      : searchOnly
                                        ? '检索 1 轮 · 2 次检索操作 (1.2s)'
                                        : '思考 2 轮 · 调用 3 次工具 (4.8s)'
                                  }
                                  openInitially={
                                    ui.traceOpen ||
                                    phase === 'searching' ||
                                    (!after && phase === 'streaming')
                                  }
                                  live={busy}
                                  after={after}
                                >
                                  <p>识别问题中的主题与关键词</p>
                                  <p>词级召回 3 段 · 子串兜底 1 段 · 向量 2 段</p>
                                  <p>
                                    {scope
                                      ? '限定本篇，读取相关内容'
                                      : '合并并去除重复片段，保留来源位置'}
                                  </p>
                                  {ui.special === 'trace' &&
                                    ui.specialState === 'scroll' &&
                                    Array.from({ length: 18 }, (_, i) => (
                                      <p key={i}>
                                        第{i + 1}步：核对检索片段和来源位置，合并相关上下文。
                                      </p>
                                    ))}
                                </Disclosure>
                              ))}
                            {ui.reasoning && !after && (
                              <div className="reasoning-shell">
                                <Disclosure
                                  title={busy ? '正在思考… (2s)' : '已思考 (2.3s)'}
                                  openInitially={ui.reasoningOpen}
                                  live={busy}
                                  after={after}
                                >
                                  <p>
                                    先明确问题的目标，再把整理方法和可执行的行动联系起来。需要保留原文语境，避免只对收藏做分类。
                                  </p>
                                  {ui.special === 'reasoning' &&
                                    ui.specialState === 'long' &&
                                    Array.from({ length: 20 }, (_, i) => (
                                      <p key={i}>
                                        第{i + 1}
                                        条思考：对照原文语境与当前问题，检验这条整理建议是否成立。
                                      </p>
                                    ))}
                                </Disclosure>
                              </div>
                            )}
                            {scene.track === 'tool' && agentCard}
                            {historyNotice}
                            {hasAnswer && !ui.emptyAnswer && (
                              <div className="prose">
                                {searchOnly ? (
                                  <p>本轮仅检索知识库，未调用模型。</p>
                                ) : (
                                  <>
                                    <p>
                                      可以从一条清晰的使用路径开始：
                                      <strong>保留来源，建立联系，定期回顾。</strong>
                                      {phase === 'streaming' && (
                                        <span className="stream-caret">▍</span>
                                      )}
                                    </p>
                                    {phase !== 'streaming' && (
                                      <>
                                        <h2>把收藏变成可使用的知识</h2>
                                        <p>
                                          不必一开始就建立复杂的分类。先写下这篇资料解决了什么问题，再把它连接到一个正在推进的主题。
                                        </p>
                                        <ul>
                                          <li>收集时保留原文链接和关键片段。</li>
                                          <li>整理时补一句自己的理解，再关联已有笔记。</li>
                                          <li>每周回顾一次，把新的联系写进下一步行动。</li>
                                        </ul>
                                        {ui.richText && (
                                          <>
                                            <blockquote>
                                              “让阅读形成联系，而不只是增加收藏数量。”
                                            </blockquote>
                                            <div className="table-scroll">
                                              <table>
                                                <thead>
                                                  <tr>
                                                    <th>阶段</th>
                                                    <th>可以做什么</th>
                                                    <th>保留什么</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  <tr>
                                                    <td>收集</td>
                                                    <td>记录一句用途</td>
                                                    <td>原文来源</td>
                                                  </tr>
                                                  <tr>
                                                    <td>理解</td>
                                                    <td>关联正在推进的主题</td>
                                                    <td>自己的判断</td>
                                                  </tr>
                                                </tbody>
                                              </table>
                                            </div>
                                            {!(
                                              ui.special === 'code' &&
                                              ui.specialState === 'fallback'
                                            ) && (
                                              <div className="code-head">
                                                <span>javascript</span>
                                                <Btn
                                                  aria-label="复制代码"
                                                  onClick={() => copyAnswer(true)}
                                                >
                                                  {copyStatus === 'copied' ? (
                                                    <Check size={13} />
                                                  ) : (
                                                    <Copy size={13} />
                                                  )}
                                                  复制
                                                </Btn>
                                              </div>
                                            )}
                                            {after && copyStatus === 'error' && (
                                              <Notice kind="error">
                                                复制失败，请选择代码后手动复制。
                                              </Notice>
                                            )}
                                            <pre>
                                              <code>
                                                {
                                                  'const note = {\n  source: "原文链接",\n  takeaway: "对当前问题的启发",\n  connections: ["正在推进的主题"]\n}'
                                                }
                                              </code>
                                            </pre>
                                            <p>
                                              <a
                                                href="#"
                                                onClick={(event) => {
                                                  event.preventDefault()
                                                  openDialog('source')
                                                }}
                                              >
                                                阅读外部来源 <ExternalLink size={12} />
                                              </a>{' '}
                                              · <code>source</code> 保留原始语境。
                                            </p>
                                          </>
                                        )}
                                      </>
                                    )}
                                  </>
                                )}
                                {ui.media && (
                                  <div className="media-parts">
                                    {scene.track === 'sources' && (
                                      <button
                                        type="button"
                                        className="source-chip"
                                        onClick={() => openDialog('source')}
                                      >
                                        <b>W</b>知识连接的方法 <ExternalLink size={12} />
                                      </button>
                                    )}
                                    {ui.noHref && (
                                      <span className="source-chip">
                                        <b>D</b>来源文档 · 无链接
                                      </span>
                                    )}
                                    {scene.track === 'files' && (
                                      <span className="file-chip">
                                        {after ? <FileGlyph kind="pdf" /> : <FileText size={16} />}{' '}
                                        <span>
                                          {ui.longFile
                                            ? '个人知识库整理与回顾方法完整导出报告及补充资料-2026-10-18.pdf'
                                            : '整理建议.pdf'}
                                        </span>
                                        {!ui.unsafeFile && (
                                          <Btn
                                            aria-label="下载整理建议.pdf"
                                            onClick={() =>
                                              announce('模拟下载交接；未验证浏览器下载或文件落盘。')
                                            }
                                          >
                                            <Download size={14} />
                                          </Btn>
                                        )}
                                      </span>
                                    )}
                                    {scene.track === 'audio' && (
                                      <span className="file-chip">
                                        {after ? (
                                          <FileGlyph kind="audio" />
                                        ) : (
                                          <FileText size={16} />
                                        )}{' '}
                                        <span>
                                          {ui.specialState === 'wav'
                                            ? '访谈录音.wav'
                                            : ui.specialState === 'other-mime'
                                              ? '数据导出.json'
                                              : '访谈录音.mp3'}
                                        </span>
                                        <Btn
                                          aria-label="下载音频"
                                          onClick={() =>
                                            announce('音频通过文件部件呈现，原型不验收原生播放。')
                                          }
                                        >
                                          <Download size={14} />
                                        </Btn>
                                      </span>
                                    )}
                                    {scene.track === 'images' &&
                                      (imageState === 'error' ? (
                                        after ? (
                                          <div className="image-error">
                                            <TriangleAlert size={20} />
                                            <p>图片暂时无法读取</p>
                                            <Btn
                                              className="outline"
                                              onClick={() => setImageState('loading')}
                                            >
                                              重新加载
                                            </Btn>
                                            <Btn onClick={() => openDialog('media')}>查看原图</Btn>
                                          </div>
                                        ) : (
                                          <span
                                            className="broken-image"
                                            role="img"
                                            aria-label="读取失败的图片"
                                          >
                                            ▧
                                          </span>
                                        )
                                      ) : imageState === 'loading' ? (
                                        <div className="image-error" role="status">
                                          正在读取图片…
                                        </div>
                                      ) : (
                                        <button
                                          className="preview-image"
                                          type="button"
                                          aria-label="查看原图"
                                          onClick={() => openDialog('media')}
                                        >
                                          示例图片 · 知识连接图
                                        </button>
                                      ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {!ui.noCitations && delivered === 'full' && citations}
                            {!(ui.currentDefect === 'zero-stream' && !after) && failureCard}
                            {phase === 'stopped' && (
                              <div className="stopped">
                                <span>
                                  <Square size={10} /> 已停止生成
                                </span>
                                <small>保留已生成的内容</small>
                              </div>
                            )}
                            {lastSuccessful &&
                              !ui.emptyAnswer &&
                              !ui.multiTurn &&
                              (!isTool || agentStage === 'completed') && (
                                <div className="answer-actions">
                                  <Tooltip
                                    title={saved ? '打开笔记' : saving ? '保存中…' : '存成笔记'}
                                  >
                                    <span>
                                      <Btn
                                        aria-label={saved ? '打开笔记' : '存成笔记'}
                                        disabled={saving}
                                        onClick={() =>
                                          saved ? setViewingSource(true) : saveAnswer()
                                        }
                                      >
                                        {saving ? (
                                          <LoaderCircle size={16} />
                                        ) : saved ? (
                                          <ExternalLink size={16} />
                                        ) : (
                                          <Save size={16} />
                                        )}
                                      </Btn>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title={copyStatus === 'copied' ? '已复制' : '复制回答'}>
                                    <Btn
                                      aria-label={copyStatus === 'copied' ? '已复制' : '复制回答'}
                                      onClick={() => copyAnswer()}
                                    >
                                      {copyStatus === 'copied' ? (
                                        <Check size={16} />
                                      ) : (
                                        <Copy size={16} />
                                      )}
                                    </Btn>
                                  </Tooltip>
                                  {after && saveError && (
                                    <span className="action-error" role="alert">
                                      存成笔记失败 · 可以重试
                                    </span>
                                  )}
                                </div>
                              )}
                          </article>
                        )}
                        {ui.multiTurn && (
                          <>
                            <div className="user-message">那每周回顾时，应该优先看什么？</div>
                            <article className="assistant-message">
                              <div className="assistant-label">
                                <MessageCircle size={14} />
                                Mimir
                              </div>
                              <div className="prose">
                                <p>
                                  优先看正在使用的主题，找出本周新增的联系，以及还缺哪一个关键事实。
                                </p>
                              </div>
                              {lastSuccessful && (
                                <div className="answer-actions">
                                  <Btn aria-label="存成最后回答笔记" onClick={saveAnswer}>
                                    <Save size={16} />
                                  </Btn>
                                  <Btn aria-label="复制最后回答" onClick={() => copyAnswer()}>
                                    <Copy size={16} />
                                  </Btn>
                                </div>
                              )}
                            </article>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!after && !showEmpty && !viewingSource && !loadError && composer}
              {!after && scrollAway && !showEmpty && (
                <Btn
                  className="scroll-bottom"
                  aria-label="回到底部"
                  onClick={() => {
                    scroller.current?.scrollTo({
                      top: scroller.current.scrollHeight,
                      behavior: reduced ? 'instant' : 'smooth',
                    })
                    setScrollAway(false)
                  }}
                >
                  <ArrowDown size={18} />
                </Btn>
              )}
            </section>
          </div>
        )}
      </div>
      {menu !== 'none' && !(after && ['scope', 'model', 'strength'].includes(menu)) && (
        <div
          className={`menu-layer bottom ${['model', 'strength', 'usage'].includes(menu) ? 'right' : ''}`}
          role="menu"
          aria-label={`${menu}菜单`}
        >
          {menu === 'scope' ? (
            renderScopeMenu()
          ) : menu === 'strength' ? (
            <>
              <Btn
                role="menuitemradio"
                aria-checked={!deep}
                onClick={() => {
                  setDeep(false)
                  closeMenu()
                }}
              >
                标准（对话模型）{!deep && <Check size={13} />}
              </Btn>
              <Btn
                role="menuitemradio"
                aria-checked={deep}
                onClick={() => {
                  setDeep(true)
                  closeMenu()
                }}
              >
                深入（推理模型）{deep && <Check size={13} />}
              </Btn>
            </>
          ) : menu === 'model' ? (
            <>
              <div className="bound-option" aria-disabled="true">
                <span>
                  {ui.noModel
                    ? '未配置'
                    : attachmentScene && ['image', 'image-only'].includes(scene.state)
                      ? 'Qwen3-VL（模拟已选视觉模型）'
                      : ui.longModel
                        ? longModel
                        : 'Qwen3'}
                </span>
                {!deep && <Check size={13} />}
                <span className="sr-only">对话模型，全局绑定，不可点击</span>
              </div>
              <div className="bound-option" aria-disabled="true">
                <span>{ui.noModel ? '未配置' : ui.sameModel ? 'Qwen3' : 'DeepSeek R1'}</span>
                {deep && <Check size={13} />}
                <span className="sr-only">推理模型，全局绑定，不可点击</span>
              </div>
              <div className="menu-divider" />
              <Btn role="menuitem" onClick={showSettings}>
                管理模型
                <ExternalLink size={13} />
              </Btn>
            </>
          ) : menu === 'usage' ? (
            <>
              <div className="muted">最近一次请求 · Qwen3</div>
              <div className="usage-number">
                <div>输入（上下文）：{ui.specialState === 'unknown-input' ? '—' : '1.5万'} tok</div>
                <div>输出：1,280 tok</div>
                <div>合计：1.7万 tok</div>
              </div>
              <div className="muted">
                最近一次实际请求。输入包含系统提示、全部消息与检索命中；并非容量上限估算。
              </div>
            </>
          ) : null}
        </div>
      )}
      {dialog !== 'none' && (
        <div
          className="dialog-shade"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeDialog()
          }}
        >
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              dialog === 'guard'
                ? '离开当前编辑'
                : dialog === 'search'
                  ? '搜索问题交接'
                  : '交接边界'
            }
          >
            {dialog === 'guard' ? (
              <>
                <h3>当前文档有未保存的修改</h3>
                <p>离开前，可以继续编辑或通过当前格式支持的保存入口处理。</p>
                <div className="dialog-actions">
                  <Btn className="outline" onClick={closeDialog}>
                    继续编辑
                  </Btn>
                  <Btn onClick={performPendingNavigation}>放弃并离开</Btn>
                  <Btn
                    className="primary"
                    disabled={!ui.canSave}
                    onClick={() => announce('保存由实际格式宿主完成；不在 Chat 中伪造保存。')}
                  >
                    保存并离开
                  </Btn>
                </div>
              </>
            ) : dialog === 'search' ? (
              <>
                <h3>搜索知识库</h3>
                <input
                  aria-label="搜索问题"
                  value={text}
                  placeholder="输入你想了解的问题"
                  onChange={(event) => setText(event.target.value)}
                />
                <p>只预填问题，不自动发送</p>
                <Btn
                  className="outline"
                  disabled={!text.trim() || ui.searchBlocked}
                  onClick={() =>
                    runGuarded(() => {
                      setDialog('none')
                      setPhase('empty')
                      setDelivered('none')
                      setFailure('')
                      input.current?.focus()
                    })
                  }
                >
                  带到新对话
                  <ArrowRight size={14} />
                </Btn>
              </>
            ) : dialog === 'model-boundary' ? (
              <>
                <h3>管理全局模型</h3>
                <p>实际进入 设置 → 模型。对话菜单只展示角色绑定，本轮不提供会话级模型切换。</p>
                <Notice>设置页属于后续模块；此处为本地原型交接，不修改配置。</Notice>
                <div className="dialog-actions">
                  <Btn className="outline" onClick={closeDialog}>
                    返回对话
                  </Btn>
                </div>
              </>
            ) : dialog === 'media' ? (
              <>
                <h3>查看原图</h3>
                <div className="preview-image">示例图像 · 原型示意</div>
                <p>真实图片新标签页、浏览器下载和原生媒体播放由宿主及浏览器提供。</p>
                <Btn className="outline" onClick={closeDialog}>
                  关闭
                </Btn>
              </>
            ) : (
              <>
                <h3>{dialog === 'note' ? '打开笔记' : '打开来源'}</h3>
                <p>
                  此处模拟外部来源/文档跳转。真实引用携带文档
                  ID、片段和偏移；不把示例链接当作真实检索结果。
                </p>
                <Btn className="outline" onClick={closeDialog}>
                  返回
                </Btn>
              </>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <div className="simulation-bar">
        <span>原型控制 · 不接接口</span>
        {after && lastSentIntent && (
          <output
            aria-label="本地发送快照"
            data-sent-scope={lastSentIntent.scope}
            data-sent-model={JSON.stringify(lastSentIntent.model)}
            data-sent-kind={lastSentIntent.kind}
          >
            本地发送快照：{lastSentIntent.scope || '全部文档'} ·{' '}
            {lastSentIntent.model
              ? `${lastSentIntent.model.providerId} / ${lastSentIntent.model.modelId} / ${lastSentIntent.model.reasoningEffort || '无等级参数'}`
              : '只检索'}{' '}
            · {lastSentIntent.kind === 'append' ? '快捷提问' : '输入发送'}
          </output>
        )}
        {busy && (
          <>
            {!after && <Btn onClick={() => setTraceReady(true)}>模拟检索返回</Btn>}
            <Btn
              onClick={() => {
                setPhase('streaming')
                setDelivered('partial')
              }}
            >
              模拟正文开始
            </Btn>
            <Btn onClick={() => finish()}>模拟完成</Btn>
            <Btn onClick={() => finish(true)}>模拟失败</Btn>
          </>
        )}
        {phase === 'loading' && (
          <>
            <Btn
              onClick={() => {
                setPhase('complete')
                setDelivered('full')
              }}
            >
              读取成功
            </Btn>
            <Btn
              onClick={() => {
                setLoadError(true)
                setPhase('error')
              }}
            >
              读取失败
            </Btn>
          </>
        )}
        {saving && (
          <>
            <Btn onClick={() => completeSave(false)}>保存成功</Btn>
            <Btn onClick={() => completeSave(true)}>保存失败</Btn>
          </>
        )}
        {docsRead === 'loading' && (
          <>
            <Btn onClick={() => setDocsRead('loaded')}>文档读成功</Btn>
            <Btn onClick={() => setDocsRead('error')}>文档读失败</Btn>
          </>
        )}
        {historyRead === 'retry' && (
          <>
            <Btn onClick={() => setHistoryRead('loaded')}>历史读成功</Btn>
            <Btn onClick={() => setHistoryRead('error')}>历史再失败</Btn>
          </>
        )}
        {capability === 'loading' && (
          <>
            <Btn onClick={() => setCapability('ready')}>能力就绪</Btn>
            <Btn onClick={() => setCapability('error')}>检测失败</Btn>
          </>
        )}
        {ui.special === 'draft-consume' && (
          <>
            <Btn onClick={() => announce('同一草稿只消费一次，保留当前输入，未重复覆盖。')}>
              重投同一草稿
            </Btn>
            <Btn
              onClick={() => {
                setText('新的宿主草稿：请解释另一段内容。')
                setScope('当前文档')
                announce('新草稿对象已替换预填，尚未发送。')
              }}
            >
              投递新草稿
            </Btn>
          </>
        )}
        {ui.special === 'sidebar-lifetime' && (
          <Btn
            onClick={() => {
              setUnmounted(true)
              setText('')
              setPhase('empty')
              setDelivered('none')
            }}
          >
            模拟离开文档/卸载
          </Btn>
        )}
        {ui.special === 'draft-lifetime' && (
          <Btn
            onClick={() => {
              setText('')
              setSnapshot(false)
              announce('模拟页面刷新；未发草稿没有持久化。')
            }}
          >
            模拟页面刷新
          </Btn>
        )}
        {isTool && (
          <>
            <Btn onClick={() => setAgentStage('resubmit')}>续轮失败</Btn>
            <Btn onClick={changeAgent}>改变画布版本</Btn>
            {agentStage === 'submitting' && (
              <Btn onClick={() => setAgentStage('completed')}>提交成功</Btn>
            )}
            {agentStage === 'cancelling' && (
              <>
                <Btn
                  onClick={() => {
                    setAgentStage('cancelled')
                    setAgentCancel(false)
                  }}
                >
                  取消成功
                </Btn>
                <Btn
                  onClick={() => {
                    setAgentStage('awaiting')
                    setSpecialState('cancel-error')
                    setAgentCancel(false)
                    announce('取消失败，仍保留待处理工具，可再次取消。')
                  }}
                >
                  取消失败
                </Btn>
              </>
            )}
          </>
        )}
        {snapshot && (
          <>
            <Btn
              onClick={() => {
                setValidationIssue('截图来源、页或版本已变化，草稿保留，请回原文档重新准备。')
                setSnapshotIssue('截图来源、页或版本已变化，草稿保留，请回原文档重新准备。')
              }}
            >
              模拟来源失效
            </Btn>
            {snapshotIssue && (
              <Btn
                onClick={() => {
                  setSnapshotIssue('')
                  setValidationIssue('')
                  announce('仅模拟重新核对同源目标，不重新绑定当前页。')
                }}
              >
                模拟校验恢复
              </Btn>
            )}
          </>
        )}
        {operation !== 'idle' && (
          <>
            <Btn onClick={() => settleDraft(false)}>操作成功</Btn>
            <Btn onClick={() => settleDraft(true)}>操作失败</Btn>
          </>
        )}
        {mediaChoice === 'picker' && (
          <>
            <Btn onClick={() => setMediaChoice('processing')}>选件成功</Btn>
            <Btn
              onClick={() => {
                setMediaChoice('waiting')
                announce('系统选择已取消，继续等候；可重新选择或停止。')
              }}
            >
              系统取消
            </Btn>
          </>
        )}
        {imageState === 'loading' && (
          <>
            <Btn onClick={() => setImageState('loaded')}>图像读成功</Btn>
            <Btn onClick={() => setImageState('error')}>图像读失败</Btn>
          </>
        )}
        {ui.trackBoundary && <span>{ui.trackBoundary}</span>}
        <select
          aria-label="模拟请求结果"
          value={outputMode}
          onChange={(event) => setOutputMode(event.target.value)}
        >
          <option value="success">常规模拟结果</option>
          <option value="quota">额度受限</option>
          <option value="timeout">请求超时</option>
          <option value="truncated">输出截断</option>
          <option value="offline">网络不可达</option>
          <option value="copy-error">复制失败</option>
        </select>
        {hasOlderDraft && <span>本地草稿未持久化</span>}
      </div>
    </div>
  )
}
function FitPreview({ children, size, fit }: { children: ReactNode; size: string; fit: boolean }) {
  const viewport = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(1140)
  const target = size === 'phone' ? 390 : size === 'medium' ? 768 : 1140
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setAvailable(width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div className="preview-viewport" ref={viewport}>
      <div
        className={`preview-shell ${size}`}
        style={{ zoom: fit ? Math.min(1, available / target) : 1 }}
      >
        {children}
      </div>
    </div>
  )
}
function App() {
  const initialId = new URLSearchParams(location.hash.slice(1)).get('scene')
  const [sceneId, setSceneId] = useState(initialId || manifest.scenes[0]!.id)
  const [mode, setMode] = useState(new URLSearchParams(location.search).get('mode') || 'proposed')
  const [dark, setDark] = useState(false)
  const [size, setSize] = useState('wide')
  const [zoom, setZoom] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [query, setQuery] = useState('')
  const [fit, setFit] = useState(true)
  const [reset, setReset] = useState(0)
  const scene = manifest.scenes.find((item) => item.id === sceneId) || manifest.scenes[0]!
  const group = manifest.groups.find((item) => item.id === scene.groupId) || manifest.groups[0]!
  useEffect(() => {
    const change = () =>
      setSceneId(new URLSearchParams(location.hash.slice(1)).get('scene') || manifest.scenes[0]!.id)
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  function go(id: string) {
    window.history.replaceState(null, '', `${location.pathname}${location.search}#scene=${id}`)
    setSceneId(id)
    setReset(0)
  }
  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#00834d',
          fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
          borderRadius: 5,
        },
      }}
    >
      <div
        className={`review-app ${new URLSearchParams(location.search).get('embed') === 'detail' ? 'embedded-detail' : ''} ${dark ? 'dark' : ''} ${reduced ? 'reduced' : ''}`}
      >
        <header className="review-bar">
          <div className="brand">
            <MessageCircle size={19} />
            <strong>对话与 Agent · 交互打磨</strong>
            <span>{manifest.version} · 本地 HTML</span>
            <a
              className="interaction-link"
              href="interactions.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              交互细节 ↗
            </a>
          </div>
          <div className="controls">
            <select
              aria-label="对比模式"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="compare">前后对比</option>
              <option value="current">当前</option>
              <option value="proposed">打磨后</option>
            </select>
            <Btn className={dark ? 'active' : ''} onClick={() => setDark(!dark)}>
              {dark ? '深色' : '浅色'}
            </Btn>
            <select
              aria-label="查看尺寸"
              value={size}
              onChange={(event) => setSize(event.target.value)}
            >
              <option value="wide">可用宽度</option>
              <option value="medium">768px</option>
              <option value="phone">390px</option>
            </select>
            <Btn className={fit ? 'active' : ''} onClick={() => setFit(!fit)}>
              适应窗口
            </Btn>
            <Btn className={zoom ? 'active' : ''} onClick={() => setZoom(!zoom)}>
              宿主 200% 字体
            </Btn>
            <Btn className={reduced ? 'active' : ''} onClick={() => setReduced(!reduced)}>
              减少动态
            </Btn>
            <Btn onClick={() => setReset(reset + 1)}>重置状态</Btn>
          </div>
        </header>
        <div className="review-layout">
          <nav className="catalog" aria-label="场景目录">
            <input
              aria-label="筛选场景"
              placeholder="搜索模块、控件、状态…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="catalog-list">
              {manifest.groups
                .filter((item) =>
                  `${item.id} ${item.title} ${item.stateLabels}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`group ${item.id === scene.groupId ? 'selected' : ''}`}
                    onClick={() => go(item.firstScene)}
                  >
                    <span>
                      {item.id} · {item.trackLabel}
                    </span>
                    <strong>{item.title}</strong>
                  </button>
                ))}
            </div>
            <div className="details">
              {manifest.baselineGroupCount} 个来源分组 · {manifest.baselineStateCount}{' '}
              个来源状态，另有 {manifest.newAttachmentStates} 个新增附件规划状态；合计{' '}
              {manifest.scenes.length} 个可定位状态。数量为覆盖映射，非 GUI 测试数。
              <br />
              接口、工具执行、原生媒体均为本地模拟。
            </div>
          </nav>
          <main className="review-content">
            <div className="scene-heading">
              <span className="scene-id">{scene.id}</span>
              <h1>{group.title}</h1>
            </div>
            <p className="scene-summary">{scene.description}</p>
            {scene.proposedStatus === 'removed' && (
              <div className="review-removal-note">
                提案删除：自定义 mimir.trace 过程在打磨后完全移除。当前列仅供溯源；真实模型
                reasoning 和实际 tool-call 由 AG-UI 事件驱动自定义组件，不由检索事件转换。
              </div>
            )}
            <div className="state-nav" aria-label="当前分组状态">
              {manifest.scenes
                .filter((item) => item.groupId === scene.groupId)
                .map((item) => (
                  <Btn
                    key={item.id}
                    className={item.id === scene.id ? 'active outline' : ''}
                    onClick={() => go(item.id)}
                  >
                    {item.label}
                  </Btn>
                ))}
            </div>
            <div className={`preview-grid ${mode === 'compare' ? 'compare' : ''}`}>
              {(mode === 'compare' ? [false, true] : [mode === 'proposed']).map((after) => (
                <section className="preview-column" key={String(after)}>
                  <div className="column-label">
                    <strong>
                      {after
                        ? '打磨后'
                        : scene.groupId.startsWith('ATT-')
                          ? '当前：未提供通用临时附件'
                          : '当前实现'}
                    </strong>
                    <span>
                      {after
                        ? 'TanStack AI React · Mimir 自定义组件'
                        : scene.groupId.startsWith('ATT-')
                          ? '新增需求，非既有源码状态'
                          : '源码样式 + 真实界面基线'}
                    </span>
                  </div>
                  <FitPreview size={size} fit={fit}>
                    <ChatDemo
                      key={`${scene.id}-${reset}-${after}`}
                      scene={scene}
                      after={after}
                      zoom={zoom}
                      reduced={reduced}
                      dark={dark}
                      narrow={size === 'phone' || size === 'medium'}
                    />
                  </FitPreview>
                </section>
              ))}
            </div>
            <section className="scene-meta">
              <div>
                <strong>当前交互与视觉</strong>
                <p>{scene.current}</p>
              </div>
              <div>
                <strong>本次打磨</strong>
                <p>{scene.proposed}</p>
              </div>
            </section>
            <details className="details">
              <summary>来源、可操作路径与边界</summary>
              <p>{scene.path}</p>
              <p>{scene.boundary}</p>
              {scene.source.map((source) => (
                <div key={source}>
                  <code>{source}</code>
                </div>
              ))}
              <p>
                浅深主题、尺寸、键盘焦点、hover
                和按下状态在顶部统一切换；产品控件与底部“原型控制”分开。后者只模拟请求结算，不属于新增产品入口。
              </p>
            </details>
            <div className="details">
              先审阅这版
              HTML，获得明确认可后才修改产品代码。此稿不接业务接口、不写本地持久化、不冒充真实模型输出或原生能力。主对话只读；Office
              实际修改、保存与原生媒体边界由既有宿主承担。
            </div>
          </main>
        </div>
      </div>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
