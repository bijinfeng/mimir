import { useEffect, useRef, useState } from 'react'
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Ellipsis,
  ExternalLink,
  FileText,
  Folder,
  Link,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Search,
  Sparkles,
  Tags,
  TriangleAlert,
  X,
} from 'lucide-react'
import manifest from './scenes.json'
import './review.css'

type Scene = (typeof manifest.scenes)[number]
type Phase = 'idle' | 'pending' | 'error' | 'success'
type Panel = 'none' | 'tags' | 'folders' | 'summary' | 'ai-tags'
type Dialog = 'none' | 'guard' | 'rename' | 'move' | 'search' | 'handoff'
const titleText = '让知识保持可连接：从收集到理解'
const longTitle =
  '让知识保持可连接：从收集到理解，以及如何在长时间的阅读与写作之间建立可持续的个人知识工作流'
const paragraphs = [
  '收藏一篇文章很容易，真正困难的是在需要时重新找到它，并且理解它和其他想法之间的联系。知识库的价值，在于这些联系能够随着阅读与写作逐渐生长。',
  '我们把文档看作一个持续积累的空间。来源帮助我们回到事实，大纲帮助我们找到结构，而引用则把一个独立的片段带回它原来的语境。',
  '阅读时，界面应该让出空间。保留稳定的路径与清晰的标题，把整理动作收在需要时可以找到的位置，让正文成为注意力的中心。',
]
const headings = ['从收集开始', '让阅读形成联系', '回到原文的语境', '保留自己的判断']
function Btn({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`btn ${className}`} {...props}>
      {children}
    </button>
  )
}
function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  )
}
const matches = (s: Scene, ...words: string[]) =>
  words.some((w) => `${s.state} ${s.track}`.includes(w))
