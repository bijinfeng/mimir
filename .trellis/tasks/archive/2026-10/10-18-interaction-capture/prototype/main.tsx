import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  FileText,
  Folder,
  Link,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import sceneData from './scenes.json'
import {
  labels,
  partialRows,
  source,
  target,
  views,
  type FileRow,
  type Surface,
  type View,
} from './fixtures'
import './review.css'

const scenes = sceneData.scenes
const defaultId = 'capture.upload.partial-failure'
type Scene = (typeof scenes)[number]
type Side = 'before' | 'after'
function initialScene() {
  const id = new URLSearchParams(location.hash.slice(1)).get('scene')
  return scenes.find((s) => s.id === id) ?? scenes.find((s) => s.id === defaultId)!
}
function Icon({ name, size = 16 }: { name: 'file' | 'folder' | 'link'; size?: number }) {
  const Component = name === 'file' ? FileText : name === 'folder' ? Folder : Link
  return <Component size={size} aria-hidden="true" />
}
function Button({
  children,
  primary = false,
  quiet = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; quiet?: boolean }) {
  return (
    <button
      type="button"
      className={`button ${primary ? 'primary' : ''} ${quiet ? 'quiet' : ''}`}
      {...props}
    >
      {children}
    </button>
  )
}
function Notice({
  children,
  tone = 'info',
}: {
  children: React.ReactNode
  tone?: 'info' | 'success' | 'warning' | 'error'
}) {
  const C = tone === 'success' ? CircleCheck : tone === 'error' ? CircleX : CircleHelp
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <C size={16} aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}
function Pane({
  side,
  scene,
  size,
  zoom,
  reduced,
}: {
  side: Side
  scene: Scene
  size: string
  zoom: boolean
  reduced: boolean
}) {
  const proposed = side === 'after'
  const initial: View =
    scene.id === 'capture.directory.mixed'
      ? {
          ...views['directory.success']!,
          phase: 'partial',
          rows: partialRows.map((r, i) =>
            Object.assign({}, r, { path: i === 1 ? '论文集/附件' : '论文集/2024' }),
          ),
        }
      : scene.id === 'capture.upload.parse-failure'
        ? {
            surface: 'upload',
            phase: 'success',
            rows: [
              {
                name: '损坏的报告.docx',
                format: 'DOCX',
                size: '284 KB',
                state: 'done',
                detail: '原件已保存；可搜索状态见详情',
              },
            ],
          }
        : views[scene.view]!
  const [view, setView] = useState<View>(initial)
  const [value, setValue] = useState(initial.url ?? '')
  const [surface, setSurface] = useState<Surface>(
    !proposed && initial.surface === 'guard' ? 'document' : initial.surface,
  )
  const [chooser, setChooser] = useState(initial.mode === 'chooser')
  const [composing, setComposing] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [menu, setMenu] = useState(false)
  const [guardMode, setGuardMode] = useState(initial.mode ?? 'manual')
  const [busyOriginal, setBusyOriginal] = useState(false)
  const [entryMode, setEntryMode] = useState(initial.entry ?? '展开侧栏')
  const [unsaved, setUnsaved] = useState(false)
  const [attempts, setAttempts] = useState(1)
  const [refreshed, setRefreshed] = useState(false)
  const [dropHover, setDropHover] = useState(initial.mode === 'hover')
  const [noImages, setNoImages] = useState(scene.id === 'capture.stage.success-no-images')
  const modalRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLElement>(null)
  const handoffOrigin = useRef<Surface>(initial.surface === 'guard' ? 'upload' : initial.surface)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const restoreResultFocus = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const submitLock = useRef(false)
  const dialogOpen = surface === 'url' || surface === 'upload' || surface === 'guard'
  const phase = view.phase ?? 'idle'
  const busy = phase === 'busy' || busyOriginal
  const settling =
    proposed &&
    surface === 'url' &&
    (phase === 'success' || phase === 'partial') &&
    view.mode !== 'null-id'
  const locked = busy || settling
  const rows = view.rows ?? []
  const done = rows.filter((r) => r.state === 'done').length
  const failed = rows.filter((r) => r.state === 'failed').length
  const ended = rows.filter((r) => r.state === 'done' || r.state === 'failed').length
  const hasRows = rows.length > 0
  const isLibrary = surface === 'library'
  const showUpload = surface === 'upload' || (isLibrary && hasRows && proposed)
  const valid = source(value, proposed)
  const id = `${side}-url`
  const isGuard = surface === 'guard'
  const guardBusy = guardMode === 'saving'
  const root = !view.folder ? '知识库根' : view.folder

  function changeView(key: string) {
    const next = views[key]
    if (!next) return
    setView(next)
    setValue(next.url ?? '')
    setSurface(next.surface)
    setChooser(next.mode === 'chooser')
    setGuardMode(next.mode ?? 'manual')
    setDropHover(next.mode === 'hover')
    setExplanation('')
    setBusyOriginal(false)
    submitLock.current = false
  }
  function close() {
    if (locked) return
    setSurface('closed')
    setValue('')
    setView((v) => ({ ...v, phase: 'idle', rows: [], error: undefined, failStage: undefined }))
    if (proposed && done > 0) setRefreshed(true)
    setExplanation(hasRows ? '已关闭结果；已保存文件保留在库中。' : '草稿已清空，焦点返回入口。')
    requestAnimationFrame(() =>
      (returnFocusRef.current?.isConnected ? returnFocusRef.current : triggerRef.current)?.focus(),
    )
  }
  function open(
    tab: 'url' | 'upload' = 'url',
    directory = false,
    folder: string | null | undefined = view.folder,
  ) {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSurface(tab)
    setValue('')
    setView({ surface: tab, directory, folder: folder ?? undefined, phase: 'idle' })
    setMenu(false)
    setExplanation('')
    setBusyOriginal(false)
    submitLock.current = false
  }
  function submit() {
    if (!valid || busy || settling || (proposed && (composing || submitLock.current))) return
    submitLock.current = true
    setValue((v) => v.trim())
    setView((v) => ({
      ...v,
      url: value.trim(),
      phase: 'busy',
      error: undefined,
      failStage: undefined,
      stageResults: undefined,
    }))
    setExplanation('模拟单次请求已开始；请使用评审工具返回结果。')
  }
  function switchTab(tab: 'url' | 'upload') {
    if (proposed && locked) return
    if (tab === surface) return
    if (busy && !proposed) {
      setBusyOriginal(true)
      setExplanation('当前源码行为：上传面板被卸载，原请求继续但本地结果丢失；这不是后台恢复。')
    }
    setView((v) => ({
      ...v,
      rows: [],
      surface: tab,
      phase: tab === 'url' && v.url && v.phase === 'busy' ? 'busy' : 'idle',
    }))
    setSurface(tab)
  }
  function selectFixtures(kind = 'mixed') {
    if (busy || settling) {
      setExplanation('本批仍在处理中：模拟重复选择已被拦截，没有创建第二批。')
      return
    }
    const sourceRows =
      kind === 'any'
        ? [
            {
              name: '研究附件.unknown',
              format: 'UNKNOWN',
              size: '1.2 MB',
              state: 'pending' as const,
              detail: '等待上传',
            },
          ]
        : kind === 'directory'
          ? partialRows.map((r, i) =>
              Object.assign({}, r, { path: i === 1 ? '论文集/附件' : '论文集/2024' }),
            )
          : partialRows
    setView((v) => ({
      ...v,
      phase: 'busy',
      rows: sourceRows.map((r, i) =>
        Object.assign({}, r, {
          state: i === 0 ? ('uploading' as const) : ('pending' as const),
          detail: i === 0 ? '上传中…' : '等待上传',
        }),
      ),
    }))
    setChooser(false)
    setExplanation('模拟选择完成即开始，按选择顺序逐个处理。无真实文件、无上传请求。')
  }
  function finishUpload(successOnly = false) {
    setView((v) => ({
      ...v,
      phase: successOnly ? 'success' : 'partial',
      rows: (v.rows?.length ? v.rows : partialRows).map((r, i) =>
        Object.assign({}, r, {
          state: !successOnly && i === 2 ? ('failed' as const) : ('done' as const),
          detail:
            !successOnly && i === 2
              ? '网络连接中断，未能收到上传结果。'
              : r.note
                ? '已提取 2,140 字'
                : i === 1
                  ? '原件已保存；可搜索状态见详情'
                  : '已提取 8,426 字',
        }),
      ),
    }))
    setBusyOriginal(false)
    if (proposed) setRefreshed(true)
  }
  function nextFile() {
    setView((v) => {
      let changed = false
      const next = (v.rows ?? []).map((r) => {
        if (r.state === 'uploading') {
          changed = true
          return Object.assign({}, r, { state: 'done' as const, detail: '已提取 8,426 字' })
        }
        return r
      })
      const pending = next.findIndex((r) => r.state === 'pending')
      if (pending >= 0) next[pending] = { ...next[pending]!, state: 'uploading', detail: '上传中…' }
      return { ...v, rows: next, phase: changed && pending < 0 ? 'success' : 'busy' }
    })
  }
  function handoff() {
    if (view.mode === 'null-id') {
      setExplanation('服务器没有返回文档 ID，无法自动打开；请先检查目标知识库。')
      return
    }
    if (proposed && unsaved) {
      handoffOrigin.current = surface
      setSurface('guard')
      setGuardMode('manual')
      return
    }
    setSurface('document')
    setExplanation(proposed ? '结果交接完成。' : '当前源码没有接入未保存保护；本模拟直接交接。')
    submitLock.current = false
  }
  function dropAgain() {
    if (view.mode === 'disabled') {
      setExplanation('当前范围没有目录目标，整页拖入不会启动批次。')
      return
    }
    if (proposed && busy) {
      setExplanation('本批尚未结束，重复拖入未启动新批次。')
      return
    }
    setAttempts((n) => n + 1)
    setExplanation(
      proposed
        ? '新模拟批次开始。'
        : '当前源码没有整页批次锁：第二个模拟批次也已开始（仅记录次数，不发请求）。',
    )
    if (!hasRows)
      setView((v) => ({
        ...v,
        rows: partialRows.map((r, i) => ({ ...r, state: i === 0 ? 'uploading' : 'pending' })),
        phase: 'busy',
      }))
  }

  useEffect(() => {
    if (!dialogOpen) return
    if (restoreResultFocus.current && surface !== 'guard') {
      restoreResultFocus.current = false
      const resultAction = modalRef.current?.querySelector<HTMLElement>('[data-result-open]')
      if (resultAction) {
        resultAction.focus({ preventScroll: true })
        return
      }
    }
    const focusTarget =
      surface === 'url' && !inputRef.current?.disabled
        ? inputRef.current
        : modalRef.current?.querySelector<HTMLElement>(
            'button:not([disabled]),input:not([disabled])',
          )
    ;(focusTarget ?? modalRef.current)?.focus({ preventScroll: true })
  }, [dialogOpen, surface])

  function continueEditing() {
    restoreResultFocus.current = true
    setSurface(handoffOrigin.current)
    setView((v) => ({
      ...v,
      surface: handoffOrigin.current,
      phase: v.phase ?? 'partial',
      rows: handoffOrigin.current === 'url' ? v.rows : (v.rows ?? partialRows),
    }))
    setExplanation('继续编辑：导入结果与背景文档保留，未重复上传。')
  }

  function onKeys(e: React.KeyboardEvent) {
    if (!dialogOpen) return
    if (e.key === 'Escape') {
      e.preventDefault()
      if (isGuard) {
        if (!guardBusy) {
          continueEditing()
        }
      } else close()
    }
    if (e.key === 'Tab') {
      const focusables = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),summary,[tabindex="0"]',
        ) ?? [],
      ).filter(
        (el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0,
      )
      const first = focusables[0],
        last = focusables.at(-1)
      if (!first) {
        e.preventDefault()
        modalRef.current?.focus()
        return
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
  }

  function renderUploadBody() {
    return (
      <>
        <button
          type="button"
          className={`drop-zone ${proposed && hasRows ? 'compact-drop' : ''}`}
          disabled={busy}
          onClick={() => setChooser(true)}
          onDragOver={(e) => {
            e.preventDefault()
            setExplanation('HTML不接收真实文件。使用评审工具的模拟文件样本。')
          }}
          onDrop={(e) => {
            e.preventDefault()
            setExplanation('真实文件已忽略；此页只提供模拟导入。')
          }}
        >
          <ArrowUpFromLine size={22} aria-hidden="true" />
          <span className="drop-title">
            {proposed && hasRows
              ? busy
                ? '正在处理本批文件'
                : view.directory
                  ? '选择新一批文件夹'
                  : '选择新一批文件'
              : view.directory
                ? '选择一个文件夹'
                : '把文件拖到这里，或点击选择'}
          </span>
          <span className="drop-hint">
            {proposed && hasRows
              ? '新选择将替换当前结果；已保存内容会保留。'
              : view.directory
                ? '保留目录结构，跳过空文件夹'
                : '单个文件不超过 50 MB。Markdown 导入为笔记，其他格式保存原件'}
          </span>
        </button>
        {proposed && busy && (
          <div className="batch-status" role="status">
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
            <span>
              已结束 {ended} / {rows.length} 项
            </span>
            <span className="muted">正在逐个处理</span>
          </div>
        )}
        {hasRows && (
          <div
            className={`file-list ${proposed ? 'stacked' : ''}`}
            aria-label="逐文件上传结果"
            aria-busy={busy}
          >
            {rows.map((row, i) => (
              <FileResult
                key={rowKey(row, i, rows)}
                row={row}
                proposed={proposed}
                index={i}
                folder={view.folder}
              />
            ))}
          </div>
        )}
        {hasRows && !busy && (
          <>
            <Notice tone={failed ? 'warning' : 'success'}>
              <strong>
                {done} 个成功{failed > 0 ? `，${failed} 个失败` : ''}
              </strong>
              {failed > 0 &&
                (!proposed ||
                  !rows.some((r) => r.state === 'failed' && /网络|连接|响应/.test(r.detail))) && (
                  <p>请查看对应文件的原因，处理后可重新选择失败文件上传。</p>
                )}
              {proposed &&
                (phase === 'uncertain' ||
                  rows.some((r) => r.state === 'failed' && /网络|连接|响应/.test(r.detail))) && (
                  <p>未收到响应不代表未保存。请先查看目标知识库，确认后再决定是否重新上传。</p>
                )}
            </Notice>
            <div className="result-actions">
              {done > 0 && !isLibrary && (
                <Button primary onClick={handoff} data-result-open>
                  <span className="clip">打开《{rows.find((r) => r.state === 'done')?.name}》</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Button>
              )}
              <Button
                onClick={() => {
                  setView((v) => ({ ...v, rows: [], phase: 'idle' }))
                  setExplanation('结果已清空；请重新选择文件。系统选择器不会自动打开。')
                }}
              >
                继续上传
              </Button>
            </div>
            {proposed && done > 0 && (
              <div className="muted small">
                {isLibrary
                  ? '知识库、目录与计数已刷新。'
                  : '本批已结束；已保存内容可在目标知识库中查看。'}
              </div>
            )}
          </>
        )}
        {proposed && busy && (
          <div className="muted small">正在处理本批文件，暂时不能切换、关闭或再次选择。</div>
        )}
      </>
    )
  }
  function renderUrlBody() {
    const warn = value.trim() && !valid
    const failedRequest = phase === 'failed' || phase === 'uncertain'
    return (
      <>
        <div className="field">
          <label htmlFor={id}>网页链接</label>
          <div className={`input-shell ${proposed && warn ? 'invalid' : ''}`}>
            <input
              ref={inputRef}
              id={id}
              value={value}
              placeholder="https://example.com/article"
              disabled={busy || settling}
              aria-invalid={proposed ? !!warn : undefined}
              aria-describedby={proposed ? `${id}-hint` : undefined}
              onChange={(e) => setValue(e.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (proposed && e.nativeEvent.isComposing) return
                  submit()
                }
              }}
            />
            {value && !busy && !settling && (
              <button
                className="clear"
                type="button"
                aria-label="清除链接"
                onClick={() => {
                  setValue('')
                  inputRef.current?.focus()
                }}
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </div>
          <div
            id={`${id}-hint`}
            className={`source-hint ${warn ? 'warning-text' : ''}`}
            aria-live={proposed ? 'polite' : undefined}
          >
            {valid ? (
              <>
                <span>
                  识别为 <b>{valid.label}</b>
                </span>
                <span>· {valid.note}</span>
              </>
            ) : value.trim() ? (
              <span>
                {proposed && value.trim().length > 2000
                  ? '链接不能超过 2000 个字符，请缩短后再试。'
                  : proposed
                    ? '请输入完整的 http:// 或 https:// 链接。'
                    : '请输入以 http:// 或 https:// 开头的链接'}
              </span>
            ) : (
              <span>支持网页、公众号文章、GitHub 仓库</span>
            )}
          </div>
        </div>
        {busy &&
          (proposed ? (
            <div className="request-wait" role="status">
              <LoaderCircle className="spin" size={17} aria-hidden="true" />
              <div>
                <strong>正在抓取，等待服务器返回</strong>
                <p>完成后展示阶段结果，暂时不能切换或关闭。</p>
              </div>
            </div>
          ) : (
            <StageResults phase="busy" proposed={false} />
          ))}
        {!busy && (phase === 'success' || phase === 'partial' || view.failStage) && (
          <StageResults
            phase={phase}
            proposed={proposed}
            failStage={view.failStage}
            partial={phase === 'partial'}
            noImages={noImages}
          />
        )}
        {failedRequest && (
          <Notice tone={proposed ? 'error' : 'warning'}>
            <strong>{view.error ?? '抓取失败'}</strong>
            {proposed ? (
              <p>
                {phase === 'uncertain'
                  ? '未收到响应不代表没有保存。请先查看目标知识库，确认后再决定是否重新抓取。'
                  : source(view.url ?? value)?.label === '微信公众号'
                    ? '公众号可能限制抓取。可稍后再试，或在浏览器扩展中收集。'
                    : view.failStage === 'fetch'
                      ? '请检查链接是否可访问，再重新抓取。'
                      : view.failStage === 'extract'
                        ? '未能提取正文，可检查页面内容后重新抓取。'
                        : '请根据原因处理后重新抓取。'}
              </p>
            ) : (
              <p>
                {valid?.label === '微信公众号'
                  ? '公众号可能限制抓取。请稍后重试，或在浏览器扩展中收集。'
                  : view.failStage === 'fetch'
                    ? '未能获取页面。请检查链接是否可访问，然后重试。'
                    : view.failStage === 'extract'
                      ? '页面已获取，但未能提取正文。请稍后重试。'
                      : ''}
              </p>
            )}
          </Notice>
        )}
        {(phase === 'success' || phase === 'partial') && (
          <Notice tone={phase === 'partial' && proposed ? 'warning' : 'success'}>
            <strong>
              {phase === 'partial' && proposed ? '正文已保存，部分阶段失败' : '抓取完成'}
            </strong>
            <p>2,140 字 · {noImages ? '无图片' : '3 张图片（保留原链接）'}</p>
            {proposed && (
              <p>
                {view.mode === 'null-id'
                  ? '未返回文档 ID，请先查看知识库确认结果。'
                  : '即将打开收集的文档…'}
              </p>
            )}
          </Notice>
        )}
      </>
    )
  }

  return (
    <section
      ref={paneRef}
      className={`pane ${side}`}
      data-side={side}
      onKeyDown={(e) => {
        if (e.key === 'F6') {
          e.preventDefault()
          const active = document.activeElement
          const inTools = paneRef.current?.querySelector('.simulation-panel')?.contains(active)
          if (inTools) {
            ;(
              modalRef.current?.querySelector<HTMLElement>(
                'button:not([disabled]),input:not([disabled])',
              ) ?? modalRef.current
            )?.focus()
          } else
            paneRef.current
              ?.querySelector<HTMLElement>('.simulation-panel button, .simulation-panel select')
              ?.focus()
        }
      }}
    >
      <div className="pane-label">
        <strong>{proposed ? '打磨后' : '当前'}</strong>
        <span>{proposed ? '待认可提案' : '依据源码与实拍复现'}</span>
      </div>
      <div
        className={`canvas ${size} ${zoom ? 'text-zoom' : ''} ${reduced ? 'reduced' : ''}`}
        onKeyDown={onKeys}
      >
        <div className="app-shell">
          <div className="app-top">
            <span className="brand">m</span>
            <b>Mimir</b>
            <span className="app-crumb">知识库 / {view.folder ?? '全部文档'}</span>
            <MoreHorizontal size={16} />
          </div>
          <div className="workspace">
            <aside className={`app-nav ${entryMode === '紧凑侧栏' ? 'compact' : ''}`}>
              <div>
                <Search size={15} />
                <span>快速搜索…</span>
              </div>
              <div className="nav-current">
                <Folder size={15} />
                <span>知识库</span>
              </div>
              <div>
                <Plus size={15} />
                <span>新建对话</span>
              </div>
              <button
                className="app-collect"
                aria-label="收集"
                onClick={() => open('url', false, null)}
              >
                <Plus size={15} />
                <span>收集</span>
              </button>
              <small>知识库</small>
              <div>
                <Folder size={15} />
                <span>产品研究</span>
              </div>
              <div>
                <Folder size={15} />
                <span>设计资料</span>
              </div>
            </aside>
            <main className="library">
              <div className="library-head">
                <div>
                  <span className="muted small">
                    {view.mode === 'disabled' ? '标签 / 设计' : '知识库'}
                  </span>
                  <h3>{view.folder?.split(' / ').at(-1) ?? '我的资料'}</h3>
                </div>
                <button
                  ref={triggerRef}
                  className="button"
                  onClick={() => setMenu((v) => !v)}
                  aria-expanded={menu}
                >
                  <Plus size={15} />
                  <span>添加文档</span>
                  <ChevronDown size={14} />
                </button>
              </div>
              {menu && (
                <div className="entry-menu" role="menu">
                  {[
                    ['上传文件', 'upload'],
                    ['上传文件夹', 'directory'],
                    ['网页抓取', 'url'],
                    ['直接编辑', 'edit'],
                  ].map(([name, type]) => (
                    <button
                      key={type}
                      role="menuitem"
                      onClick={() => {
                        if (type === 'edit') {
                          setSurface('document')
                          setMenu(false)
                          setExplanation('直接编辑属于既有笔记创建流程，本模块只模拟宿主交接。')
                        } else
                          open(
                            type === 'url' ? 'url' : 'upload',
                            type === 'directory',
                            view.folder ?? target,
                          )
                      }}
                    >
                      <Icon
                        name={type === 'directory' ? 'folder' : type === 'url' ? 'link' : 'file'}
                      />
                      <span>{name}</span>
                    </button>
                  ))}
                </div>
              )}
              {surface === 'closed' && (
                <div className="entry-content">
                  {entryMode === '命令面板' ? (
                    <div className="palette-entry">
                      <Search size={17} />
                      <span>收集</span>
                      <button
                        className="command-item"
                        disabled={unsaved}
                        onClick={() => open('url', false, null)}
                      >
                        <Plus size={16} />
                        <span>收集链接或文件</span>
                        <ArrowRight size={15} />
                      </button>
                      {unsaved && <span className="small muted">模拟保存中，命令暂不可执行</span>}
                    </div>
                  ) : (
                    <>
                      <div className="empty-icon">
                        <Folder size={26} />
                      </div>
                      <h4>{entryMode === '知识库空状态' ? '还没有文档' : '把有用的资料收进来'}</h4>
                      <p className="muted">
                        {explanation || '链接、笔记与文件，放在同一个知识库。'}
                      </p>
                      <div className="result-actions">
                        <Button
                          primary
                          onClick={() =>
                            open(
                              entryMode === '上传文件' ||
                                entryMode === '上传文件夹' ||
                                entryMode === '知识库空状态'
                                ? 'upload'
                                : 'url',
                              entryMode === '上传文件夹',
                              entryMode === '展开侧栏' ||
                                entryMode === '紧凑侧栏' ||
                                entryMode === '窄屏导航' ||
                                entryMode === '收集'
                                ? null
                                : view.folder,
                            )
                          }
                        >
                          <Plus size={15} />
                          {entryMode === '上传文件夹'
                            ? '上传文件夹'
                            : entryMode === '上传文件' || entryMode === '知识库空状态'
                              ? '上传文件'
                              : entryMode === '知识库添加菜单'
                                ? '网页抓取'
                                : '收集'}
                        </Button>
                        {entryMode === '知识库空状态' && (
                          <Button onClick={() => setSurface('document')}>直接编辑</Button>
                        )}
                      </div>
                    </>
                  )}
                  {refreshed && (
                    <div className="small refreshed">
                      <Check size={14} />
                      库列表、目录与计数已刷新
                    </div>
                  )}
                  {!proposed && scene.id === 'capture.result.close-refresh' && (
                    <div className="small muted">当前查询未主动刷新：已上传文件可能暂未显示</div>
                  )}
                </div>
              )}
              {surface === 'document' ? (
                <div className="document-preview">
                  <Button
                    quiet
                    onClick={() => {
                      setSurface('closed')
                      setExplanation('宿主交接演示结束。')
                    }}
                  >
                    <ArrowLeft size={15} />
                    返回库
                  </Button>
                  <div className="muted small">{view.folder ?? '全部文档'} / 设计系统调研</div>
                  <h2>设计系统调研</h2>
                  <p>收集结果已交给文档宿主。</p>
                  <p className="muted">此处仅模拟打开目标，不加载或编辑真实文档。</p>
                </div>
              ) : (
                surface !== 'closed' && (
                  <div className="library-rows">
                    {['设计系统调研.pdf', '交互模式与可访问性.md', '设计资料汇总'].map(
                      (name, i) => (
                        <div key={name}>
                          <Icon name={i === 2 ? 'folder' : 'file'} />
                          <span>{name}</span>
                          <small>{i === 2 ? '文件夹' : '文档'}</small>
                        </div>
                      ),
                    )}
                  </div>
                )
              )}
              {isLibrary && (
                <>
                  <div
                    className="drop-library-space"
                    onDragOver={(e) => {
                      e.preventDefault()
                      setExplanation('真实拖入已忽略，请使用下方评审工具模拟。')
                    }}
                    onDrop={(e) => e.preventDefault()}
                  >
                    {!hasRows && !dropHover && (
                      <span className="muted">
                        {view.mode === 'disabled'
                          ? '当前范围不支持整页上传'
                          : '可把文件拖到当前知识库'}
                      </span>
                    )}
                  </div>
                  {dropHover && (
                    <div className="library-drop-overlay">
                      <ArrowUpFromLine size={28} />
                      <strong>
                        {proposed ? '松开即上传到当前知识库' : '松开即上传到这个知识库'}
                      </strong>
                      {proposed && <span>{view.folder ?? '知识库根'}</span>}
                    </div>
                  )}
                  {proposed && hasRows && (
                    <div className="integrated-results">
                      <div className="integrated-heading">
                        <strong>文件导入</strong>
                        <span>{root}</span>
                      </div>
                      {renderUploadBody()}
                    </div>
                  )}
                  {!proposed && phase !== 'busy' && hasRows && (
                    <div className="toast-stack">
                      {done > 0 && <Notice tone="success">已收进 {done} 个文件</Notice>}
                      {failed > 0 && <Notice tone="warning">{failed} 个文件没能上传</Notice>}
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        </div>
        {dialogOpen && (
          <div
            className="modal-mask"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !isGuard) close()
            }}
          >
            <div
              ref={modalRef}
              className={`dialog ${isGuard ? 'guard-dialog' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${side}-title`}
              tabIndex={-1}
            >
              <div className="dialog-header">
                <h3 id={`${side}-title`}>
                  {isGuard
                    ? proposed
                      ? '打开文档前保存改动'
                      : '文档已直接打开'
                    : proposed
                      ? '收集内容'
                      : view.folder
                        ? `收进「${view.folder}」`
                        : '收进知识库根'}
                </h3>
                {!locked && !guardBusy && !isGuard && (
                  <button
                    className="icon-button close-button"
                    type="button"
                    aria-label="关闭收集弹窗"
                    onClick={close}
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
              {isGuard ? (
                <>
                  <div className="dialog-body guard-body">
                    {proposed ? (
                      <>
                        <div className="guard-context">
                          <FileText size={18} />
                          <div>
                            <strong>正在编辑的项目笔记</strong>
                            <p>还有未保存的改动</p>
                          </div>
                        </div>
                        <p>打开刚收集的文档前，请先处理当前改动。</p>
                        <p className="muted small">本批导入结果会保留，不需要重新上传。</p>
                        {guardMode === 'office' && (
                          <Notice tone="warning">
                            当前编辑器无法代为保存，请继续编辑并在工具栏中保存。
                          </Notice>
                        )}
                        {guardMode === 'failed' && (
                          <Notice tone="error">
                            <strong>保存失败，请检查连接后重试。</strong>
                            <p>仍停留在原文档，导入结果保留。</p>
                          </Notice>
                        )}
                        {guardMode === 'saving' && (
                          <div className="request-wait">
                            <LoaderCircle className="spin" size={16} />
                            <span>正在保存当前改动…</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <Notice tone="warning">
                          当前收集结果回调没有接入未保存保护，会直接跳转。
                        </Notice>
                        <p className="muted">本侧不伪造现有保护弹窗。点击下方交接查看当前路径。</p>
                      </>
                    )}
                  </div>
                  <div className="dialog-footer guard-actions">
                    {proposed ? (
                      <>
                        <Button disabled={guardBusy} onClick={continueEditing}>
                          继续编辑
                        </Button>
                        {guardMode === 'manual' && (
                          <Button
                            onClick={() => {
                              setSurface('document')
                              setExplanation('已确认丢弃当前手动草稿，再打开导入文档。')
                            }}
                          >
                            丢弃改动
                          </Button>
                        )}
                        {guardMode !== 'office' && (
                          <Button
                            primary
                            disabled={guardBusy}
                            onClick={() => setGuardMode('saving')}
                          >
                            {guardBusy ? (
                              <LoaderCircle className="spin" size={15} />
                            ) : (
                              <ShieldCheck size={15} />
                            )}
                            <span>{guardBusy ? '保存中…' : '保存并离开'}</span>
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button primary onClick={() => setSurface('document')}>
                        模拟直接交接
                        <ArrowRight size={15} />
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {proposed && (
                    <div className="target-line">
                      <Folder size={14} />
                      <span className="muted">收进</span>
                      <span className="target-path">{root}</span>
                    </div>
                  )}
                  <div className="tabs" role="tablist" aria-label="收集方式">
                    {(['url', 'upload'] as const).map((tab, index) => (
                      <button
                        type="button"
                        role="tab"
                        id={`${side}-tab-${tab}`}
                        aria-controls={`${side}-panel`}
                        aria-selected={surface === tab}
                        tabIndex={surface === tab ? 0 : -1}
                        disabled={proposed && locked}
                        key={tab}
                        onClick={() => switchTab(tab)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                            e.preventDefault()
                            const other = index === 0 ? 'upload' : 'url'
                            switchTab(other)
                            requestAnimationFrame(() =>
                              document.getElementById(`${side}-tab-${other}`)?.focus(),
                            )
                          }
                        }}
                      >
                        {tab === 'url' ? '粘贴链接' : '上传文件'}
                      </button>
                    ))}
                  </div>
                  <div
                    id={`${side}-panel`}
                    className="dialog-body"
                    role="tabpanel"
                    aria-labelledby={`${side}-tab-${surface}`}
                  >
                    {showUpload ? renderUploadBody() : renderUrlBody()}
                  </div>
                  <div className="dialog-footer">
                    <Button disabled={locked} onClick={close}>
                      {surface === 'upload' ? '关闭' : '取消'}
                    </Button>
                    {surface === 'url' && (
                      <Button primary disabled={!valid || locked} onClick={submit}>
                        {busy && <LoaderCircle className="spin" size={15} />}
                        <span>{busy ? '抓取中…' : settling ? '正在打开…' : '抓取'}</span>
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="simulation-panel">
        <div className="simulation-label">
          评审工具<span>仅模拟数据，不发请求 · F6 切换到工具</span>
        </div>
        {chooser && (
          <div className="fixture-chooser">
            <strong>模拟文件选择</strong>
            <p>这不是系统文件选择器，不读取本机文件。</p>
            <div className="tool-actions">
              <Button onClick={() => selectFixtures(view.directory ? 'directory' : 'mixed')}>
                {view.directory ? '使用「论文集」样本' : '使用 3 个文件样本'}
              </Button>
              <Button onClick={() => selectFixtures('any')}>未知格式样本</Button>
              <Button
                onClick={() => {
                  setChooser(false)
                  setExplanation('模拟选择已取消，原状态保持不变。')
                }}
              >
                取消选择
              </Button>
            </div>
          </div>
        )}
        <div className="tool-actions">
          {surface === 'closed' && (
            <>
              <label>
                入口形态
                <select value={entryMode} onChange={(e) => setEntryMode(e.target.value)}>
                  {[
                    '展开侧栏',
                    '紧凑侧栏',
                    '窄屏导航',
                    '命令面板',
                    '知识库添加菜单',
                    '上传文件',
                    '上传文件夹',
                    '知识库空状态',
                    '重新打开',
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              {entryMode === '命令面板' && (
                <Button onClick={() => setUnsaved((v) => !v)}>
                  {unsaved ? '解除模拟保存中' : '模拟保存中'}
                </Button>
              )}
            </>
          )}
          {surface === 'url' && (
            <>
              {busy ? (
                <>
                  <Button
                    onClick={() => {
                      submitLock.current = false
                      setView((v) => ({ ...v, phase: 'success' }))
                    }}
                  >
                    模拟返回成功
                  </Button>
                  <Button
                    onClick={() => {
                      submitLock.current = false
                      setView((v) => ({
                        ...v,
                        phase: 'failed',
                        failStage: 'extract',
                        error: '页面中未找到可提取的正文',
                      }))
                    }}
                  >
                    模拟正文失败
                  </Button>
                  <Button
                    onClick={() => {
                      submitLock.current = false
                      setView((v) => ({
                        ...v,
                        phase: 'uncertain',
                        error: '网络连接中断，未收到抓取结果',
                      }))
                    }}
                  >
                    模拟响应丢失
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => {
                      setComposing((v) => !v)
                      setExplanation('仅模拟composition事件保护；OS中文候选未验证。')
                    }}
                  >
                    {composing ? '结束组合输入' : '模拟组合输入中'}
                  </Button>
                  {phase === 'success' || phase === 'partial' ? (
                    <>
                      <Button onClick={handoff}>模拟自动交接</Button>
                      <Button onClick={() => setNoImages((v) => !v)}>
                        {noImages ? '切换为有图结果' : '切换为无图结果'}
                      </Button>
                    </>
                  ) : null}
                  <label className="tool-check">
                    <input
                      type="checkbox"
                      checked={unsaved}
                      onChange={(e) => setUnsaved(e.target.checked)}
                    />
                    背景有未保存改动
                  </label>
                </>
              )}
            </>
          )}
          {(surface === 'upload' || (isLibrary && proposed && hasRows)) && (
            <>
              {busy ? (
                <>
                  <Button onClick={nextFile}>模拟下一项返回</Button>
                  <Button onClick={() => finishUpload()}>模拟整批部分失败</Button>
                  <Button onClick={() => finishUpload(true)}>模拟整批全成功</Button>
                  <Button onClick={() => selectFixtures()}>模拟重复选择</Button>
                </>
              ) : (
                <Button onClick={() => setChooser(true)}>模拟重新选择</Button>
              )}
              <label className="tool-check">
                <input
                  type="checkbox"
                  checked={unsaved}
                  onChange={(e) => setUnsaved(e.target.checked)}
                />
                背景有未保存改动
              </label>
            </>
          )}
          {isLibrary && (
            <>
              <Button
                onClick={() => {
                  if (view.mode === 'disabled') {
                    setExplanation('当前范围没有目录目标，不显示拖入覆盖。')
                    return
                  }
                  setDropHover(true)
                  setExplanation('模拟Files拖入；穿越子元素不会移除覆盖。')
                }}
              >
                模拟 Files 进入
              </Button>
              <Button
                onClick={() => setExplanation('经过子节点：覆盖保持，拖入层级计数没有归零。')}
              >
                经过子节点
              </Button>
              <Button
                onClick={() => {
                  setDropHover(false)
                  setExplanation('整体拖出：覆盖已移除。')
                }}
              >
                拖出页面
              </Button>
              <Button
                onClick={() => {
                  setDropHover(false)
                  dropAgain()
                }}
              >
                模拟松开 / 重复 drop
              </Button>
              <Button
                onClick={() => {
                  changeView('drop.non-files')
                  setExplanation('非 Files 不显示覆盖、不请求。HTML不会重现浏览器默认页面跳转。')
                }}
              >
                非 Files
              </Button>
              <Button onClick={() => changeView('drop.empty')}>空列表</Button>
              <Button onClick={() => changeView('drop.disabled')}>标签范围</Button>
              <Button onClick={() => changeView('drop.idle')}>目录范围</Button>
              {busy && <Button onClick={() => finishUpload()}>模拟整批响应</Button>}
              <Button
                onClick={() =>
                  setExplanation(
                    '整页drop只读扁平FileList，不遍历目录树；要保留目录，请用「添加文档 → 上传文件夹」。',
                  )
                }
              >
                模拟拖入目录边界
              </Button>
            </>
          )}
          {isGuard && (
            <>
              <label>
                保护模式
                <select value={guardMode} onChange={(e) => setGuardMode(e.target.value)}>
                  <option value="manual">手动保存</option>
                  <option value="auto">自动保存</option>
                  <option value="office">Office 无法代存</option>
                  <option value="saving">保存中</option>
                  <option value="failed">保存失败</option>
                </select>
              </label>
              {guardBusy && (
                <>
                  <Button
                    onClick={() => {
                      setSurface('document')
                      setExplanation('模拟保存成功后交接，未重复上传。')
                    }}
                  >
                    模拟保存成功
                  </Button>
                  <Button onClick={() => setGuardMode('failed')}>模拟保存失败</Button>
                </>
              )}
            </>
          )}
          {busyOriginal && (
            <Button
              onClick={() => {
                setBusyOriginal(false)
                setView((v) => ({ ...v, phase: 'idle' }))
                setExplanation('原模拟请求已结束，但卸载的上传队列无法恢复。')
              }}
            >
              原请求结束
            </Button>
          )}
        </div>
        <details className="more-tools">
          <summary>更多数据与边界</summary>
          <div className="tool-actions">
            <label>
              样本
              <select value={scene.view} onChange={(e) => changeView(e.target.value)}>
                {Object.keys(views).map((key) => (
                  <option value={key} key={key}>
                    {labels[key] ?? key}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={() =>
                setExplanation(
                  '目标目录被外部改名/删除：当前API按打开时捕获的路径保存，可能补建旧目录。本轮不新增冲突协调能力。',
                )
              }
            >
              目录被外部改名
            </Button>
            <Button
              onClick={() =>
                setExplanation(
                  '本模块没有持久队列。刷新/退出后不能在界面恢复本批；请求是否已保存须检查知识库。HTML不实际刷新页面。',
                )
              }
            >
              模拟退出边界
            </Button>
            <Button
              onClick={() =>
                setExplanation(
                  '此HTML不能验证webkitdirectory/原生权限。若宿主不支持目录选择，保留现有文件上传入口；不承诺目录树拖入。',
                )
              }
            >
              目录能力边界
            </Button>
            <Button
              onClick={() => {
                setView((v) => ({
                  ...v,
                  rows: [
                    {
                      name: '损坏的报告.docx',
                      format: 'DOCX',
                      size: '284 KB',
                      state: 'done',
                      detail: '原件已保存；可搜索状态见详情',
                    },
                  ],
                  phase: 'success',
                }))
                setExplanation(
                  '解析失败仍保留原件并算成功。具体解析原因需在文档详情查看；不伪造面板已返回parseError。',
                )
              }}
            >
              解析失败原件样本
            </Button>
          </div>
        </details>
        {(explanation || view.message || composing || (isLibrary && attempts > 1)) && (
          <p className="tool-feedback" role="status">
            {composing ? '组合输入模拟中：提案忽略Enter。 ' : ''}
            {explanation || view.message}
            {isLibrary && attempts > 1 ? ` 模拟批次发起计数：${attempts}。` : ''}
          </p>
        )}
        {(phase === 'success' || phase === 'partial') && surface === 'url' && (
          <p className="tool-feedback">
            成功窗口为对比而暂停；真实产品 260ms 后自动打开。上方“模拟自动交接”仅属于评审工具。
          </p>
        )}
      </div>
    </section>
  )
}

function rowKey(row: FileRow, index: number, rows: FileRow[]) {
  return `${row.path ?? ''}/${row.name}/${rows.slice(0, index).filter((r) => r.name === row.name).length}`
}
function FileResult({
  row,
  proposed,
  index,
  folder,
}: {
  row: FileRow
  proposed: boolean
  index: number
  folder?: string
}) {
  const lastDot = row.name.lastIndexOf('.')
  const split = lastDot > 0 && lastDot < row.name.length - 1 ? lastDot : row.name.length
  const C =
    row.state === 'done'
      ? CircleCheck
      : row.state === 'failed'
        ? CircleX
        : row.state === 'uploading'
          ? LoaderCircle
          : null
  const detail =
    proposed && row.note && row.detail.startsWith('原件') ? '笔记已导入，正文为空' : row.detail
  return (
    <div className={`file-row ${row.state}`}>
      <div className="row-icon">
        {C ? (
          <C
            size={15}
            className={row.state === 'uploading' && proposed ? 'spin' : ''}
            aria-hidden="true"
          />
        ) : (
          <span className="pending-dot" />
        )}
      </div>
      <div className="row-main">
        <div className="row-name" title={row.path ? `${row.path}/${row.name}` : row.name}>
          <span className="name-stem">
            {!proposed && row.path ? `${row.path}/` : ''}
            {row.name.slice(0, split)}
          </span>
          <span className="name-extension">{row.name.slice(split)}</span>
        </div>
        {proposed && row.path && (
          <details className="path-detail">
            <summary>
              <Folder size={12} />
              <span>{row.path}</span>
            </summary>
            <div>
              目标：{folder ? `${folder} / ` : ''}
              {row.path}
            </div>
          </details>
        )}
        {proposed && (
          <span className="row-format">
            {row.note ? '笔记 · ' : ''}
            {row.format} · {row.size}
          </span>
        )}
      </div>
      {!proposed && (
        <span className="row-format">
          {row.format} · {row.size}
        </span>
      )}
      <div className="row-detail">
        {proposed && row.detail.length > 100 ? (
          <details>
            <summary>上传失败 · 展开完整原因</summary>
            <p>{row.detail}</p>
          </details>
        ) : (
          <span>
            {row.state === 'pending' ? '等待上传' : row.state === 'uploading' ? '上传中…' : detail}
          </span>
        )}
        {proposed && row.state === 'done' && !row.note && detail.startsWith('原件') && (
          <span className="raw-note">可下载；正文可搜索状态见文档详情</span>
        )}
      </div>
      <span className="sr-only">
        第 {index + 1} 项，
        {row.state === 'done'
          ? '成功'
          : row.state === 'failed'
            ? '失败'
            : row.state === 'uploading'
              ? '上传中'
              : '等待'}
      </span>
    </div>
  )
}
function StageResults({
  phase,
  proposed,
  failStage,
  partial,
  noImages,
}: {
  phase: string
  proposed: boolean
  failStage?: string
  partial?: boolean
  noImages?: boolean
}) {
  const stageKeys = ['fetch', 'extract', 'assets', 'convert']
  const stageLabels = ['获取页面', '提取正文', '处理图片', '整理内容']
  const meta = [
    '320 KB · 1.2 秒',
    '2,140 字',
    noImages ? '无图片' : '3 张（保留原链接）',
    '已统一为 Markdown',
  ]
  return (
    <div
      className="stages"
      aria-label="服务器返回的阶段结果"
      role={proposed ? 'status' : undefined}
    >
      {stageKeys.map((key, i) => {
        const done = phase === 'success' || !!partial
        const failure = key === failStage || !!(partial && i === 2 && proposed)
        const running = phase === 'busy' && i === 0
        const C = failure ? X : done ? Check : running ? LoaderCircle : null
        return (
          <div className={`stage ${failure ? 'failed' : ''}`} key={key}>
            <span className={`stage-dot ${failure ? 'failed' : done ? 'done' : ''}`}>
              {C && <C size={13} aria-hidden="true" />}
            </span>
            <span>{stageLabels[i]}</span>
            <span className="stage-meta">
              {failure
                ? '失败'
                : done
                  ? meta[i]
                  : running
                    ? '处理中…'
                    : proposed
                      ? '未返回状态'
                      : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function App() {
  const [scene, setScene] = useState(initialScene)
  const [mode, setMode] = useState<'compare' | 'before' | 'after'>('compare')
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    initialScene().id === 'capture.layout.themes' ? 'dark' : 'light',
  )
  const [size, setSize] = useState(() =>
    initialScene().id === 'capture.layout.narrow'
      ? 'narrow'
      : initialScene().id === 'capture.layout.low-height'
        ? 'low'
        : 'desktop',
  )
  const [zoom, setZoom] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [filter, setFilter] = useState('')
  const [revision, setRevision] = useState(0)
  const [catalog, setCatalog] = useState(false)
  function select(next: Scene) {
    setScene(next)
    setRevision((n) => n + 1)
    setCatalog(false)
    window.history.replaceState(null, '', `#scene=${next.id}`)
    if (next.id === 'capture.layout.narrow') setSize('narrow')
    if (next.id === 'capture.layout.low-height') setSize('low')
    if (next.id === 'capture.layout.themes') setTheme('dark')
  }
  useEffect(() => {
    function onHash() {
      const id = new URLSearchParams(location.hash.slice(1)).get('scene')
      const next = scenes.find((s) => s.id === id)
      if (next) setScene(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const index = scenes.findIndex((s) => s.id === scene.id)
  const matched = scenes.filter((s) =>
    `${s.id} ${s.title} ${s.current} ${s.proposal}`.toLowerCase().includes(filter.toLowerCase()),
  )
  return (
    <div className={`review ${theme}`}>
      <header className="review-header">
        <div>
          <span className="review-mark">m</span>
          <h1>
            收集与导入<span>交互打磨 · v1</span>
          </h1>
        </div>
        <div className="review-status">待认可 · 仅 HTML 评审</div>
      </header>
      <div className="review-toolbar">
        <button className="button catalog-toggle" onClick={() => setCatalog((v) => !v)}>
          场景目录 <ChevronDown size={14} />
        </button>
        <div className="segmented" aria-label="对比方式">
          {(
            [
              ['compare', '前后对比'],
              ['before', '当前'],
              ['after', '打磨后'],
            ] as const
          ).map(([id, title]) => (
            <button aria-pressed={mode === id} key={id} onClick={() => setMode(id)}>
              {title}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <label>
            外观
            <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <label>
            画布
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="desktop">桌面 · 620×650</option>
              <option value="narrow">窄屏 · 390×844</option>
              <option value="low">低高度 · 844×480</option>
            </select>
          </label>
          <label className="tool-check">
            <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} />
            200% 文字
          </label>
          <label className="tool-check">
            <input
              type="checkbox"
              checked={reduced}
              onChange={(e) => setReduced(e.target.checked)}
            />
            减少动效
          </label>
          <Button onClick={() => setRevision((n) => n + 1)}>重置交互</Button>
        </div>
      </div>
      <div className="review-body">
        <nav className={`catalog ${catalog ? 'open' : ''}`} aria-label="全部交互场景">
          <label className="catalog-search">
            <Search size={14} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="查找状态或 ID"
              aria-label="查找场景"
            />
          </label>
          <p className="catalog-count">9 组 · 91 项覆盖</p>
          {sceneData.groups.map((group) => {
            const entries = matched.filter((s) => s.group === group.id)
            return (
              entries.length > 0 && (
                <div className="catalog-group" key={group.id}>
                  <h2>
                    {group.title}
                    <span>{entries.length}</span>
                  </h2>
                  {entries.map((s) => (
                    <button
                      key={s.id}
                      aria-current={scene.id === s.id ? 'page' : undefined}
                      onClick={() => select(s)}
                    >
                      <span>{s.title}</span>
                      <ChevronRight size={12} />
                    </button>
                  ))}
                </div>
              )
            )
          })}
        </nav>
        <main className="review-main">
          <div className="scene-heading">
            <div>
              <div className="scene-id">{scene.id}</div>
              <h2>{scene.title}</h2>
            </div>
            <div className="scene-step">
              <Button
                quiet
                disabled={index === 0}
                onClick={() => select(scenes[index - 1]!)}
                aria-label="上一个场景"
              >
                <ArrowLeft size={16} />
              </Button>
              <span>
                {index + 1} / {scenes.length}
              </span>
              <Button
                quiet
                disabled={index === scenes.length - 1}
                onClick={() => select(scenes[index + 1]!)}
                aria-label="下一个场景"
              >
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
          <div className="scene-note">
            <strong>体验路径</strong>
            <span>{scene.path}</span>
          </div>
          {mode === 'compare' && (
            <div className="comparison-hint">
              <span>前后画布等宽。横向滚动可查看右侧，或切换单侧完整查看。</span>
              <div>
                <Button quiet onClick={() => setMode('before')}>
                  看当前
                </Button>
                <Button quiet onClick={() => setMode('after')}>
                  看打磨后
                  <ArrowRight size={13} />
                </Button>
              </div>
            </div>
          )}
          <div className="canvas-viewport">
            <div className={`pane-track ${mode} ${size}`}>
              {mode !== 'after' && (
                <Pane
                  key={`before-${scene.id}-${revision}`}
                  side="before"
                  scene={scene}
                  size={size}
                  zoom={zoom}
                  reduced={reduced}
                />
              )}{' '}
              {mode !== 'before' && (
                <Pane
                  key={`after-${scene.id}-${revision}`}
                  side="after"
                  scene={scene}
                  size={size}
                  zoom={zoom}
                  reduced={reduced}
                />
              )}
            </div>
          </div>
          <div className="contract">
            <div>
              <h3>当前依据</h3>
              <p>{scene.current}</p>
            </div>
            <div>
              <h3>本轮提案</h3>
              <p>{scene.proposal}</p>
            </div>
          </div>
          <details className="evidence">
            <summary>
              来源与评审边界 <ChevronDown size={14} />
            </summary>
            <p>
              当前列依据源码与本轮 4
              张实际界面截图复现；其他错误和结果是合同样本，不冒充真实网络结果。原生选择器、OS
              输入法、触屏、读屏播报及 Electron 仍需实施后验证。
            </p>
            <ul>
              {scene.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p>
              无业务
              API、真实上传或外站抓取；不提供取消后台请求、断点恢复、幂等重试或目标目录选择器。此页所有“模拟”操作均为评审工具。
            </p>
          </details>
          <footer className="review-footer">
            相同数据、相同画布对比。新交互仅在“打磨后”展示，尚未写入产品。
          </footer>
        </main>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