function initialPhase(s: Scene): Phase {
  return matches(s, 'pending', 'saving', 'loading-mutation', 'busy', 'generating', 'streaming')
    ? 'pending'
    : matches(s, 'error', 'failure', 'failed')
      ? 'error'
      : matches(s, 'success', 'saved', 'complete', 'adopted')
        ? 'success'
        : 'idle'
}
function Reader({
  scene,
  after,
  narrow,
  low,
  mid = false,
}: {
  scene: Scene
  after: boolean
  narrow: boolean
  low: boolean
  mid?: boolean
}) {
  const num = Number(scene.itemId.slice(4))
  const nativeBoundary = num === 74
  const articleHeadings =
    num === 77 && matches(scene, 'long-outline')
      ? Array.from({ length: 28 }, (_, i) => `${i + 1}. ${headings[i % 4]}与持续积累的阅读记录`)
      : headings
  const surface = useRef<HTMLDivElement>(null)
  const origin = useRef<HTMLElement | null>(null)
  const readOnlyRetry = useRef(false)
  const undoing = useRef(false)
  const requestLock = useRef(
    initialPhase(scene) === 'pending' || ([25, 29, 68].includes(num) && matches(scene, 'loading')),
  )
  const composing = useRef(false)
  const scroller = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>(
    [25, 29, 68].includes(num)
      ? matches(scene, 'loading')
        ? 'pending'
        : 'idle'
      : initialPhase(scene),
  )
  const [folderRead, setFolderRead] = useState(
    (num === 29 || num === 68) && matches(scene, 'loading')
      ? 'loading'
      : (num === 29 || num === 68) && matches(scene, 'error')
        ? 'error'
        : 'loaded',
  )
  const [suggestRead, setSuggestRead] = useState(
    num === 25 && matches(scene, 'loading')
      ? 'loading'
      : num === 25 && matches(scene, 'error', 'retry')
        ? 'error'
        : 'loaded',
  )
  const readKind = useRef<'folders' | 'suggestions' | null>(
    (num === 29 || num === 68) && matches(scene, 'loading')
      ? 'folders'
      : num === 25 && matches(scene, 'loading')
        ? 'suggestions'
        : null,
  )
  const [menu, setMenu] = useState(
    ['menu', 'tags', 'folder', 'ai-organize'].includes(scene.track) &&
      !matches(scene, 'closed', 'outside', 'escape', 'action-focus'),
  )
  const [panel, setPanel] = useState<Panel>(
    scene.track === 'tags'
      ? 'tags'
      : scene.track === 'folder'
        ? 'folders'
        : scene.track === 'summary'
          ? 'summary'
          : scene.track === 'ai-tags'
            ? 'ai-tags'
            : 'none',
  )
  const [dialog, setDialog] = useState<Dialog>(
    scene.track === 'guard' &&
      !nativeBoundary &&
      !matches(scene, 'clean', 'continue', 'discard', 'stay', 'leave')
      ? 'guard'
      : scene.track === 'command'
        ? num === 68
          ? 'move'
          : num === 69
            ? 'search'
            : 'rename'
        : 'none',
  )
  const [editing, setEditing] = useState(
    scene.track === 'title' &&
      (after || num !== 12) &&
      ((after &&
        matches(
          scene,
          'blur-draft',
          'draft-retained',
          'write-error',
          'saved-read-error',
          'retry-read',
          'ime-enter',
          'ime-escape',
        )) ||
        !matches(
          scene,
          'rest',
          'idle',
          'hover',
          'focus',
          'readonly',
          'focus-return',
          'success',
          'unchanged',
          'escape',
          'blur',
        )),
  )
  const fixtureTitle =
    num === 58
      ? '研究汇报.pptx'
      : num === 62
        ? '研究资料.docx'
        : num === 63
          ? '年度数据.xlsx'
          : num === 54
            ? `研究资料.${scene.state}`
            : [55, 56].includes(num)
              ? '研究资料原件.docx'
              : num === 45
                ? '知识流转图.png'
                : num === 46
                  ? '访谈录音.mp3'
                  : num === 47
                    ? '产品演示.mp4'
                    : num === 49
                      ? `原样文本.${scene.state === 'json' ? 'json' : scene.state === 'csv' ? 'csv' : 'txt'}`
                      : num === 50
                        ? '研究资料.doc'
                        : num === 51
                          ? '资料归档.zip'
                          : num >= 43 && num <= 53
                            ? '阅读材料.bin'
                            : num === 6 && matches(scene, 'file')
                              ? '研究资料.pdf'
                              : titleText
  const [title, setTitle] = useState(matches(scene, 'long-title') ? longTitle : fixtureTitle)
  const [draft, setDraft] = useState(
    num === 69
      ? matches(scene, 'match') && !matches(scene, 'no-match')
        ? '阅读'
        : matches(scene, 'too-short')
          ? '读'
          : matches(scene, 'no-match')
            ? '不存在的内容'
            : ''
      : matches(scene, 'empty', 'blank')
        ? '   '
        : matches(scene, 'invalid')
          ? '标题/不合法'
          : matches(scene, 'limit-200')
            ? '标题'.repeat(100)
            : matches(scene, 'long', 'overlimit')
              ? longTitle.repeat(4)
              : title,
  )
  const [error, setError] = useState(
    after && matches(scene, 'saved-read-error', 'retry-read', 'refresh-only')
      ? '已保存，刷新失败。重试只读取，不重复写入。'
      : after && matches(scene, 'write-error', 'draft-retained')
        ? '标题未保存，草稿已保留。请重试。'
        : matches(scene, 'invalid', 'empty', 'blank') && scene.track === 'title' && after
          ? '请输入标题'
          : '',
  )
  const tagIntent = useRef<string[] | null>(null)
  const adoptedCandidate = useRef<string | null>(null)
  const [applyingTags, setApplyingTags] = useState(num === 36)
  const [tags, setTags] = useState<string[]>(
    matches(scene, 'no-tags', 'empty')
      ? []
      : matches(scene, '20-tags', 'over-capacity')
        ? Array.from({ length: 20 }, (_, i) => `标签${i + 1}`)
        : matches(scene, 'long-tag')
          ? ['这是一个很长的已有标签名称用于检验换行与菜单宽度', '阅读']
          : ['知识管理', '阅读'],
  )
  const [candidates, setCandidates] = useState(
    matches(scene, 'all-added', 'empty') ? [] : ['工作流', '连接', '写作'],
  )
  const [folder, setFolder] = useState('开始使用 / 阅读与写作')
  const [target, setTarget] = useState('开始使用 / 研究资料')
  const [aiOpen, setAiOpen] = useState(
    (scene.track === 'assistant' ||
      num === 57 ||
      num === 58 ||
      (num === 75 && matches(scene, 'overlay'))) &&
      !matches(
        scene,
        'closed',
        'close',
        'streaming-hidden',
        'tab-hidden',
        'focus-return',
        'disabled',
        'empty-body',
        'document-switch',
      ),
  )
  const [question, setQuestion] = useState(
    num === 57 && matches(scene, 'preset')
      ? '根据本文结构，提出一个更清晰的写作提纲。'
      : num === 58
        ? '请结合这张幻灯片截图，帮我检查内容结构。'
        : matches(scene, 'selection')
          ? '解释这段内容：阅读时，界面应该让出空间。'
          : '',
  )
  const [answer, setAnswer] = useState(
    matches(scene, 'answer', 'citation', 'reopen', 'stream')
      ? '本文围绕收集、阅读与写作，说明如何把独立资料连接成可回溯的知识。'
      : '',
  )
  const [summary, setSummary] = useState(
    num === 77 && matches(scene, 'long-summary')
      ? paragraphs.join('\n').repeat(8)
      : scene.track === 'summary' &&
          matches(scene, 'ready', 'regenerated', 'success', 'result', 'temporary', 'long', 'switch')
        ? paragraphs[1]!
        : '',
  )
  const [highlight, setHighlight] = useState(
    scene.track === 'citation' &&
      !matches(
        scene,
        'no-match',
        'not-found',
        'missing',
        'unsupported',
        'no-highlight-api',
        'short-snippet',
        'timeout',
        'detached-range',
      ),
  )
  const [active, setActive] = useState(0)
  const [notice, setNotice] = useState(
    num === 31 && matches(scene, 'toast', 'undo', 'expired')
      ? matches(scene, 'expired')
        ? '撤销时限已过，当前目录已更新。'
        : '目录已更新 · 可在 8 秒内撤销（评审中手动控制）'
      : num === 21
        ? '本次未能可靠定位原文，保留当前阅读位置。'
        : num === 37
          ? '切换后旧AI结果不会应用到当前文档。'
          : '',
  )
  const [dirty, setDirty] = useState(
    (scene.track === 'guard' && !matches(scene, 'clean', 'auto-saved', 'leave')) ||
      matches(scene, 'dirty', 'unsaved', 'cached'),
  )
  const [revisionMode, setRevisionMode] = useState(matches(scene, 'revision-on'))
  const [bodyRevision, setBodyRevision] = useState(0)
  const [switched, setSwitched] = useState(
    matches(scene, 'new-document', 'late-summary', 'late-tags'),
  )
  const [snapshot, setSnapshot] = useState(
    num === 58 && !matches(scene, 'remove', 'wrong-document', 'stale-target'),
  )
  const [snapshotPreview, setSnapshotPreview] = useState(num === 58 && matches(scene, 'preview'))
  const [left, setLeft] = useState(false)
  const [mediaFailed, setMediaFailed] = useState(
    scene.track === 'media' && matches(scene, 'error', 'broken', 'fallback'),
  )
  const [readError, setReadError] = useState(
    (num === 4 && matches(scene, 'network-error', 'not-found', 'retry-pending')) ||
      (num === 5 && matches(scene, 'refresh-error', 'retry')),
  )
  const isNote =
    !['readonly', 'media', 'file', 'office', 'links'].includes(scene.track) &&
    !matches(scene, 'web', 'wechat', 'github', 'file', 'article', 'readonly') &&
    num !== 58 &&
    num !== 62 &&
    num !== 63 &&
    num !== 38 &&
    num !== 40 &&
    !(num === 39 && !matches(scene, 'note-internal', 'dirty', 'cancel'))
  const isMedia =
    ['media', 'file', 'office'].includes(scene.track) || num === 58 || num === 62 || num === 63
  const noBody = matches(scene, 'no-body', 'empty-body', 'no-text', 'no-extraction')
  const office =
    scene.track === 'office' ||
    num === 58 ||
    num === 62 ||
    num === 63 ||
    matches(scene, 'office', 'docx', 'xlsx', 'pptx', 'html', 'pdf')
  const cannotSave =
    office ||
    (num === 74 && matches(scene, 'desktop-close')) ||
    matches(scene, 'cannot-save', 'canSave-false', 'toolbar-only')
  const autoSave = num === 71 ? false : !cannotSave && !matches(scene, 'manual', 'discard')
  const pending = phase === 'pending'
  const [metadataSaved, setMetadataSaved] = useState(
    (after || scene.track === 'command') &&
      matches(scene, 'saved-read-error', 'retry-read', 'refresh-only'),
  )
  const saveTitle = () => {
    if (requestLock.current || (after && composing.current) || metadataSaved) return
    const next = draft.trim()
    if ((after || scene.track === 'command') && (!next || next.length > 200)) {
      setError(!next ? '请输入标题' : '标题最多 200 个字符')
      return
    }
    if (!after && scene.track === 'title') {
      setEditing(false)
      if (next) begin()
      return
    }
    if (next === title) {
      setEditing(false)
      if (dialog === 'rename') close()
      return
    }
    begin()
  }
  const begin = () => {
    if (requestLock.current) return
    requestLock.current = true
    setPhase('pending')
    setError('')
  }
  const beginRead = (kind: 'folders' | 'suggestions') => {
    if (requestLock.current) return
    readKind.current = kind
    if (kind === 'folders') setFolderRead('loading')
    else setSuggestRead('loading')
    begin()
  }
  const retryMetadataRead = () => {
    if (requestLock.current) return
    readOnlyRetry.current = true
    begin()
    setNotice('仅重试读取，不再次写入元数据（模拟）')
  }
  const mutateTags = (next: string[], candidate?: string) => {
    if (requestLock.current) return
    setApplyingTags(true)
    tagIntent.current = next
    adoptedCandidate.current = candidate ?? null
    if (!after && candidate) setCandidates((c) => c.filter((t) => t !== candidate))
    begin()
  }
  const settle = (ok: boolean) => {
    if (!requestLock.current && phase !== 'pending') return
    requestLock.current = false
    setPhase(ok ? 'success' : 'error')
    if (readKind.current) {
      const kind = readKind.current
      readKind.current = null
      if (kind === 'folders') setFolderRead(ok ? 'loaded' : 'error')
      else setSuggestRead(ok ? 'loaded' : 'error')
      setPhase('idle')
      setError('')
      return
    }
    if (undoing.current) {
      undoing.current = false
      if (ok) {
        setFolder('开始使用 / 阅读与写作')
        setNotice('已撤销目录更新（模拟）')
      } else {
        setNotice('撤销失败，当前目录保留 · 可在 8 秒内撤销（评审中手动控制）')
      }
      return
    }
    if (!ok) {
      setError(
        readOnlyRetry.current
          ? '标题已保存，刷新仍未完成。请仅重试读取。'
          : '请求未完成，请重试。当前内容与输入已保留。',
      )
      return
    }
    setError('')
    if (readOnlyRetry.current) {
      readOnlyRetry.current = false
      setMetadataSaved(false)
      setEditing(false)
      setNotice('刷新已恢复；没有重复写入')
      if (dialog !== 'none') close()
      return
    }
    if ((editing || dialog === 'rename') && matches(scene, 'saved-read-error', 'retry-read')) {
      setTitle(draft.trim() || title)
      setMetadataSaved(true)
      setPhase('error')
      setError('标题已保存，刷新失败。重试只读取，不会再次重命名。')
      return
    }
    if (editing || dialog === 'rename') {
      setTitle(draft.trim() || title)
      setEditing(false)
      setNotice('标题已保存')
      if (dialog === 'rename') close()
    } else if (dialog === 'guard') {
      setDirty(false)
      setLeft(true)
      close()
    } else if (dialog === 'move' || panel === 'folders') {
      setFolder(target)
      setNotice('目录已更新 · 可在 8 秒内撤销（评审中手动控制）')
      if (dialog === 'move') close()
    } else if (tagIntent.current) {
      setTags(tagIntent.current)
      tagIntent.current = null
      const added = adoptedCandidate.current
      if (added) setCandidates((current) => current.filter((t) => t !== added))
      adoptedCandidate.current = null
      setNotice('标签已保存，正文草稿保留')
    } else if (panel === 'summary') {
      setSummary(paragraphs[1]!)
      setMenu(false)
    } else if (panel === 'ai-tags') {
      setCandidates(['工作流', '连接', '写作'])
      setMenu(false)
    } else if (aiOpen) setAnswer('本文围绕收集、阅读与写作，说明如何把独立资料连接成可回溯的知识。')
    else {
      setReadError(false)
      setNotice('读取已恢复')
    }
  }
  function submitCommand() {
    if (requestLock.current || composing.current) return
    if (dialog === 'rename') {
      saveTitle()
      return
    }
    if (dialog === 'move') {
      if (folderRead !== 'loaded') return
      if (target === folder) {
        close()
        return
      }
      begin()
      return
    }
    if (dialog === 'search') {
      const query = draft.trim()
      if (query.length < 2) {
        setError('至少输入两个字符')
        return
      }
      if (matches(scene, 'no-match') || !paragraphs.join('').includes(query)) {
        setError('未找到匹配内容，查找输入已保留。')
        return
      }
      setHighlight(true)
      jump(2)
      close()
      setNotice('已定位匹配内容（模拟）')
      return
    }
    if (dialog === 'guard' && autoSave && !dirty) {
      setLeft(true)
      close()
      return
    }
    begin()
  }
  function close() {
    if (requestLock.current) return
    setDialog('none')
    setError('')
    requestAnimationFrame(() => {
      if (origin.current?.isConnected) origin.current.focus()
      else surface.current?.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')?.focus()
    })
  }
  function open(kind: Dialog) {
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDialog(kind)
    setPhase('idle')
    requestLock.current = false
    setError('')
    setDraft(title)
  }
  function navigate() {
    if (!after && num === 61) {
      setLeft(true)
      setNotice('当前跨篇助手引用直接导航，未走离开守卫。')
      return
    }
    if (dirty) open('guard')
    else {
      setLeft(true)
      setNotice('已打开关联文档（本地模拟）')
    }
  }
  function jump(index: number) {
    if (num === 18 && matches(scene, 'no-target')) {
      if (after) setNotice('没有找到对应大纲目标，当前阅读位置保留。')
      return
    }
    setActive(index)
    surface.current
      ?.querySelector(`[data-heading="${index}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }
  useEffect(() => {
    if (dialog === 'none') return
    const root = surface.current?.querySelector<HTMLElement>('[role="dialog"]')
    const frame = requestAnimationFrame(() =>
      root?.querySelector<HTMLElement>('input,button:not([disabled])')?.focus(),
    )
    return () => cancelAnimationFrame(frame)
  }, [dialog, surface])
  const trap = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.nativeEvent.isComposing || composing.current) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (!pending) close()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      e.stopPropagation()
    }
    if (e.key !== 'Tab') return
    const list = [
      ...e.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
      ),
    ]
    const first = list[0],
      last = list.at(-1)
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first?.focus()
    }
  }
  const media = () => {
    const image =
      num === 45 ||
      (num === 43 && matches(scene, 'source-viewer')) ||
      matches(scene, 'image', 'heic', 'photo')
    const audio = num === 46 || matches(scene, 'audio')
    const video = num === 47 || matches(scene, 'video')
    const plain =
      num === 49 ||
      (num === 43 && matches(scene, 'body-only')) ||
      matches(scene, 'plain', 'csv', 'json', 'code')
    const missing = num === 52 || matches(scene, 'missing-source', 'no-source', 'missing-original')
    if (office)
      return (
        <div className="editor-boundary">
          <FileText size={32} />
          <h2>
            {title.endsWith('.xlsx')
              ? 'Excel'
              : title.endsWith('.pptx')
                ? 'PowerPoint'
                : matches(scene, 'pdf')
                  ? 'PDF'
                  : matches(scene, 'xlsx')
                    ? 'Excel'
                    : matches(scene, 'pptx')
                      ? 'PowerPoint'
                      : matches(scene, 'html')
                        ? 'HTML'
                        : 'Word'}{' '}
            编辑器宿主
          </h2>
          <p>
            {matches(scene, 'filename-preserved')
              ? '研究资料原件.docx · 保存后保留原文件名'
              : matches(scene, 'loading')
                ? '正在载入原件…'
                : matches(scene, 'load-error')
                  ? '原件载入失败，可重试读取。'
                  : matches(scene, 'save-error')
                    ? '原件保存失败，编辑内容仍保留。'
                    : matches(scene, 'saving')
                      ? '正在工具栏保存原件…'
                      : matches(scene, 'dirty')
                        ? '当前原件有未保存改动'
                        : '原件占满标题栏下方可用区域'}
          </p>
          {matches(scene, 'load-error') && (
            <Btn onClick={() => setNotice('重新读取原件（模拟）')}>重试载入</Btn>
          )}
          <div className="boundary-note">
            沿用现有编辑器。内部工具栏、手动/Agent 编辑及保存由对应格式模块评审。
          </div>
          <Btn
            onClick={() => {
              setDirty(true)
              open('guard')
            }}
          >
            模拟有改动后离开
          </Btn>
        </div>
      )
    if (num === 50)
      return (
        <>
          <div className="prose">
            <h2>阅读与写作记录</h2>
            <p>{paragraphs[0]}</p>
            <p>{paragraphs[1]}</p>
          </div>
          <p className="muted">
            以上文字是从原件里提取的，版式与原件不同（不含字体、页眉页脚与图片位置）。
          </p>
          {matches(scene, 'parse-warning') && (
            <Notice error>提取正文存在警告；已保留可读部分。</Notice>
          )}
        </>
      )
    if (plain)
      return (
        <>
          <pre className="plain">
            {
              '# 这是原样文本，不作为 Markdown 渲染\n名称,类型,状态\n阅读与写作,资料,已保存\n{"source": "original", "text": "保留换行与符号"}'
            }
          </pre>
          <p className="muted">
            {matches(scene, 'extracted', 'doc')
              ? '以上文字是从原件里提取的，版式与原件不同（不含字体、页眉页脚与图片位置）。'
              : '原样文本'}
          </p>
        </>
      )
    if (!missing && !mediaFailed && (image || audio || video))
      return (
        <div className="media-wrap">
          {image ? (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setNotice('原件在新标签打开属于宿主验证；此处不发起真实请求')
              }}
              title="在新标签打开原件（实际大小）"
            >
              <img
                className="sample-image"
                alt="知识流转结构示意：收集、阅读、连接、写作"
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23eef3ef'/%3E%3Cg fill='%23315b43' font-family='sans-serif' font-size='25' text-anchor='middle'%3E%3Ctext x='160' y='110'%3E收集%3C/text%3E%3Ctext x='480' y='110'%3E阅读%3C/text%3E%3Ctext x='480' y='280'%3E连接%3C/text%3E%3Ctext x='160' y='280'%3E写作%3C/text%3E%3C/g%3E%3Cpath d='M230 100H410M480 145V230M410 270H230M160 230V145' stroke='%2385a68f' stroke-width='2' fill='none'/%3E%3C/svg%3E"
              />
            </a>
          ) : audio ? (
            <audio controls aria-label="访谈录音（静态播放器，无音轨）" />
          ) : (
            <video controls aria-label="产品访谈（静态播放器，无视频轨）" />
          )}
          <p className="muted">
            {image
              ? '原件不放大，窄屏按比例收缩。'
              : '浏览器原生播放控件示意；解码、Range、播放进度须宿主实测。'}
          </p>
          <Btn onClick={() => setMediaFailed(true)}>模拟查看器失败</Btn>
        </div>
      )
    return (
      <div className="fallback">
        <TriangleAlert size={25} />
        <div>
          <h2>
            {mediaFailed
              ? '这个浏览器打不开这种格式'
              : matches(scene, 'parse-error')
                ? '提取正文失败：无法读取内容'
                : '这种格式没有在线预览'}
          </h2>
          <p>{missing ? '当前记录没有原件，无法提供下载。' : '原件已经保存，可以下载查看'}</p>
        </div>
        {!missing && (
          <Btn
            className="primary"
            onClick={() => setNotice('下载属于宿主验证；原型不请求真实文件')}
          >
            <Download size={16} />
            下载原件
          </Btn>
        )}
      </div>
    )
  }
  return (
    <div
      className={`surface ${after ? 'after' : 'before'} ${narrow ? 'narrow' : ''} ${low ? 'low' : ''} ${mid ? 'mid' : ''}`}
      data-side={after ? 'proposed' : 'current'}
      ref={surface}
      onPointerDown={(e) => {
        if (!menu) return
        const el = e.target
        if (
          !(el instanceof Element) ||
          el.closest('.organize-menu') ||
          el.closest('[aria-label="更多操作"]')
        )
          return
        setMenu(false)
        if (!el.closest('button,input,textarea,select,a'))
          surface.current?.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')?.focus()
      }}
      onKeyDown={(e) => {
        if (e.key === 'F6') {
          e.preventDefault()
          surface.current?.querySelector<HTMLElement>('.simulation-bar')?.focus()
        }
      }}
    >
      {narrow && (
        <nav className="workspace-rail" aria-label="折叠工作区导航示意">
          <strong>M</strong>
          <FileText size={19} />
          <MessageCircle size={19} />
          <Search size={19} />
        </nav>
      )}
      <div className="reader-shell">
        {!(
          (num === 2 && matches(scene, 'component-empty')) ||
          (num === 3 && !matches(scene, 'resolved')) ||
          (num === 4 && readError)
        ) && (
          <header className="document-header">
            <Btn aria-label="返回知识库" onClick={navigate}>
              <ArrowLeft size={16} />
              <span className="hide-small">返回库</span>
            </Btn>
            {scene.track === 'citation' && <Btn onClick={navigate}>返回对话</Btn>}
            <div className="path" title={title}>
              <span className="folder-path">
                {folder}
                <span className="slash">/</span>
              </span>
              <span>{title}</span>
            </div>
            <div className="header-actions">
              {isNote && (
                <span
                  className={`save-status ${phase === 'error' && !metadataSaved ? 'danger' : ''}`}
                >
                  {pending ? (
                    <LoaderCircle size={13} />
                  ) : phase === 'error' && !metadataSaved ? (
                    <TriangleAlert size={13} />
                  ) : dirty ? (
                    <span className="dot" />
                  ) : (
                    <Check size={13} />
                  )}
                  <span className="hide-small">
                    {metadataSaved
                      ? pending
                        ? '已保存 · 正在刷新…'
                        : '已保存 · 待刷新'
                      : pending
                        ? '保存中…'
                        : phase === 'error'
                          ? '保存失败'
                          : dirty
                            ? '未保存'
                            : '已保存'}
                  </span>
                </span>
              )}
              {isMedia && num !== 52 && !matches(scene, 'no-source', 'missing-source') && (
                <Btn aria-label="下载原件" onClick={() => setNotice('下载原件须宿主验证')}>
                  <Download size={16} />
                </Btn>
              )}
              <Btn
                aria-label="询问这篇文档"
                title={
                  noBody
                    ? '这篇还没有可检索的正文，问答里引用不到它'
                    : '打开文档助手，围绕这篇文档提问'
                }
                disabled={noBody}
                onClick={() => {
                  origin.current = document.activeElement as HTMLElement
                  setAiOpen(!aiOpen)
                }}
              >
                <MessageCircle size={16} />
                <span className="hide-small">问 AI</span>
              </Btn>
              <Btn
                aria-label="更多操作"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setMenu(true)
                  }
                }}
              >
                <Ellipsis size={18} />
              </Btn>
            </div>
          </header>
        )}
        {readError && num === 5 && (
          <Notice error>
            暂时无法刷新文档，已保留当前内容。
            <Btn disabled={pending} onClick={begin}>
              重试刷新
            </Btn>
          </Notice>
        )}
        {notice && (
          <Notice>
            {notice}
            {notice.includes('可在 8 秒') && (
              <Btn
                onClick={() => {
                  setFolder('开始使用 / 阅读与写作')
                  setNotice('已撤销目录更新（模拟）')
                }}
              >
                撤销
              </Btn>
            )}
            <Btn aria-label="关闭反馈" onClick={() => setNotice('')}>
              <X size={13} />
            </Btn>
          </Notice>
        )}
        <div className="reader-content">
          {nativeBoundary && (
            <div className="native-boundary">
              <TriangleAlert size={22} />
              <h2>原生离开确认 · 宿主待验证</h2>
              <p>
                {matches(scene, 'browser-back', 'route-bypass')
                  ? '浏览器Back / 非受控路由当前没有通用阻拦器。本轮不承诺新增全局router blocker。'
                  : matches(scene, 'reload')
                    ? '刷新页面需要浏览器beforeunload核实。'
                    : matches(scene, 'tab-close')
                      ? '关闭标签需要浏览器beforeunload核实。'
                      : '关闭桌面窗口需要Electron宿主核实。'}
              </p>
              <p>当前 beforeunload 的覆盖与真实提示需在浏览器 / Electron 分别验证。</p>
              <Btn onClick={() => setNotice('未触发真实刷新或关闭；保留本页审稿状态')}>
                查看边界说明
              </Btn>
            </div>
          )}
          {menu && (
            <div
              className="organize-menu"
              role="menu"
              aria-label="文档整理"
              onKeyDown={(e) => {
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                  e.preventDefault()
                  const nodes = [
                    ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                      'button:not([disabled])',
                    ),
                  ]
                  const index = nodes.indexOf(document.activeElement as HTMLButtonElement)
                  const next =
                    e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? nodes.length - 1
                        : (index + (e.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length
                  nodes[next]?.focus()
                }
                if (e.key === 'Escape') {
                  setMenu(false)
                  surface.current
                    ?.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')
                    ?.focus()
                }
              }}
            >
              <Btn role="menuitem" onClick={() => setPanel(panel === 'tags' ? 'none' : 'tags')}>
                <Tags size={15} />
                <span>标签</span>
                <small>{tags.length}</small>
                <ChevronRight size={14} />
              </Btn>
              <Btn
                role="menuitem"
                onClick={() => setPanel(panel === 'folders' ? 'none' : 'folders')}
              >
                <Folder size={15} />
                <span>目录</span>
                <ChevronRight size={14} />
              </Btn>
              <div className="menu-sep" />
              <div className="menu-caption">
                AI <span>产生用量</span>
              </div>
              <Btn
                role="menuitem"
                disabled={noBody || pending}
                onClick={() => {
                  setPanel('ai-tags')
                  begin()
                }}
              >
                <Sparkles size={15} />
                AI 建议标签
              </Btn>
              <Btn
                role="menuitem"
                disabled={noBody || pending}
                onClick={() => {
                  setPanel('summary')
                  begin()
                }}
              >
                <FileText size={15} />
                AI 摘要
              </Btn>
              {panel === 'tags' && (
                <div className="submenu">
                  <strong>建议</strong>
                  {num === 25 && suggestRead === 'loading' && <Notice>正在读取建议标签…</Notice>}
                  {num === 25 && suggestRead === 'error' && after && (
                    <Notice error>
                      建议标签读取失败。<Btn onClick={() => beginRead('suggestions')}>重试读取</Btn>
                    </Notice>
                  )}
                  {candidates.map((tag) => (
                    <Btn
                      key={tag}
                      disabled={after && (pending || tags.length >= 20 || suggestRead !== 'loaded')}
                      onClick={() => mutateTags([...tags, tag], tag)}
                    >
                      ＋ {tag}
                    </Btn>
                  ))}
                  <strong>已有</strong>
                  {tags.map((tag) => (
                    <Btn
                      key={tag}
                      disabled={pending}
                      onClick={() => mutateTags(tags.filter((t) => t !== tag))}
                    >
                      － {tag}
                    </Btn>
                  ))}
                  {after && tags.length >= 20 && (
                    <p className="muted">最多可保留 20 个标签，请先移除一个再添加。</p>
                  )}
                  {tags.length > 0 ? (
                    <Btn disabled={pending} onClick={() => mutateTags([])}>
                      清除全部标签
                    </Btn>
                  ) : (
                    <p className="muted">还没有标签</p>
                  )}
                  {num !== 25 && phase === 'error' && (
                    <Notice error>
                      标签未保存，候选与正文草稿保留。<Btn onClick={begin}>重试</Btn>
                    </Notice>
                  )}
                </div>
              )}
              {panel === 'folders' && (
                <div className="submenu">
                  <strong>目录</strong>
                  {num === 29 && folderRead === 'loading' && after && (
                    <Notice>正在读取目录…</Notice>
                  )}
                  {(num === 29 && folderRead === 'error') ||
                  matches(scene, 'folder-error', 'read-error') ? (
                    <Notice error>
                      {after ? '目录加载失败' : '还没有其它目录'}
                      {after && <Btn onClick={() => beginRead('folders')}>重试读取</Btn>}
                    </Notice>
                  ) : matches(scene, 'empty', 'no-folders') ? (
                    <p>还没有其它目录</p>
                  ) : (
                    ['开始使用 / 阅读与写作', '开始使用 / 研究资料', '工作项目 / 设计规范'].map(
                      (path) => (
                        <Btn
                          key={path}
                          disabled={pending || folder === path || folderRead !== 'loaded'}
                          onClick={() => {
                            setTarget(path)
                            begin()
                          }}
                        >
                          {path}
                          {folder === path ? '（当前）' : ''}
                        </Btn>
                      ),
                    )
                  )}
                  <Btn
                    disabled={pending}
                    onClick={() => {
                      setTarget('未归入目录')
                      begin()
                    }}
                  >
                    移出目录
                  </Btn>
                  <p className="muted">
                    {after
                      ? '移出后文档不属于任何知识库或目录，仍可通过搜索或已有标签找到。'
                      : '移出后回到知识库根。'}
                  </p>
                  {num !== 29 && phase === 'error' && (
                    <Notice error>
                      目录未更新，原位置保留。<Btn onClick={begin}>重试</Btn>
                    </Notice>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="read-scroll" ref={scroller}>
            {scene.track === 'entry' && matches(scene, 'library', 'route-library') ? (
              <div className="library-handoff">
                <h1>知识库</h1>
                <p className="muted">沿用第五模块的知识库浏览与文档入口</p>
                <div className="library-row">
                  <FileText size={22} />
                  <strong>{title}</strong>
                  <Btn onClick={() => setNotice('进入文档，保留原scope（模拟）')}>打开阅读</Btn>
                </div>
                <p>无文档 id 时显示库；有 id 时进入详情，不另外新增选择页。</p>
              </div>
            ) : left ? (
              <div className="center">
                <Check size={28} />
                <h2>已离开当前文档</h2>
                <p>仅演示本地导航结果，未写入真实资料。</p>
                <Btn onClick={() => setLeft(false)}>回到阅读</Btn>
              </div>
            ) : scene.track === 'loading' ? (
              <div className="skeleton">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            ) : scene.track === 'empty' ? (
              <div className="center">
                <FileText size={30} />
                <p>选一条开始看</p>
              </div>
            ) : readError && num === 4 ? (
              <div className="center">
                <TriangleAlert size={28} />
                <h2>
                  {after && matches(scene, 'not-found')
                    ? '这篇文档不存在或已被移除'
                    : '文档加载失败'}
                </h2>
                {after && (
                  <>
                    <p>暂时无法读取这篇文档，请重试。</p>
                    <Btn disabled={pending} onClick={begin}>
                      重新加载
                    </Btn>
                    <Btn onClick={() => setLeft(true)}>返回知识库</Btn>
                  </>
                )}
              </div>
            ) : (
              <>
                {isNote && (
                  <div className="editor-handoff" aria-label="笔记编辑器工具栏示意，沿用现有组件">
                    <div className="ribbon-top">
                      <span>保存</span>
                      <span>撤销</span>
                      <span>重做</span>
                      <b>开始</b>
                      <span>插入</span>
                      <span>笔记</span>
                      <span>审阅</span>
                    </div>
                    <div className="ribbon-main">
                      <span>
                        正文 <ChevronDown size={12} />
                        <small>段落样式</small>
                      </span>
                      <span>
                        <b>B</b>　<i>I</i>
                        <small>基础格式</small>
                      </span>
                      <span>
                        U　S　x²　Tₓ<small>其他字形</small>
                      </span>
                      <span>
                        <Link size={14} />
                        <small>链接</small>
                      </span>
                      <span>
                        ≡　列表<small>列表</small>
                      </span>
                      <span>
                        ←　→<small>缩进</small>
                      </span>
                    </div>
                  </div>
                )}
                <div className={`reading-layout ${aiOpen ? 'with-ai' : ''}`}>
                  <main
                    className={`article ${isNote ? 'note-article' : ''} ${isMedia ? 'media-article' : ''}`}
                  >
                    {num === 37 && (
                      <section className="stale-request">
                        <strong>{switched ? '当前：文档 B' : '当前：文档 A'}</strong>
                        <p>摘要与标签只属于发起它的文档。</p>
                        <div className="chips">
                          <Btn disabled={switched || pending} onClick={begin}>
                            在文档 A 发起生成
                          </Btn>
                          <Btn
                            onClick={() => {
                              setSwitched(true)
                              setTitle('文档 B：阅读与写作记录')
                              setSummary('')
                              setCandidates([])
                              setPhase('idle')
                              requestLock.current = false
                            }}
                          >
                            切到文档 B
                          </Btn>
                          <Btn
                            disabled={!switched}
                            onClick={() => setNotice('文档 A 的迟到响应已忽略，未覆盖文档 B。')}
                          >
                            投递文档 A 的旧响应
                          </Btn>
                        </div>
                      </section>
                    )}
                    {num === 18 && matches(scene, 'fenced-heading') && (
                      <pre className="plain">{'```markdown\n# 代码围栏中的标题\n```'}</pre>
                    )}
                    {num === 18 && matches(scene, 'dom-replaced') && (
                      <Btn
                        onClick={() => {
                          setBodyRevision((v) => v + 1)
                          setNotice('正文节点已替换，重新绑定大纲目标（模拟）')
                        }}
                      >
                        模拟正文节点替换
                      </Btn>
                    )}
                    {num === 20 && (
                      <section className="repeat-fixture">
                        <h2>引用定位样本</h2>
                        <p className={matches(scene, 'repeat-first') ? 'citation-highlight' : ''}>
                          阅读时，界面应该让出空间。
                        </p>
                        <p>中间的上下文用于区分相同片段。</p>
                        <p className={matches(scene, 'repeat-later') ? 'citation-highlight' : ''}>
                          阅读时，界面应该让出空间。
                        </p>
                        {matches(scene, 'cross-node') && (
                          <p className="citation-highlight">
                            阅读时，<strong>界面</strong>应该<em>让出空间</em>。
                          </p>
                        )}
                        {matches(scene, 'markdown-noise') && (
                          <pre className="plain">{'**阅读时**，`界面`应该让出空间。'}</pre>
                        )}
                        {matches(scene, 'truncated-snippet') && (
                          <p className="citation-highlight">
                            阅读时，界面应该让出空间。保留稳定的路径与清晰的标题…
                          </p>
                        )}
                      </section>
                    )}
                    {summary && (
                      <section className="ai-result">
                        <div className="result-title">
                          <Sparkles size={14} />
                          AI 摘要 · 当前会话
                          <div />
                          <Btn aria-label="关闭摘要" onClick={() => setSummary('')}>
                            <X size={14} />
                          </Btn>
                        </div>
                        <p>{summary}</p>
                        <span className="muted">不会保存到正文；切换文档后不显示。</span>
                      </section>
                    )}
                    {scene.track === 'ai-tags' && candidates.length > 0 && (
                      <section className="ai-result">
                        <div className="result-title">
                          <Sparkles size={14} />
                          AI 建议的标签（点一下加上）
                        </div>
                        <div className="chips">
                          {candidates.map((t) => (
                            <Btn
                              key={t}
                              disabled={pending}
                              onClick={() => mutateTags([...tags, t], t)}
                            >
                              ＋ {t}
                            </Btn>
                          ))}
                        </div>
                        {phase === 'error' && (
                          <Notice error>
                            添加失败，候选已保留。<Btn onClick={begin}>重试添加</Btn>
                          </Notice>
                        )}
                      </section>
                    )}
                    {scene.track === 'ai-tags' && candidates.length === 0 && (
                      <section className="ai-result">
                        <div className="result-title">AI 建议标签</div>
                        <p>{matches(scene, 'all-added') ? '都加上了' : '本次没有生成标签候选'}</p>
                      </section>
                    )}
                    {matches(scene, 'no-model') &&
                      ['summary', 'ai-tags', 'handoff'].includes(scene.track) && (
                        <Notice error>
                          尚未配置可用模型。
                          <Btn onClick={() => setNotice('交接模型设置；配置完成后返回当前文档')}>
                            前往模型设置
                          </Btn>
                        </Notice>
                      )}
                    {pending && ['summary', 'ai-tags'].includes(panel) && (
                      <Notice>
                        <LoaderCircle size={15} />
                        AI 正在读… 本次调用产生用量
                      </Notice>
                    )}
                    {phase === 'error' &&
                      !applyingTags &&
                      ['summary', 'ai-tags'].includes(panel) && (
                        <Notice error>
                          生成失败，原有正文与结果保留。<Btn onClick={begin}>重新生成</Btn>
                        </Notice>
                      )}
                    {isMedia ? (
                      <>
                        {num === 44 && (
                          <Notice>
                            {matches(scene, 'parse-error')
                              ? '正文提取失败：无法读取内容'
                              : matches(scene, 'planned')
                                ? '这种格式的正文提取将在后续版本支持，所以它暂时搜不到——原件可以正常查看'
                                : matches(scene, 'empty-text')
                                  ? '这个文件里没有可提取的文字，所以它暂时搜不到'
                                  : '原件可以正常查看，提取正文用于检索与引用。'}
                          </Notice>
                        )}
                        {media()}
                      </>
                    ) : (
                      <>
                        {isNote && (
                          <div className="document-title">
                            <div className="title-row">
                              {editing ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault()
                                    saveTitle()
                                  }}
                                >
                                  <input
                                    aria-label="笔记标题"
                                    value={draft}
                                    disabled={pending || metadataSaved}
                                    aria-invalid={!!error}
                                    aria-describedby={
                                      error
                                        ? `title-error-${after ? 'after' : 'before'}`
                                        : undefined
                                    }
                                    onCompositionStart={() => (composing.current = true)}
                                    onCompositionEnd={() => (composing.current = false)}
                                    onChange={(e) => {
                                      setDraft(e.target.value)
                                      setError('')
                                    }}
                                    onKeyDown={(e) => {
                                      if (
                                        after &&
                                        e.key === 'Enter' &&
                                        (e.nativeEvent.isComposing || composing.current)
                                      ) {
                                        e.preventDefault()
                                        return
                                      }
                                      if (
                                        e.key === 'Escape' &&
                                        !pending &&
                                        (!after || !composing.current)
                                      ) {
                                        e.preventDefault()
                                        setEditing(false)
                                        requestAnimationFrame(() =>
                                          surface.current
                                            ?.querySelector<HTMLButtonElement>(
                                              '[aria-label="修改笔记标题"]',
                                            )
                                            ?.focus(),
                                        )
                                      }
                                    }}
                                    onBlur={() => {
                                      if (!after) saveTitle()
                                    }}
                                  />
                                  {after && (
                                    <div className="title-form-actions">
                                      <Btn
                                        disabled={pending}
                                        onClick={() => {
                                          setEditing(false)
                                          setError('')
                                        }}
                                      >
                                        取消
                                      </Btn>
                                      <Btn
                                        className="primary"
                                        disabled={pending || metadataSaved}
                                        onClick={saveTitle}
                                      >
                                        {pending ? '保存中…' : '保存标题'}
                                      </Btn>
                                    </div>
                                  )}
                                  {error && (
                                    <p
                                      id={`title-error-${after ? 'after' : 'before'}`}
                                      className="field-error"
                                      role="alert"
                                    >
                                      {error}
                                      {metadataSaved && (
                                        <Btn disabled={pending} onClick={retryMetadataRead}>
                                          重试刷新
                                        </Btn>
                                      )}
                                    </p>
                                  )}
                                </form>
                              ) : (
                                <>
                                  <h1>{title}</h1>
                                  {isNote && (
                                    <Btn
                                      aria-label="修改笔记标题"
                                      title="修改标题，会同步重命名文件"
                                      onClick={() => {
                                        setDraft(title)
                                        setEditing(true)
                                        setPhase('idle')
                                        requestLock.current = false
                                        requestAnimationFrame(() =>
                                          surface.current
                                            ?.querySelector<HTMLInputElement>(
                                              '[aria-label="笔记标题"]',
                                            )
                                            ?.focus(),
                                        )
                                      }}
                                    >
                                      <Pencil size={16} />
                                    </Btn>
                                  )}
                                </>
                              )}
                            </div>
                            <div className="document-meta">
                              {isNote ? '更新于 10月18日 14:30' : '网页资料 · 10月18日 14:30'}
                              {tags.length > 0 && <span>{tags.join(' · ')}</span>}
                            </div>
                          </div>
                        )}
                        {num === 38 && matches(scene, 'image') && (
                          <img
                            className="inline-image"
                            alt="文档内图片示例"
                            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='560' height='160'%3E%3Crect width='560' height='160' fill='%23e9efeb'/%3E%3Ctext x='280' y='87' text-anchor='middle' font-family='sans-serif' font-size='22' fill='%23496c54'%3E收集 → 阅读 → 连接%3C/text%3E%3C/svg%3E"
                          />
                        )}
                        {num === 38 && matches(scene, 'math') && (
                          <div className="math-sample">
                            E = mc²
                            <br />
                            <small>数学公式渲染示意</small>
                          </div>
                        )}
                        {num === 38 && matches(scene, 'diagram') && (
                          <div className="diagram-sample">
                            {matches(scene, 'diagram-error') ? (
                              <Notice error>
                                图表语法无法解析，已保留原始文本。<pre>graph TD; A--&gt;</pre>
                              </Notice>
                            ) : (
                              <svg
                                viewBox="0 0 500 110"
                                role="img"
                                aria-label="收集到阅读再到连接的流程图"
                              >
                                <g fill="none" stroke="currentColor">
                                  <rect x="10" y="30" width="120" height="45" rx="6" />
                                  <rect x="190" y="30" width="120" height="45" rx="6" />
                                  <rect x="370" y="30" width="120" height="45" rx="6" />
                                  <path d="M130 52H190M310 52H370" />
                                </g>
                                <g fill="currentColor" fontSize="16" textAnchor="middle">
                                  <text x="70" y="58">
                                    收集
                                  </text>
                                  <text x="250" y="58">
                                    阅读
                                  </text>
                                  <text x="430" y="58">
                                    连接
                                  </text>
                                </g>
                              </svg>
                            )}
                          </div>
                        )}
                        {noBody || (num === 38 && matches(scene, 'empty')) ? (
                          <div className="empty-body">
                            <p>还没有可检索的正文</p>
                            <p className="muted">这篇暂时无法用于问答与 AI 整理。</p>
                          </div>
                        ) : (
                          <div className="prose" key={bodyRevision}>
                            {articleHeadings.map((heading, i) => (
                              <section key={heading}>
                                <h2 data-heading={i}>{heading}</h2>
                                <p className={highlight && i === 2 ? 'citation-highlight' : ''}>
                                  {num === 77 && matches(scene, 'long-body')
                                    ? paragraphs[i % 3]!.repeat(12)
                                    : paragraphs[i % 3]}
                                </p>
                                {i === 1 && (
                                  <>
                                    <blockquote>
                                      阅读不是内容的终点，而是知识开始建立联系的地方。
                                    </blockquote>
                                    <ul>
                                      <li>通过来源回到上下文，而不是只保留一个片段。</li>
                                      <li>用自己的话记录理解，把资料连接到正在思考的问题。</li>
                                    </ul>
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>阶段</th>
                                          <th>关注的问题</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        <tr>
                                          <td>收集</td>
                                          <td>这份资料为什么值得保留？</td>
                                        </tr>
                                        <tr>
                                          <td>连接</td>
                                          <td>它和哪些已有想法相关？</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </>
                                )}
                                {i === 3 && (
                                  <pre>
                                    {
                                      'const knowledge = connect(reading, writing)\n// 来源与判断都需要保留'
                                    }
                                  </pre>
                                )}
                              </section>
                            ))}
                          </div>
                        )}
                        {!matches(scene, 'no-links', 'links-empty', 'none') && (
                          <footer className="document-footer">
                            {!(num === 41 && matches(scene, 'backlinks')) && (
                              <div>
                                <span>来源</span>
                                <Btn onClick={navigate}>
                                  <Link size={13} />
                                  关于知识连接的实践笔记
                                </Btn>
                                {after && num === 40 && !matches(scene, 'no-url') && (
                                  <a
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      setNotice('新增前端入口：外部原网页打开须宿主验证')
                                    }}
                                  >
                                    查看原网页
                                    <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                            )}
                            {!(num === 41 && matches(scene, 'sources')) && (
                              <div>
                                <span>被引用</span>
                                <Btn onClick={navigate}>如何形成自己的研究工作流</Btn>
                                {matches(scene, 'long', 'many') &&
                                  Array.from({ length: 10 }, (_, i) => (
                                    <Btn key={i} onClick={navigate}>
                                      阅读与写作记录 {i + 1}
                                    </Btn>
                                  ))}
                              </div>
                            )}
                          </footer>
                        )}
                      </>
                    )}
                  </main>
                  {!narrow &&
                    !mid &&
                    !aiOpen &&
                    !isMedia &&
                    !matches(
                      scene,
                      'one-heading',
                      'no-heading',
                      'source-hidden',
                      'ai-hidden',
                      'narrow-hidden',
                      'outline-hidden',
                    ) && (
                      <aside className="outline">
                        <strong>大纲</strong>
                        {(num === 18 && matches(scene, 'fenced-heading') && !after
                          ? ['代码围栏中的标题（当前误入大纲）', ...articleHeadings]
                          : articleHeadings
                        ).map((h, i) => (
                          <Btn
                            key={h}
                            aria-current={active === i ? 'location' : undefined}
                            className={`${active === i ? 'active' : ''} ${i > 1 && matches(scene, 'deep-level') ? 'deep' : ''}`}
                            onClick={() => jump(i)}
                          >
                            {matches(scene, 'long-heading')
                              ? h + '：在真实的阅读与写作流程之间保持可回溯的知识联系'
                              : h}
                          </Btn>
                        ))}
                      </aside>
                    )}
                </div>
                {(scene.track === 'citation' || scene.track === 'stale-ai') && (
                  <div className="citation-controls">
                    <Btn
                      onClick={() => {
                        setHighlight(true)
                        jump(2)
                      }}
                    >
                      定位本篇引用
                    </Btn>
                    <Btn
                      onClick={() => {
                        setHighlight(false)
                        setNotice('没有找到对应原文，已保留当前阅读位置')
                      }}
                    >
                      模拟引用未命中
                    </Btn>
                  </div>
                )}
              </>
            )}
          </div>
          {aiOpen && (
            <aside className="assistant" aria-label="文档助手">
              <div className="assistant-header">
                <MessageCircle size={15} />
                <strong>文档助手</strong>
                <Btn
                  aria-label="关闭文档助手"
                  onClick={() => {
                    setAiOpen(false)
                    requestAnimationFrame(() =>
                      surface.current
                        ?.querySelector<HTMLButtonElement>('[aria-label="询问这篇文档"]')
                        ?.focus(),
                    )
                  }}
                >
                  <X size={16} />
                </Btn>
              </div>
              <div className="assistant-scope">
                <FileText size={14} />
                <span>{title}</span>
              </div>
              <div className="assistant-messages">
                {[62, 63].includes(num) && (
                  <section className="capability-state">
                    {num === 62 ? (
                      <div className="revision-switch">
                        <span>AI 修订</span>
                        <button
                          type="button"
                          role="switch"
                          aria-label="AI 修订"
                          aria-checked={revisionMode}
                          className={revisionMode ? 'on' : ''}
                          onClick={() => setRevisionMode((v) => !v)}
                        >
                          <span />
                        </button>
                      </div>
                    ) : (
                      <h3>原件 Agent 编辑</h3>
                    )}
                    <p>
                      {num === 62 &&
                      !after &&
                      matches(scene, 'loading', 'ready', 'revision-on', 'revision-off')
                        ? ''
                        : matches(scene, 'loading')
                          ? '正在检测当前文档能力…'
                          : matches(scene, 'revision-off')
                            ? '修订模式已关闭，编辑会直接更新DOCX原件。'
                            : matches(scene, 'revision-on')
                              ? '修订模式已开启，DOCX编辑结果保留待审阅。'
                              : matches(scene, 'executor-unavailable')
                                ? '当前格式未提供可执行编辑工具。'
                                : matches(scene, 'model-unavailable', 'no-model')
                                  ? '尚未配置支持工具调用的模型。'
                                  : matches(scene, 'canvas-unavailable')
                                    ? '原件画布尚未就绪，暂时不能编辑。'
                                    : matches(scene, 'error')
                                      ? '读取编辑能力失败。'
                                      : '当前文档已连接可执行编辑工具。'}
                    </p>
                    {matches(scene, 'error', 'retry') && (
                      <Btn onClick={() => setNotice('重试检测文档能力（模拟）')}>重试检测</Btn>
                    )}
                    {matches(scene, 'model-unavailable', 'no-model') && (
                      <Btn
                        onClick={() => {
                          if (dirty) open('guard')
                          else setNotice('交接模型设置模块')
                        }}
                      >
                        配置模型
                      </Btn>
                    )}
                    {(num !== 62 || after) && (
                      <p className="muted">
                        仅展示当前文档宿主能力状态；DOCX具体工具与Agent执行另模块评审。
                      </p>
                    )}
                  </section>
                )}
                {answer ? (
                  <>
                    <p className="question">{question || '这篇讲了什么？'}</p>
                    <p>{answer}</p>
                    <Btn
                      onClick={() => {
                        setHighlight(true)
                        jump(2)
                      }}
                    >
                      1 · 本篇原文
                    </Btn>
                    <Btn onClick={navigate}>2 · 相关文档引用</Btn>
                  </>
                ) : (
                  <>
                    <h3>围绕这篇文档提问</h3>
                    <p>回答限定在本文，可回到原文查看依据。</p>
                  </>
                )}
                {pending && (
                  <Notice>
                    <LoaderCircle size={15} />
                    正在回答…
                    {num === 65 && (
                      <Btn
                        onClick={() => {
                          requestLock.current = false
                          setPhase('idle')
                          setAnswer('已停止生成，已收到的内容保留。')
                        }}
                      >
                        停止生成
                      </Btn>
                    )}
                  </Notice>
                )}
                {num === 64 && (
                  <section className="assistant-handoff">
                    <strong>设置与笔记交接</strong>
                    <div className="chips">
                      <Btn
                        onClick={() => {
                          if (dirty) open('guard')
                          else setNotice('交接模型设置模块（模拟）')
                        }}
                      >
                        模型设置
                      </Btn>
                      <Btn
                        onClick={() => {
                          if (dirty) open('guard')
                          else setNotice('交接网络搜索设置模块（模拟）')
                        }}
                      >
                        网络搜索设置
                      </Btn>
                      <Btn onClick={navigate}>打开已保存笔记</Btn>
                    </div>
                    <p className="muted">
                      站内导航沿用未保存保护；设置与新笔记内部界面属于对应模块。
                    </p>
                  </section>
                )}
                {num === 65 && (
                  <section className="assistant-handoff">
                    <p className="muted">
                      完整消息、工具与流式交互复用 ChatPanel，由第七模块评审。
                    </p>
                    {matches(scene, 'stop') && (
                      <Btn
                        onClick={() => {
                          requestLock.current = false
                          setPhase('idle')
                          setAnswer('已停止，已有回答保留。')
                        }}
                      >
                        停止生成
                      </Btn>
                    )}
                    {matches(scene, 'saved-note') && <Btn onClick={navigate}>打开已保存笔记</Btn>}
                    {answer && (
                      <Btn
                        onClick={() =>
                          setNotice('保存为笔记交接：需按第七模块确认保存结果（模拟）')
                        }
                      >
                        保存为笔记
                      </Btn>
                    )}
                  </section>
                )}
                {phase === 'error' && (
                  <Notice error>
                    回答未完成，问题与已有内容保留。<Btn onClick={begin}>重试</Btn>
                  </Notice>
                )}
              </div>
              <div className="assistant-compose">
                {num === 58 &&
                  (snapshot ? (
                    <section className="snapshot-draft">
                      <div>
                        <FileText size={18} />
                        <strong>当前幻灯片截图草稿</strong>
                        <Btn aria-label="移除截图草稿" onClick={() => setSnapshot(false)}>
                          <X size={14} />
                        </Btn>
                      </div>
                      <Btn onClick={() => setSnapshotPreview(!snapshotPreview)}>
                        {snapshotPreview ? '收起预览' : '预览截图'}
                      </Btn>
                      {snapshotPreview && (
                        <div className="snapshot-image">
                          <strong>阅读与写作</strong>
                          <p>建立知识之间的联系</p>
                        </div>
                      )}
                      <p>草稿尚未发送。点击发送才提交到当前文档助手。</p>
                    </section>
                  ) : (
                    <Notice>
                      {matches(scene, 'wrong-document', 'stale-target')
                        ? '截图不属于当前文档，已阻止使用。'
                        : '截图草稿已移除。'}
                    </Notice>
                  ))}
                <div className="chips">
                  {['速读本文', '提出要点', '解释细节'].map((q) => (
                    <Btn
                      key={q}
                      disabled={pending}
                      onClick={() => {
                        setQuestion(q)
                        begin()
                      }}
                    >
                      {q}
                    </Btn>
                  ))}
                </div>
                <textarea
                  aria-label="向文档助手提问"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="关于这篇文档，我想问…"
                />
                <div className="composer-bottom">
                  <span>完整对话能力由第七模块评审</span>
                  <Btn
                    className="primary"
                    aria-label="发送问题"
                    disabled={pending || !question.trim()}
                    onClick={begin}
                  >
                    <ArrowUp size={15} />
                  </Btn>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
      <div className="simulation-bar" tabIndex={-1}>
        <span>评审模拟</span>
        <span>
          {pending
            ? '请求等待中'
            : phase === 'error'
              ? '请求失败'
              : phase === 'success'
                ? '请求成功'
                : '未发起请求'}
        </span>
        {pending ? (
          <>
            <Btn onClick={() => settle(true)}>返回成功</Btn>
            <Btn onClick={() => settle(false)}>返回失败</Btn>
          </>
        ) : (
          <Btn
            onClick={() => {
              setPhase('idle')
              setNotice('已重置请求状态')
            }}
          >
            重置请求
          </Btn>
        )}
        {num === 31 && (
          <Btn onClick={() => setNotice('撤销时限已过，当前目录已更新。')}>模拟8秒到期</Btn>
        )}
        <Btn onClick={() => open('rename')}>命令</Btn>
        <Btn onClick={() => open('guard')}>离开保护</Btn>
      </div>
      {dialog !== 'none' && (
        <div className="dialog-mask">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              dialog === 'guard'
                ? '有改动还没保存'
                : dialog === 'rename'
                  ? '重命名笔记'
                  : dialog === 'move'
                    ? '移动文档'
                    : dialog === 'search'
                      ? '查找当前文档'
                      : '能力交接'
            }
            onKeyDown={trap}
          >
            <h2>
              {dialog === 'guard'
                ? '有改动还没保存'
                : dialog === 'rename'
                  ? '重命名笔记'
                  : dialog === 'move'
                    ? '移动文档'
                    : dialog === 'search'
                      ? '查找当前文档'
                      : '能力交接'}
            </h2>
            <div className="dialog-body">
              {dialog === 'guard' ? (
                <>
                  <p className="guard-doc">
                    <FileText size={18} />
                    {title}
                  </p>
                  <p>
                    {cannotSave
                      ? '当前编辑器无法代为保存，请继续编辑并在工具栏中保存。'
                      : autoSave
                        ? dirty
                          ? '笔记正在自动保存。保存完成后才能离开。'
                          : '这次改动已经写入笔记，可以离开。'
                        : '离开前保存改动，或丢弃改动。'}
                  </p>
                  {pending && (
                    <Notice>
                      <LoaderCircle size={15} />
                      正在保存当前改动…
                    </Notice>
                  )}
                </>
              ) : dialog === 'move' ? (
                <>
                  <label htmlFor={after ? 'move-after' : 'move-before'}>目标目录</label>
                  {folderRead === 'loading' ? (
                    <Notice>正在读取目录…</Notice>
                  ) : folderRead === 'error' ? (
                    <Notice error>
                      目录读取失败，原位置保留。
                      <Btn onClick={() => beginRead('folders')}>重试读取</Btn>
                    </Notice>
                  ) : null}
                  <select
                    id={after ? 'move-after' : 'move-before'}
                    disabled={pending || folderRead !== 'loaded'}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    {['开始使用 / 阅读与写作', '开始使用 / 研究资料', '未归入目录'].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label htmlFor={after ? 'command-after' : 'command-before'}>
                    {dialog === 'search' ? '查找内容' : '笔记名称'}
                  </label>
                  <input
                    id={after ? 'command-after' : 'command-before'}
                    autoFocus
                    value={draft}
                    disabled={pending}
                    onCompositionStart={() => (composing.current = true)}
                    onCompositionEnd={() => (composing.current = false)}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !composing.current && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        submitCommand()
                      }
                    }}
                  />
                  <p className="muted">
                    {dialog === 'search'
                      ? '至少输入两个字符，只定位一处，不提供替换。'
                      : '重命名会同步更新文件名。'}
                  </p>
                </>
              )}
              {error && (
                <Notice error>
                  {error}
                  {metadataSaved && (
                    <Btn disabled={pending} onClick={retryMetadataRead}>
                      重试刷新
                    </Btn>
                  )}
                </Notice>
              )}
            </div>
            <footer>
              <Btn disabled={pending} onClick={close}>
                {dialog === 'guard' ? '继续编辑' : '取消'}
              </Btn>
              {dialog === 'guard' ? (
                !autoSave && (
                  <Btn
                    disabled={pending}
                    onClick={() => {
                      setDirty(false)
                      setLeft(true)
                      close()
                    }}
                  >
                    丢弃改动
                  </Btn>
                )
              ) : dialog === 'rename' || dialog === 'search' ? null : (
                <Btn
                  onClick={() => {
                    close()
                    open('search')
                  }}
                  disabled={pending}
                >
                  查找
                </Btn>
              )}
              {dialog === 'guard' && cannotSave && after ? null : (
                <Btn
                  className="primary"
                  disabled={pending || (dialog === 'rename' && metadataSaved)}
                  onClick={() => {
                    if (dialog === 'guard' && cannotSave) {
                      setError('当前编辑器不支持从共享守卫代为保存；仍留在当前文档。')
                      return
                    }
                    submitCommand()
                  }}
                >
                  {pending
                    ? '保存中…'
                    : dialog === 'guard'
                      ? autoSave && !dirty
                        ? '离开'
                        : '保存并离开'
                      : dialog === 'rename'
                        ? '保存名称'
                        : dialog === 'move'
                          ? '移动文档'
                          : '查找'}
                </Btn>
              )}
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
function sizeFor(id: string) {
  return /390|narrow|nav-rail/.test(id)
    ? 'narrow'
    : id.includes('low-height')
      ? 'low'
      : id.includes('mid-column')
        ? 'mid'
        : 'desktop'
}
function Review() {
  const initialId = new URLSearchParams(location.hash.slice(1)).get('scene')
  const [id, setId] = useState(
    initialId && manifest.scenes.some((s) => s.id === initialId) ? initialId : 'DOC-009.idle',
  )
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState(initialId?.endsWith('.dark') ? 'dark' : 'light')
  const [mode, setMode] = useState(new URLSearchParams(location.search).get('mode') || 'after')
  const [size, setSize] = useState(sizeFor(initialId || ''))
  const stageRef = useRef<HTMLElement>(null)
  const [fit, setFit] = useState(true)
  const [availableWidth, setAvailableWidth] = useState(1024)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setAvailableWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const [zoom, setZoom] = useState(false)
  const [reduced, setReduced] = useState(false)
  const scene = manifest.scenes.find((s) => s.id === id)!
  const items = manifest.scenes.filter((s) =>
    `${s.id} ${s.title} ${s.state}`.toLowerCase().includes(query.toLowerCase()),
  )
  const choose = (next: string) => {
    setId(next)
    setSize(sizeFor(next))
    if (next.endsWith('.dark')) setTheme('dark')
    else if (next.endsWith('.light')) setTheme('light')
    window.history.replaceState(null, '', `#scene=${next}`)
  }
  useEffect(() => {
    const update = () => {
      const next = new URLSearchParams(location.hash.slice(1)).get('scene')
      if (next && manifest.scenes.some((s) => s.id === next)) {
        setId(next)
        setSize(sizeFor(next))
        if (next.endsWith('.dark')) setTheme('dark')
        else if (next.endsWith('.light')) setTheme('light')
        setZoom(next.includes('200'))
        setReduced(next.includes('reduced-motion'))
      }
    }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return (
    <div className={`review ${theme} ${zoom ? 'zoom' : ''} ${reduced ? 'reduced' : ''}`}>
      <header className="review-toolbar">
        <div>
          <strong>Mimir · 文档阅读与共享流程</strong>
          <small>第六模块 · 独立 HTML 提案 · 未获实施认可</small>
        </div>
        <nav>
          <select aria-label="对比模式" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="compare">前后对比</option>
            <option value="after">只看打磨后</option>
            <option value="before">只看当前</option>
          </select>
          <select aria-label="画布尺寸" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="desktop">桌面 1024 × 720</option>
            <option value="narrow">窄屏 390 × 844</option>
            <option value="low">低高度 1024 × 480</option>
            <option value="mid">中栏 700 × 720</option>
          </select>
          <Btn onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
            {theme === 'light' ? '深色' : '浅色'}
          </Btn>
          <Btn aria-pressed={fit} onClick={() => setFit(!fit)}>
            适应窗口
          </Btn>
          <Btn aria-pressed={zoom} onClick={() => setZoom(!zoom)}>
            200% 字体
          </Btn>
          <Btn aria-pressed={reduced} onClick={() => setReduced(!reduced)}>
            减少动效
          </Btn>
        </nav>
      </header>
      <div className="review-body">
        <aside className="scene-nav">
          <label>
            <Search size={15} />
            <input
              aria-label="查找场景"
              placeholder="搜索 ID、页面或状态"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <p>
            {manifest.groups} 组 · {manifest.scenes.length} 个枚举状态
          </p>
          {items.map((s) => (
            <button
              type="button"
              key={s.id}
              aria-current={id === s.id ? 'page' : undefined}
              onClick={() => choose(s.id)}
            >
              <small>{s.id}</small>
              <span>{s.title}</span>
              <em>{s.stateLabel}</em>
            </button>
          ))}
        </aside>
        <main className="review-stage" ref={stageRef}>
          <section className="scene-summary">
            <h1>{scene.title}</h1>
            <p>
              {scene.id} · {scene.stateLabel}
            </p>
            <div>
              <strong>当前：</strong>
              {scene.currentBehavior}
            </div>
            <div>
              <strong>打磨后：</strong>
              {scene.proposal}
            </div>
            {scene.proposalState && !scene.currentState && (
              <div className="proposal-only">
                本状态是新增前端提案；当前侧展示现有路径的行为缺口，不声称已具备相同恢复能力。
              </div>
            )}
            <details>
              <summary>源码依据与模拟边界</summary>
              <p>{scene.source.join('；')}</p>
              <p>{scene.boundary}</p>
            </details>
          </section>
          <div
            className={`comparison ${size}`}
            style={{
              zoom: fit
                ? Math.min(
                    1,
                    availableWidth / (size === 'narrow' ? 390 : size === 'mid' ? 700 : 1024),
                  )
                : 1,
            }}
          >
            {mode !== 'after' && (
              <section>
                <div className="side-title">
                  <strong>当前</strong>
                  <span>源码与实际页面的独立重建</span>
                </div>
                <Reader
                  key={`${id}-before-${size}`}
                  scene={scene}
                  after={false}
                  narrow={size === 'narrow'}
                  low={size === 'low'}
                  mid={size === 'mid'}
                />
              </section>
            )}
            {mode !== 'before' && (
              <section>
                <div className="side-title">
                  <strong>打磨后</strong>
                  <span>语雀方向 · 保留既有功能</span>
                </div>
                <Reader
                  key={`${id}-after-${size}`}
                  scene={scene}
                  after={true}
                  narrow={size === 'narrow'}
                  low={size === 'low'}
                  mid={size === 'mid'}
                />
              </section>
            )}
          </div>
          <p className="review-boundary">
            所有业务结果均为本地评审模拟，使用“返回成功 /
            返回失败”控制；未请求API、未修改资料。原生文件、下载、剪贴板、播放器、读屏及 Electron
            需实施后验证。枚举状态数不是浏览器实测次数。
          </p>
        </main>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<Review />)
