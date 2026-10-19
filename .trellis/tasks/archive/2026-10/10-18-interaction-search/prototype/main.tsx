import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  FilePlus,
  FileText,
  Folder,
  FolderInput,
  LibraryBig,
  LoaderCircle,
  Menu,
  MessageCircle,
  Moon,
  PanelLeftClose,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  X,
} from 'lucide-react'
import { fixtures, groups, hitsFor, recipeFor, recentHits } from './fixtures'
import type { Fixture, HostKind, RequestState } from './fixtures'
import './review.css'

const longPath = '个人知识库 / 方法与实践 / 长期学习 / 整理与复习 / 从资料到理解'
type Item = {
  key: string
  title: string
  sub?: string
  path?: string
  kind?: string
  icon: ReactNode
  action: string
}
function Loading({ children }: { children: ReactNode }) {
  return (
    <span className="loading">
      <LoaderCircle size={15} className="spin" />
      {children}
    </span>
  )
}
function Key({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>
}
function App() {
  const initial = new URLSearchParams(location.hash.slice(1)).get('scene')
  const [id, setId] = useState(
    fixtures.some((fixture) => fixture.id === initial) ? initial! : 'search.hits.multi-chunk',
  )
  const [theme, setTheme] = useState('light')
  const [size, setSize] = useState('desktop')
  const [mode, setMode] = useState('compare')
  const [filter, setFilter] = useState('')
  const [showNav, setShowNav] = useState(true)
  const [reset, setReset] = useState(0)
  const fixture = fixtures.find((item) => item.id === id)!
  const group = fixture.group
  const visible = groups.filter(
    (item) =>
      !filter ||
      `${item.title} ${item.id} ${item.states.map((state) => `${state.title} ${state.id}`).join(' ')}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  )
  function select(next: string) {
    setId(next)
    history.replaceState(null, '', `#scene=${encodeURIComponent(next)}`)
    if (next === 'search.layout.dark') setTheme('dark')
    if (
      [
        'search.layout.narrow',
        'search.layout.touch',
        'search.entry.drawer',
        'search.layout.drawer-focus',
      ].includes(next)
    )
      setSize('narrow')
    if (next === 'search.layout.low') setSize('low')
    if (next === 'search.layout.light') {
      setTheme('light')
      setSize('desktop')
    }
  }
  return (
    <div
      className={`review ${theme}`}
      onKeyDownCapture={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'k' &&
          !(event.target as HTMLElement).closest('.canvas')
        ) {
          event.preventDefault()
          document.querySelector<HTMLButtonElement>('[data-main-search]')?.click()
        }
      }}
    >
      <header className="review-header">
        <div className="review-title">
          <button
            className="icon-button"
            aria-label="切换场景目录"
            onClick={() => setShowNav(!showNav)}
          >
            <Menu size={19} />
          </button>
          <div>
            <h1>搜索与命令面板</h1>
            <p>Mimir · 交互精修 / 第三模块</p>
          </div>
        </div>
        <span className="review-status">
          <span />
          v1 · 等待认可
        </span>
      </header>
      <div className="review-tools">
        <div className="segments" aria-label="对比方式">
          {[
            ['compare', '前后对比'],
            ['before', '当前'],
            ['after', '打磨后'],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={mode === value}
              className={mode === value ? 'selected' : ''}
              onClick={() => setMode(value!)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="segments" aria-label="画布尺寸">
          {[
            ['desktop', '桌面'],
            ['narrow', '390px'],
            ['low', '低高度'],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={size === value}
              className={size === value ? 'selected' : ''}
              onClick={() => setSize(value!)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="outline-button theme-control"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          {theme === 'light' ? '切换深色' : '切换浅色'}
        </button>
        <button className="outline-button" onClick={() => setReset(reset + 1)}>
          <RotateCcw size={14} />
          重置交互
        </button>
      </div>
      <div className={`review-layout ${showNav ? '' : 'nav-hidden'}`}>
        {showNav && (
          <nav className="scene-nav" aria-label="模块完整场景目录">
            <label className="nav-search">
              <Search size={15} />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="查找场景或 ID"
                aria-label="查找场景"
              />
            </label>
            <p className="inventory-count">16 个交互分组 · 152 项覆盖</p>
            {visible.map((item) => (
              <section key={item.id}>
                <button
                  className={`group-button ${group.id === item.id ? 'active' : ''}`}
                  onClick={() => select(item.states[0]!.id)}
                >
                  <span>{item.title}</span>
                  <small>{item.states.length}</small>
                </button>
                {(group.id === item.id || filter) && (
                  <div className="scene-items">
                    {item.states
                      .filter(
                        (state) =>
                          !filter ||
                          `${state.id} ${state.title} ${item.title}`
                            .toLowerCase()
                            .includes(filter.toLowerCase()),
                      )
                      .map((state) => (
                        <button
                          key={state.id}
                          className={id === state.id ? 'active' : ''}
                          aria-current={id === state.id ? 'true' : undefined}
                          onClick={() => select(state.id)}
                        >
                          {state.title}
                          <span>{state.id.replace('search.', '')}</span>
                        </button>
                      ))}
                  </div>
                )}
              </section>
            ))}
            {!visible.length && <p>没有匹配的场景</p>}
          </nav>
        )}
        <main className="review-main">
          <div className="scenario-heading">
            <div>
              <h2>{group.title}</h2>
              <p>{fixture.title}</p>
            </div>
            <span className="scenario-id">{id}</span>
          </div>
          <label className="fixture-select">
            当前场景
            <select
              aria-label="选择完整交互状态"
              value={id}
              onChange={(event) => select(event.target.value)}
            >
              {groups.map((item) => (
                <optgroup key={item.id} label={item.title}>
                  {item.states.map((state) => (
                    <option key={state.id} value={state.id}>
                      {state.title} · {state.id}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronsUpDown size={14} />
          </label>
          <div className="change-notes">
            <div>
              <span>当前</span>
              <p>{group.current}</p>
            </div>
            <div>
              <span>打磨后</span>
              <p>{group.proposal}</p>
            </div>
          </div>
          <div className={`comparison ${mode === 'compare' ? 'two' : 'one'} ${size}`}>
            {(mode === 'compare' ? ['before', 'after'] : [mode]).map((side) => (
              <Canvas
                key={`${id}-${side}-${reset}`}
                fixture={fixture}
                proposal={side === 'after'}
                size={size}
              />
            ))}
          </div>
          <div className="review-boundary">
            <ShieldCheck size={17} />
            <p>
              独立交互原型：请求、跳转、输入法候选和保存结果均为模拟，不读取或修改你的知识库。每一处命中保留片段身份；不新增筛选、分页或搜索算法。原生快捷键、权限鉴权和真正文定位，需实施后在宿主验收。
            </p>
          </div>
          <details className="evidence">
            <summary>查看本场景的源码依据与边界</summary>
            <p>{group.exit}</p>
            <ul>
              {group.sources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
            <p>
              该状态已映射到本页直接入口。宿主衔接在画布中演示局部交接；收集完整流程、文档编辑器、AI生成和原生平台不在本轮重设计。
            </p>
          </details>
        </main>
      </div>
    </div>
  )
}

function Canvas({
  fixture,
  proposal,
  size,
}: {
  fixture: Fixture
  proposal: boolean
  size: string
}) {
  const recipe = recipeFor(fixture)
  const suffix = proposal ? 'after' : 'before'
  const group = fixture.group.id.split('.')[1]
  const state = fixture.id.split('.')[2]!
  const directCreatePending = group === 'new-note' && state === 'pending'
  const directCreateFailed = group === 'new-note' && ['failed', 'response-lost'].includes(state)
  const [open, setOpen] = useState(
    recipe.open &&
      !(group === 'new-note' && !proposal && (directCreatePending || directCreateFailed)),
  )
  const [query, setQuery] = useState(proposal ? recipe.query.slice(0, 500) : recipe.query)
  const [request, setRequest] = useState<RequestState>(recipe.request)
  const [recent, setRecent] = useState<RequestState>(recipe.recent)
  const [context, setContext] = useState(recipe.context)
  const [host, setHost] = useState<HostKind>(
    group === 'new-note' && state === 'success' ? 'created' : recipe.host,
  )
  const [hostStage, setHostStage] = useState(recipe.hostState)
  const [draft, setDraft] = useState(
    group === 'find'
      ? ['blank'].includes(state)
        ? ''
        : state === 'one'
          ? '知'
          : '知识'
      : state === 'empty'
        ? '   '
        : group === 'rename' && ['pending', 'error', 'success'].includes(state)
          ? '知识整理的方法（修订）'
          : '知识整理的方法',
  )
  const [folder, setFolder] = useState(
    group === 'move' && ['pending', 'error', 'success', 'undo'].includes(state)
      ? '个人知识库/每周回顾'
      : group === 'move' && state === 'nested'
        ? longPath
        : '个人知识库/方法与实践',
  )
  const [savedTitle, setSavedTitle] = useState('知识整理的方法')
  const [savedFolder, setSavedFolder] = useState('个人知识库/方法与实践')
  const [dirty, setDirty] = useState(recipe.dirty)
  const [busy, setBusy] = useState(
    (directCreatePending && proposal) ||
      (['rename', 'move', 'guard'].includes(group!) && ['pending', 'saving'].includes(state)),
  )
  const [error, setError] = useState(
    directCreateFailed && proposal
      ? state === 'response-lost'
        ? '连接中断，尚不能确认笔记是否已创建。请先回到知识库检查，再决定是否重试。'
        : '新建笔记失败，请稍后重试。'
      : ['error', 'save-failed'].includes(state) && ['rename', 'move', 'guard'].includes(group!)
        ? '暂时无法保存，请保留当前改动后重试。'
        : '',
  )
  const [notice, setNotice] = useState(
    !proposal && directCreateFailed
      ? '新建笔记失败'
      : !proposal && directCreatePending
        ? '正在创建笔记（面板已关闭）'
        : '',
  )
  const [active, setActive] = useState(recipe.active)
  const [activeKey, setActiveKey] = useState<string | null>(
    fixture.id === 'search.selection.list-growth' ? 'new-note' : null,
  )
  const [detail, setDetail] = useState<Item | null>(null)
  const [composition, setComposition] = useState(group === 'input' && state.startsWith('compose'))
  const [drawer, setDrawer] = useState(false)
  const [target, setTarget] = useState<Item | null>(null)
  const [revision, setRevision] = useState(0)
  const [hops, setHops] = useState(0)
  const [undo, setUndo] = useState(false)
  const previousFolder = useRef('个人知识库/方法与实践')
  const canvasRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const paletteRef = useRef<HTMLElement>(null)
  const hostRef = useRef<HTMLElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const busyRef = useRef(busy)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const queryGeneration = useRef(0)
  const operationGeneration = useRef(0)
  const recentGeneration = useRef(0)
  const pendingOperation = useRef<string | null>(
    directCreatePending
      ? 'create'
      : ['rename', 'move', 'guard'].includes(group!) && ['pending', 'saving'].includes(state)
        ? group!
        : null,
  )
  const askItem: Item = { key: 'ask', title: '向 AI 提问', action: 'ask', icon: <Sparkles /> }
  const firstRecentItem: Item = {
    ...recentHits[0]!,
    sub: recentHits[0]!.snippet,
    icon: <FileText />,
    action: 'recent',
  }
  const question = query.trim()
  const searchPending = ['loading', 'retry', 'refresh'].includes(request)
  const readableHits =
    question.length >= 2 &&
    !['empty', 'loading', 'error', 'retry', 'unauthorized'].includes(request)
  const allHits = hitsFor(fixture, query)
  const commandDefinitions: Item[] = [
    { key: 'new-note', title: '新建笔记', icon: <FilePlus size={16} />, action: 'create' },
    {
      key: 'capture',
      title: '收集链接或文件',
      sub: '网页、公众号、GitHub、文件',
      icon: <Upload size={16} />,
      action: 'capture',
    },
    ...(context !== 'none'
      ? [
          ...(context === 'note'
            ? [
                {
                  key: 'rename',
                  title: '重命名当前笔记',
                  icon: <Pencil size={16} />,
                  action: 'rename',
                },
              ]
            : []),
          { key: 'move', title: '移动当前文档', icon: <FolderInput size={16} />, action: 'move' },
          ...(context === 'note'
            ? [{ key: 'find', title: '搜索当前笔记', icon: <Search size={16} />, action: 'find' }]
            : []),
          { key: 'back', title: '返回知识库', icon: <ArrowLeft size={16} />, action: 'back' },
        ]
      : []),
  ]
  const commands = commandDefinitions.filter(
    (item) =>
      !question || `${item.title} ${item.sub ?? ''}`.toLowerCase().includes(question.toLowerCase()),
  )
  let recents = ['empty', 'loading', 'error', 'retry', 'unauthorized'].includes(recent)
    ? []
    : [...recentHits]
  if (recipe.large && !question)
    recents = Array.from({ length: 12 }, (_, index) => ({
      ...recentHits[index % 3]!,
      key: `recent-${index}`,
      title: `${recentHits[index % 3]!.title}${index > 2 ? ` · ${index + 1}` : ''}`,
    }))
  if (recent === 'partial') recents = recents.slice(0, 2)
  if (revision) recents = [recents.at(-1)!, ...recents.slice(0, -1)].filter(Boolean)
  const documents: Item[] = !question
    ? recents.map((hit) =>
        Object.assign({}, hit, {
          sub: hit.snippet,
          icon: <FileText size={16} />,
          action: 'recent',
        }),
      )
    : readableHits
      ? allHits.map((hit) =>
          Object.assign({}, hit, { sub: hit.snippet, icon: <FileText size={16} />, action: 'hit' }),
        )
      : []
  const items = [...documents, ...commands]
  const selected = proposal
    ? Math.max(
        0,
        activeKey
          ? items.findIndex((item) => item.key === activeKey)
          : Math.min(active, items.length - 1),
      )
    : active
  const selectedItem = items[selected]
  function later(callback: () => void, duration = 800) {
    timers.current.push(setTimeout(callback, duration))
  }
  useEffect(() => {
    const activeTimers = timers.current
    return () => activeTimers.forEach(clearTimeout)
  }, [timers])
  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(false), 8000)
    return () => clearTimeout(timer)
  }, [undo])
  useEffect(() => {
    if (!open && host === 'none') return
    const modal = detail ? detailRef.current : hostRef.current
    const focus =
      open && !detail
        ? searchRef.current
        : (modal?.querySelector<HTMLElement>('[data-initial-focus]') ??
          modal?.querySelector<HTMLElement>('input, select, textarea, button'))
    focus?.focus({ preventScroll: true })
  }, [open, host, detail])
  useEffect(() => {
    if (!open || !proposal) return
    canvasRef.current
      ?.querySelector<HTMLElement>(`[data-item-key="${selectedItem?.key}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [open, selectedItem?.key, proposal])
  function setBusyState(value: boolean) {
    busyRef.current = value
    setBusy(value)
  }
  function openPalette() {
    if (host !== 'none' || (proposal && busyRef.current)) return
    previousFocus.current = document.activeElement as HTMLElement
    setOpen(!open)
    if (!open) {
      setQuery('')
      setActive(0)
      setActiveKey(null)
      setRequest('ready')
      setDrawer(false)
      setError('')
    } else returnFocus()
  }
  function returnFocus() {
    later(() => {
      const previous = previousFocus.current
      if (previous?.isConnected && (!proposal || previous.getClientRects().length))
        previous.focus({ preventScroll: true })
      else if (proposal) triggerRef.current?.focus({ preventScroll: true })
    }, 0)
  }
  function closePalette() {
    if (busyRef.current && proposal) return
    setOpen(false)
    setDetail(null)
    returnFocus()
  }
  function retryRecent() {
    if (['loading', 'retry'].includes(recent)) return
    setRecent('retry')
    const marker = ++recentGeneration.current
    later(() => {
      if (marker !== recentGeneration.current) return
      setRecent('ready')
      setNotice('模拟读取已恢复')
    })
  }
  function retrySearch() {
    if (searchPending) return
    setRequest('retry')
    const marker = ++queryGeneration.current
    later(() => {
      if (marker !== queryGeneration.current) return
      setRequest('ready')
      setNotice('模拟检索已恢复')
      if (proposal) {
        setActive(0)
        setActiveKey(null)
      }
    })
  }
  function clearQuery() {
    ++queryGeneration.current
    updateQuery('')
    searchRef.current?.focus()
  }
  function updateQuery(value: string) {
    setQuery(proposal ? value.slice(0, 500) : value)
    setActive(0)
    setActiveKey(null)
    setError('')
    const text = value.trim()
    const marker = ++queryGeneration.current
    if (text.length < 2 || (proposal && composition)) {
      setRequest('ready')
      return
    }
    setRequest('loading')
    // Captured query identity demonstrates isolation; late responses never replace a newer word.
    later(() => {
      if (marker === queryGeneration.current)
        setRequest(text.includes('无匹配') ? 'empty' : 'ready')
    }, 600)
  }
  function selectItem(index: number) {
    setActive(index)
    setActiveKey(items[index]?.key ?? null)
  }
  function begin(item: Item) {
    if (
      proposal &&
      (busyRef.current ||
        (searchPending &&
          ['hit', 'recent', 'create', 'rename', 'move', 'find', 'back'].includes(item.action)))
    )
      return
    const leaves = ['recent', 'hit', 'back', 'create', 'ask'].includes(item.action)
    setTarget(item)
    if (leaves && dirty && (proposal || !['create', 'ask'].includes(item.action))) {
      setOpen(false)
      setHost('guard')
      setHostStage('manual')
      setError('')
      return
    }
    execute(item)
  }
  function execute(item: Item) {
    setDetail(null)
    if (item.action === 'create') {
      if (proposal && busyRef.current) return
      setBusyState(true)
      pendingOperation.current = 'create'
      const marker = ++operationGeneration.current
      if (!proposal) {
        setOpen(false)
        setNotice('正在创建笔记（模拟）')
      } else {
        setHost('none')
        setOpen(true)
        setError('')
      }
      later(() => {
        if (marker !== operationGeneration.current) return
        settleOperation(!['failed', 'response-lost'].includes(state))
      })
      return
    }
    setOpen(false)
    setError('')
    setHops(hops + 1)
    if (['rename', 'move', 'find', 'capture'].includes(item.action)) {
      setHost(item.action as HostKind)
      setHostStage('ready')
      setDraft(item.action === 'find' ? '' : '知识整理的方法')
      return
    }
    if (item.action === 'ask') {
      setHost('chat')
      setNotice('仅预填问题，尚未发送')
      return
    }
    if (item.action === 'back') {
      setHost('none')
      setNotice('已返回个人知识库，保留原目录范围（模拟）')
      returnFocus()
      return
    }
    setHost('document')
    setHostStage(state)
    setNotice(item.action === 'recent' ? '按文档原目录打开（模拟）' : '按所选片段打开文档（模拟）')
  }
  function onCanvasKey(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (proposal && (event.repeat || composition || event.nativeEvent.isComposing)) return
      openPalette()
      return
    }
    if (event.key === 'Escape') {
      if (proposal && (composition || event.nativeEvent.isComposing)) return
      if (host === 'guard' || (proposal && busyRef.current)) {
        event.preventDefault()
        return
      }
      event.preventDefault()
      if (detail) {
        setDetail(null)
        searchRef.current?.focus()
      } else if (open) closePalette()
      else if (host !== 'none') closeHost()
    }
    if (
      event.key === 'Tab' &&
      (open || (host !== 'none' && !['document', 'created', 'chat'].includes(host)))
    ) {
      const dialog = detailRef.current ?? (open ? paletteRef.current : hostRef.current)
      const focusables = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((node) => node.getClientRects().length)
      const first = focusables[0],
        last = focusables.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  }
  function onInputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (proposal && (composition || event.nativeEvent.isComposing || event.keyCode === 229)) return
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      selectItem(
        Math.max(0, Math.min(items.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1))),
      )
      if (!proposal)
        canvasRef.current
          ?.querySelector<HTMLElement>(
            `[data-index="${Math.max(0, Math.min(items.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)))}"]`,
          )
          ?.scrollIntoView({ block: 'nearest' })
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (question.length >= 2 && searchPending) return
      if (selectedItem) begin(selectedItem)
    }
  }
  function closeHost() {
    if (proposal && busyRef.current) return
    setHost('none')
    setError('')
    returnFocus()
  }
  function cancelGuard() {
    if (busyRef.current) return
    setHost('none')
    setError('')
    if (proposal && target) setOpen(true)
    else returnFocus()
  }
  function settleOperation(success: boolean) {
    const operation = pendingOperation.current
    pendingOperation.current = null
    setBusyState(false)
    if (!success) {
      const message =
        operation === 'create'
          ? state === 'response-lost'
            ? '连接中断，创建结果暂时无法确认。请先回知识库检查，重试可能产生另一篇笔记。'
            : '新建笔记失败，输入和当前内容已保留。请重试。'
          : operation === 'guard'
            ? '保存失败，当前改动仍保留。请重试，或继续编辑。'
            : operation === 'rename'
              ? '重命名失败，名称草稿已保留。请重试。'
              : '移动失败，所选目录已保留。请重试。'
      if (proposal || operation === 'guard') {
        setError(message)
        if (operation === 'create') {
          setOpen(true)
          setHost('none')
        }
      } else setNotice(message)
      return
    }
    setError('')
    if (operation === 'guard') {
      setDirty(false)
      setHost('none')
      execute(target ?? firstRecentItem)
      return
    }
    setOpen(false)
    if (operation === 'create') {
      setHost('created')
      setHops(hops + 1)
      setNotice('已新建笔记（模拟），正文末尾获得焦点')
      return
    }
    if (operation === 'rename') setSavedTitle(draft.trim())
    if (operation === 'move') {
      previousFolder.current = savedFolder
      setSavedFolder(folder)
      setUndo(true)
    }
    setHost('document')
    setHostStage('success')
    setNotice(operation === 'move' ? '已移动文档（模拟）' : '已重命名（模拟）')
  }
  function saveGuard() {
    if (busyRef.current) return
    if (!dirty) {
      setHost('none')
      execute(target ?? firstRecentItem)
      return
    }
    if (state === 'office') {
      setError('请先使用文档工具条的“保存”完成原件保存，再离开当前文档。')
      return
    }
    setBusyState(true)
    pendingOperation.current = 'guard'
    const marker = ++operationGeneration.current
    later(() => {
      if (marker === operationGeneration.current) settleOperation(state !== 'save-failed')
    })
  }
  function saveHost() {
    if (proposal && busyRef.current) return
    if (host === 'rename') {
      if (!draft.trim()) {
        if (proposal) setError('请输入笔记名称')
        return
      }
      if (draft === savedTitle) {
        closeHost()
        return
      }
    }
    if (host === 'find') {
      if (draft.trim().length < 2) {
        if (proposal) setError('请输入至少两个字')
        return
      }
      if (state === 'not-found' || draft.includes('无匹配')) {
        if (proposal) setError('当前笔记中没有找到这段文字，请换个词再试。')
        else setNotice('没有找到匹配内容')
        return
      }
      setHost('document')
      setNotice('已定位首个匹配（模拟），真正文定位需产品另验')
      return
    }
    if (host === 'move' && folder === savedFolder) {
      closeHost()
      return
    }
    setBusyState(true)
    setError('')
    pendingOperation.current = host
    const marker = ++operationGeneration.current
    later(() => {
      if (marker === operationGeneration.current) settleOperation(state !== 'error')
    })
  }
  const requestText = !question
    ? ''
    : question.length < 2
      ? '输入至少两个字搜索文档'
      : searchPending
        ? '正在检索…'
        : ['error', 'error-cached'].includes(request)
          ? '搜索失败，请重试'
          : documents.length
            ? `找到 ${documents.length} 处`
            : '没有匹配的文档'
  const isNarrow = size !== 'desktop'
  const hostDialog = ['rename', 'move', 'find', 'capture', 'guard'].includes(host)
  const isLong = query.length >= 500
  function respond(success: boolean) {
    ++operationGeneration.current
    ++queryGeneration.current
    ++recentGeneration.current
    if (busyRef.current || pendingOperation.current) {
      settleOperation(success)
      return
    }
    if (host === 'move' && ['folder-loading', 'folder-error'].includes(hostStage)) {
      setHostStage(success ? 'ready' : 'folder-error')
      return
    }
    if (context === 'loading' || context === 'error') {
      setContext(success ? 'note' : 'error')
      return
    }
    if (!question) setRecent(success ? 'ready' : 'error')
    else {
      setRequest(success ? 'ready' : 'error')
      if (proposal && !activeKey) {
        setActive(0)
        setActiveKey(null)
      }
    }
  }
  function documentPreview() {
    return (
      <article className="host-document">
        <div className="document-toolbar">
          <button
            onClick={() => {
              setHost('none')
              setNotice('已返回知识库（模拟）')
            }}
          >
            <ArrowLeft size={15} />
            返回知识库
          </button>
          <span>{savedFolder.replaceAll('/', ' / ')}</span>
          <button
            className="icon-button"
            aria-label="打开文档操作"
            onClick={() => {
              setContext('note')
              setHost('none')
              setOpen(true)
              setQuery('')
            }}
          >
            <Menu size={16} />
          </button>
        </div>
        <h2>
          {host === 'created' ? (
            <input aria-label="新笔记标题" defaultValue="未命名笔记" />
          ) : savedTitle !== '知识整理的方法' ? (
            savedTitle
          ) : (
            (target?.title ?? savedTitle)
          )}
        </h2>
        {host === 'created' ? (
          <textarea aria-label="新笔记正文" placeholder="开始写下你的想法…" autoFocus />
        ) : state === 'load-error' ? (
          <div className="document-error">
            <CircleAlert size={24} />
            <h3>暂时无法读取文档</h3>
            <p>文档读取界面的细节归文档模块，本页只演示交接。</p>
            <button
              className="outline-button"
              onClick={() => {
                setHostStage('loaded')
                setNotice('模拟文档重新读取完成')
              }}
            >
              重试读取
            </button>
            {hostStage === 'loaded' && <p>模拟读取成功。回到搜索继续查看其他状态。</p>}
          </div>
        ) : (
          <>
            <p>
              知识的价值在于反复使用。收集之后，先写下它和当前问题的关系，再放到合适的知识库中。
            </p>
            <p className={state === 'missing' ? '' : 'citation'}>
              {target?.sub ?? '每周回顾一次自己的笔记，把值得反复使用的方法与例子放在一起。'}
            </p>
            <p>
              这里演示所选片段与文档的交接。重复文本、内容迟到和无高亮 API
              的真正文定位沿用现有实现，需要在产品中另验。
            </p>
            {state === 'missing' && (
              <p className="host-callout">内容可能已变化：只打开文档，不制造错误高亮。</p>
            )}
            {state === 'late-content' && (
              <button
                className="outline-button"
                onClick={() => setNotice('正文到达后触发模拟定位；不代表产品真实150ms重试已通过')}
              >
                模拟正文到达
              </button>
            )}
          </>
        )}
      </article>
    )
  }
  function renderRows(rows: Item[], label: string, offset: number) {
    if (!rows.length) return null
    return (
      <>
        <div className="section-label">{label}</div>
        {rows.map((item, index) => (
          <div className="row-wrap" key={item.key}>
            <button
              type="button"
              data-index={offset + index}
              data-item-key={item.key}
              className={`palette-item ${selected === offset + index ? 'active' : ''} ${item.action === 'hit' ? 'hit-item' : ''}`}
              aria-current={selected === offset + index ? 'true' : undefined}
              disabled={proposal && (busy || (searchPending && item.action !== 'capture'))}
              onMouseEnter={() => selectItem(offset + index)}
              onFocus={proposal ? () => selectItem(offset + index) : undefined}
              onClick={() => begin(item)}
              title={proposal ? `${item.title}${item.path ? `\n${item.path}` : ''}` : undefined}
            >
              <span className="item-icon">{item.icon}</span>
              <span className="item-main">
                <span className="item-title">{item.title}</span>
                {item.sub && <span className="item-sub">{item.sub}</span>}
                {proposal && item.action === 'hit' && (
                  <span className="item-path">
                    <Folder size={11} />
                    {item.path ? item.path.replaceAll('/', ' / ') : '知识库根'}
                  </span>
                )}
              </span>
              {proposal && selected === offset + index && (
                <span className="row-enter">
                  <ArrowRight size={13} />
                </span>
              )}
            </button>
            {proposal && ['hit', 'recent'].includes(item.action) && (
              <button
                className="row-detail"
                aria-label={`查看完整信息：${item.title}`}
                onClick={() => setDetail(item)}
                title="查看完整标题与片段"
              >
                <ChevronDown size={14} />
              </button>
            )}
          </div>
        ))}
      </>
    )
  }
  return (
    <section className={`comparison-side ${proposal ? 'proposal' : 'baseline'}`}>
      <header className="side-heading">
        <div>
          <span className="side-dot" />
          <strong>{proposal ? '打磨后' : '当前'}</strong>
          <span>{proposal ? '交互提案' : '源码与实拍基线'}</span>
        </div>
        <small>
          {size === 'desktop'
            ? '桌面自适应 · 面板最大620px'
            : size === 'low'
              ? '390 × 500'
              : '390 × 844'}
        </small>
      </header>
      <div
        className={`canvas ${isNarrow ? 'narrow' : ''} ${size === 'low' ? 'low' : ''} ${proposal ? 'polished' : ''}`}
        ref={canvasRef}
        onKeyDown={onCanvasKey}
        tabIndex={-1}
      >
        <div
          className={`product-background ${isNarrow || ['rail', 'focus-missing'].includes(state) ? 'rail' : ''}`}
          inert={open || hostDialog || detail ? true : undefined}
        >
          <aside className="product-sidebar">
            <div className="brand">
              <span className="brand-symbol">m</span>
              <span>Mimir</span>
              <PanelLeftClose size={16} />
            </div>
            <button
              className="background-search"
              ref={triggerRef}
              data-main-search={proposal || undefined}
              onClick={openPalette}
            >
              <Search size={15} />
              <span>快速搜索…</span>
              <Key>⌘ K</Key>
            </button>
            <button
              onClick={() => {
                setHost('none')
                setNotice('已在知识库（模拟）')
              }}
            >
              <LibraryBig size={16} />
              <span>知识库</span>
            </button>
            <button onClick={() => begin(askItem)}>
              <MessageCircle size={16} />
              <span>新建对话</span>
            </button>
            <button onClick={() => begin(commandDefinitions[1]!)}>
              <Plus size={16} />
              <span>收集</span>
            </button>
            <div className="sidebar-label">知识库</div>
            <button
              className="nav-current"
              onClick={() => setNotice('当前知识库：个人知识库（模拟）')}
            >
              <Folder size={16} />
              <span>个人知识库</span>
            </button>
            <button onClick={() => setNotice('已选择开始使用（模拟）')}>
              <LibraryBig size={16} />
              <span>开始使用</span>
            </button>
            <div className="sidebar-label">对话</div>
            <p>暂无对话，点上方“新建对话”</p>
            <div className="sidebar-label">最近笔记</div>
            <button onClick={() => begin(firstRecentItem)}>
              <FileText size={16} />
              <span>知识整理的方法</span>
            </button>
            <div className="sidebar-bottom">
              <button onClick={() => setNotice('账号菜单由已完成的工作区模块管理')}>
                <span className="avatar">A</span>
                <span>admin</span>
              </button>
              <button onClick={() => setNotice('设置衔接，完整设置模块后续独立评审')}>
                <Settings size={16} />
                <span>设置</span>
              </button>
            </div>
          </aside>
          <div className="product-content">
            <div className="product-crumb">
              知识库
              <ChevronRight size={13} />
              个人知识库
            </div>
            {host === 'document' || host === 'created' ? (
              documentPreview()
            ) : host === 'chat' ? (
              <article className="chat-preview">
                <MessageCircle size={28} />
                <h2>新的对话</h2>
                <p>问题已带到新对话。你可以继续修改，再决定发送。</p>
                <label>
                  提问内容
                  <textarea aria-label="新对话预填草稿" defaultValue={question} autoFocus />
                </label>
                <p className="host-callout">当前范围：个人知识库 · 未发送任何消息</p>
                <button
                  className="outline-button"
                  onClick={() => {
                    setHost('none')
                    setOpen(true)
                    setNotice('返回搜索，未产生模型请求')
                  }}
                >
                  返回搜索
                </button>
              </article>
            ) : (
              <>
                <h2>个人知识库</h2>
                <p className="library-description">记录、整理，让知识在使用中生长。</p>
                <div className="library-tools">
                  <span>3 篇文档</span>
                  <button className="outline-button" onClick={() => begin(commandDefinitions[0]!)}>
                    <Plus size={14} />
                    新建文件
                  </button>
                </div>
                <button className="library-row" onClick={() => begin(firstRecentItem)}>
                  <FileText size={19} />
                  <span>知识整理的方法</span>
                  <ChevronRight size={16} />
                </button>
                {state === 'editor' && (
                  <textarea
                    className="editor-context"
                    aria-label="当前正在编辑的笔记"
                    defaultValue="这里是尚未保存的笔记。可按 Ctrl / Cmd + K 唤起搜索。"
                    onChange={() => setDirty(true)}
                  />
                )}
              </>
            )}
          </div>
        </div>
        {isNarrow && !open && !hostDialog && host === 'none' && (
          <button
            className="mobile-search-trigger icon-button"
            aria-label="打开搜索抽屉"
            onClick={() => setDrawer(true)}
          >
            <Search size={19} />
          </button>
        )}
        {drawer && !open && (
          <div className="local-mask drawer-mask">
            <aside className="mock-drawer">
              <button
                className="icon-button"
                aria-label="关闭导航抽屉"
                onClick={() => setDrawer(false)}
              >
                <X size={18} />
              </button>
              <h3>工作区</h3>
              <button className="outline-button" onClick={openPalette}>
                <Search size={16} />
                快速搜索
              </button>
              <p>打开搜索后关闭抽屉，取消时回到功能栏搜索入口。</p>
            </aside>
          </div>
        )}
        {open && host === 'none' && (
          <div
            className="local-mask"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePalette()
            }}
          >
            <section
              className="palette"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`palette-title-${suffix}`}
              ref={paletteRef}
              inert={detail ? true : undefined}
            >
              <h3 className="sr-only" id={`palette-title-${suffix}`}>
                搜索文档与操作
              </h3>
              <div className="search-row">
                <Search size={16} />
                <input
                  aria-label={`${proposal ? '打磨后' : '当前'}：搜索文档或输入问题`}
                  ref={searchRef}
                  value={query}
                  maxLength={proposal ? 500 : undefined}
                  placeholder="搜索文档或输入问题"
                  onChange={(event) => updateQuery(event.target.value)}
                  onKeyDown={onInputKey}
                  onCompositionStart={() => setComposition(true)}
                  onCompositionEnd={(event) => {
                    setComposition(false)
                    if (proposal) {
                      const value = event.currentTarget.value
                      later(() => {
                        setRequest(value.trim().length >= 2 ? 'ready' : 'empty')
                      })
                    }
                  }}
                />
                {proposal && question && (
                  <button
                    className="icon-button clear-query"
                    aria-label="清空搜索"
                    disabled={busy}
                    onClick={clearQuery}
                  >
                    <X size={14} />
                  </button>
                )}
                {proposal && (
                  <button
                    className="icon-button close-palette"
                    aria-label="关闭搜索"
                    disabled={busy}
                    onClick={closePalette}
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
              {proposal && composition && (
                <div className="composition-info">
                  <span>正在输入中文，选字不会执行操作</span>
                  <button
                    onClick={() => {
                      setComposition(false)
                      updateQuery(query)
                    }}
                  >
                    完成模拟选字
                  </button>
                </div>
              )}
              {proposal && isLong && (
                <div className="input-counter">最多500个字符 · {query.length}/500</div>
              )}
              <div className="palette-list">
                {proposal && !question && (
                  <>
                    <div className="recent-feedback" role="status">
                      {['loading', 'retry'].includes(recent) ? (
                        <Loading>
                          {recent === 'retry' ? '正在重新读取最近笔记…' : '正在读取最近笔记…'}
                        </Loading>
                      ) : recent === 'empty' ? (
                        <span>
                          {state === 'user-unknown'
                            ? '等待账号信息后显示最近笔记'
                            : state === 'storage'
                              ? '暂时无法读取本机最近记录，仍可搜索文档'
                              : '还没有最近打开的笔记'}
                        </span>
                      ) : ['error', 'partial', 'unauthorized'].includes(recent) ? (
                        <>
                          <CircleAlert size={15} />
                          <span>
                            {recent === 'partial'
                              ? '部分最近笔记暂时无法读取'
                              : recent === 'unauthorized'
                                ? '登录状态失效，请重新确认账号'
                                : '最近笔记暂时无法读取'}
                          </span>
                          <button disabled={recent === 'unauthorized'} onClick={retryRecent}>
                            {recent === 'unauthorized' ? '需要重新登录' : '重试'}
                          </button>
                        </>
                      ) : (
                        <span className="sr-only">最近打开的笔记已读取</span>
                      )}
                    </div>
                  </>
                )}
                {proposal && question.length === 1 && (
                  <p className="inline-feedback">输入至少两个字搜索文档</p>
                )}
                {renderRows(
                  documents,
                  question
                    ? proposal
                      ? `匹配的文档 · ${documents.length} 处`
                      : '匹配的文档'
                    : '最近打开的笔记',
                  0,
                )}
                {proposal && question.length >= 2 && documents.length === 0 && (
                  <div
                    className={`query-feedback ${request === 'error' ? 'is-error' : ''}`}
                    role="status"
                  >
                    {searchPending ? (
                      <>
                        <LoaderCircle className="spin" size={21} />
                        <strong>正在检索文档</strong>
                        <span>结果到达后，再打开所选内容</span>
                      </>
                    ) : request === 'error' ? (
                      <>
                        <CircleAlert size={21} />
                        <strong>暂时无法完成搜索</strong>
                        <span>输入已保留，可以原词重试</span>
                        <button className="outline-button" onClick={retrySearch}>
                          重试搜索
                        </button>
                      </>
                    ) : (
                      <>
                        <Search size={22} />
                        <strong>没有匹配的文档</strong>
                        <span>试试更短的词，或把问题带到新对话</span>
                      </>
                    )}
                  </div>
                )}
                {proposal && request === 'refresh' && (
                  <p className="inline-feedback">
                    <Loading>正在更新当前搜索结果，暂不可打开</Loading>
                  </p>
                )}
                {proposal && request === 'error-cached' && (
                  <p className="inline-feedback error-text">
                    <CircleAlert size={14} />
                    本次更新失败，下方仍是此前结果<button onClick={retrySearch}>重试</button>
                  </p>
                )}
                {proposal && ['loading', 'error'].includes(context) && (
                  <p className="inline-feedback">
                    {context === 'loading' ? (
                      <Loading>正在读取当前文档信息</Loading>
                    ) : (
                      <>
                        <CircleAlert size={14} />
                        当前文档信息读取失败
                        <button
                          onClick={() => {
                            setContext('loading')
                            later(() => setContext('note'))
                          }}
                        >
                          重试
                        </button>
                      </>
                    )}
                  </p>
                )}
                {renderRows(commands, '操作', documents.length)}
              </div>
              {error && proposal && (
                <div className="action-error" role="alert">
                  <CircleAlert size={15} />
                  <span>{error}</span>
                  {state !== 'response-lost' && (
                    <button disabled={busy} onClick={() => execute(commandDefinitions[0]!)}>
                      重试创建
                    </button>
                  )}
                </div>
              )}
              {busy && proposal && (
                <div className="inline-feedback pending-create" role="status">
                  <Loading>正在创建笔记…</Loading>
                  <span>请等待创建结果</span>
                </div>
              )}
              {question && (
                <div className="ai-row">
                  <span className="ai-status">
                    <Sparkles size={16} />
                    <span>{proposal ? '只预填问题，不自动发送' : requestText}</span>
                  </span>
                  <div className="ai-actions">
                    {!proposal && ['error', 'error-cached'].includes(request) && (
                      <button disabled={proposal && searchPending} onClick={retrySearch}>
                        重试
                      </button>
                    )}
                    <button
                      className="ask-button"
                      disabled={proposal && busy}
                      onClick={() => begin(askItem)}
                    >
                      {proposal ? '带到新对话' : '提问'}
                      {proposal && <ArrowRight size={13} />}
                    </button>
                  </div>
                </div>
              )}
              <div className="palette-footer">
                {items.length > 0 && (
                  <span>
                    <Key>↑</Key>
                    <Key>↓</Key>选择
                  </span>
                )}
                {selectedItem && (
                  <span>
                    <Key>Enter</Key>
                    {selectedItem.action === 'hit' || selectedItem.action === 'recent'
                      ? '打开所选结果'
                      : '执行所选操作'}
                  </span>
                )}
                <span>
                  <Key>Esc</Key>关闭
                </span>
              </div>
              <span className="sr-only" role="status" aria-live="polite">
                {selectedItem ? `当前选择：${selectedItem.title}。` : '没有可选择的结果。'}
                {proposal ? requestText : ''}
              </span>
            </section>
          </div>
        )}
        {detail && (
          <div
            className="local-mask detail-mask"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDetail(null)
            }}
          >
            <section
              className="host-modal detail-panel"
              role="dialog"
              aria-modal="true"
              aria-label="完整结果信息"
              ref={detailRef}
            >
              <button
                className="icon-button modal-close"
                aria-label="关闭完整信息"
                onClick={() => {
                  setDetail(null)
                  later(() => searchRef.current?.focus(), 0)
                }}
              >
                <X size={17} />
              </button>
              <h3>完整结果信息</h3>
              <h4>{detail.title}</h4>
              <p className="full-path">
                <Folder size={14} />
                {detail.path || '知识库根'}
              </p>
              <p className="full-excerpt">{detail.sub}</p>
              <footer>
                <button
                  className="outline-button"
                  onClick={() => {
                    setDetail(null)
                    later(() => searchRef.current?.focus(), 0)
                  }}
                >
                  返回搜索
                </button>
                <button className="primary-button" onClick={() => begin(detail)}>
                  打开这处命中
                </button>
              </footer>
            </section>
          </div>
        )}
        {hostDialog && (
          <div
            className="local-mask host-mask"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && host !== 'guard') closeHost()
            }}
          >
            <section
              className={`host-modal ${host === 'guard' ? 'guard-modal' : ''}`}
              ref={hostRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`host-title-${suffix}`}
            >
              {host !== 'guard' && (
                <button
                  className="icon-button modal-close"
                  aria-label="关闭弹窗"
                  disabled={proposal && busy}
                  onClick={closeHost}
                >
                  <X size={17} />
                </button>
              )}
              <h3 id={`host-title-${suffix}`}>
                {
                  (
                    {
                      rename: '重命名笔记',
                      move: '移动文档',
                      find: '搜索当前笔记',
                      capture: '收集链接或文件',
                      guard: recipe.auto && !dirty ? '改动已自动保存' : '有改动还没保存',
                    } as Record<string, string>
                  )[host]
                }
              </h3>
              {host === 'guard' ? (
                <>
                  <p>
                    {recipe.auto
                      ? state === 'saved-during'
                        ? '这次改动已经写入笔记，可以离开。'
                        : '笔记正在自动保存。保存完成后才能离开。'
                      : '离开前保存改动，或丢弃改动。'}
                  </p>
                  {state === 'office' && (
                    <p className="host-callout">当前是需要在工具条保存的 Office 原件。</p>
                  )}
                  {error && (
                    <p className="host-error" role="alert">
                      {error}
                    </p>
                  )}
                  <footer>
                    <button
                      data-initial-focus
                      className="outline-button"
                      disabled={busy}
                      onClick={cancelGuard}
                    >
                      继续编辑
                    </button>
                    {!recipe.auto && (
                      <button
                        className="danger-button"
                        disabled={busy}
                        onClick={() => {
                          setDirty(false)
                          setHost('none')
                          execute(target ?? firstRecentItem)
                        }}
                      >
                        丢弃改动
                      </button>
                    )}
                    <button className="primary-button" disabled={busy} onClick={saveGuard}>
                      {busy ? (
                        <Loading>保存中…</Loading>
                      ) : recipe.auto && state === 'saved-during' ? (
                        '离开'
                      ) : (
                        '保存并离开'
                      )}
                    </button>
                  </footer>
                </>
              ) : host === 'capture' ? (
                <>
                  <p>从命令面板交接到收集入口，不离开当前文档。</p>
                  <label>
                    网页链接
                    <input
                      data-initial-focus
                      placeholder="粘贴网页、公众号或 GitHub 链接"
                      value={draft === '知识整理的方法' ? '' : draft}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                  </label>
                  <p className="host-callout">
                    收集完整流程属于下个模块，本轮演示打开、焦点交接和取消返回。
                  </p>
                  <footer>
                    <button className="outline-button" onClick={closeHost}>
                      取消
                    </button>
                    <button
                      className="primary-button"
                      onClick={() => setNotice('交接演示到此为止；没有上传文件或抓取链接')}
                    >
                      查看交接说明
                    </button>
                  </footer>
                </>
              ) : (
                <>
                  <p className="host-subtitle">当前笔记：知识整理的方法</p>
                  {host === 'move' ? (
                    <>
                      <label>
                        移动到
                        {proposal && ['folder-loading', 'folder-error'].includes(hostStage) ? (
                          <div className="folder-feedback">
                            {hostStage === 'folder-loading' ? (
                              <Loading>正在读取目录…</Loading>
                            ) : (
                              <>
                                <CircleAlert size={17} />
                                <span>目录暂时无法读取</span>
                                <button
                                  onClick={() => {
                                    setHostStage('folder-loading')
                                    later(() => setHostStage('ready'))
                                  }}
                                >
                                  重试
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <select
                            data-initial-focus
                            aria-label="目标目录"
                            value={folder}
                            disabled={proposal && busy}
                            onChange={(event) => setFolder(event.target.value)}
                          >
                            <option value="">知识库根</option>
                            <option value="个人知识库/方法与实践">个人知识库 / 方法与实践</option>
                            <option value="个人知识库/每周回顾">个人知识库 / 每周回顾</option>
                            <option value={longPath}>{longPath}</option>
                          </select>
                        )}
                      </label>
                      {proposal && <p className="field-hint">所选目录：{folder || '知识库根'}</p>}
                    </>
                  ) : (
                    <label>
                      {host === 'rename' ? '名称' : '查找内容'}
                      <input
                        data-initial-focus
                        aria-label={host === 'rename' ? '笔记名称' : '当前笔记查找内容'}
                        disabled={proposal && busy}
                        maxLength={host === 'rename' ? 200 : undefined}
                        value={draft}
                        onChange={(event) => {
                          setDraft(event.target.value)
                          setError('')
                        }}
                        onCompositionStart={() => setComposition(true)}
                        onCompositionEnd={() => setComposition(false)}
                        onKeyDown={(event) => {
                          if (
                            event.key === 'Enter' &&
                            !(proposal && (composition || event.nativeEvent.isComposing))
                          ) {
                            event.preventDefault()
                            if (proposal || host === 'find') saveHost()
                          }
                        }}
                      />
                    </label>
                  )}
                  {host === 'find' && proposal && (
                    <p className="field-hint">输入至少两个字，定位当前笔记中的首个匹配</p>
                  )}
                  {error && proposal && (
                    <p className="host-error" role="alert">
                      {error}
                    </p>
                  )}
                  <footer>
                    <button
                      className="outline-button"
                      disabled={proposal && busy}
                      onClick={closeHost}
                    >
                      取消
                    </button>
                    <button
                      className="primary-button"
                      disabled={
                        (proposal &&
                          (busy ||
                            (host === 'move' &&
                              ['folder-loading', 'folder-error'].includes(hostStage)))) ||
                        (host === 'find' && (proposal ? draft.trim().length < 2 : !draft.trim()))
                      }
                      onClick={saveHost}
                    >
                      {busy && proposal ? (
                        <Loading>{host === 'move' ? '移动中…' : '保存中…'}</Loading>
                      ) : host === 'find' ? (
                        '查找'
                      ) : host === 'move' ? (
                        '移动'
                      ) : (
                        '保存'
                      )}
                    </button>
                  </footer>
                </>
              )}
            </section>
          </div>
        )}
        {notice && (
          <div className="local-toast" role="status">
            <span>{notice}</span>
            {undo && (
              <button
                onClick={() => {
                  setUndo(false)
                  if (state !== 'undo') {
                    setSavedFolder(previousFolder.current)
                    setFolder(previousFolder.current)
                  }
                  setNotice(
                    state === 'undo'
                      ? '模拟撤销失败，请在目录中确认文档位置'
                      : '已撤销移动（模拟）',
                  )
                }}
              >
                撤销
              </button>
            )}
            <button className="icon-button" aria-label="关闭提示" onClick={() => setNotice('')}>
              <X size={13} />
            </button>
          </div>
        )}
      </div>
      <div className="simulation-controls">
        <span>场景演示</span>
        <button
          onClick={() => {
            if (host !== 'none') {
              setHost('none')
              setOpen(true)
              setQuery('')
              setBusyState(false)
              setError('')
            } else if (!open) openPalette()
            else {
              setQuery('')
              setActive(0)
              setActiveKey(null)
              setRequest('ready')
            }
          }}
        >
          <Search size={13} />
          {host !== 'none' ? '返回搜索' : open ? '清空输入' : '打开搜索'}
        </button>
        <button onClick={() => respond(true)}>
          <Check size={13} />
          模拟成功响应
        </button>
        <button onClick={() => respond(false)}>
          <CircleAlert size={13} />
          模拟失败响应
        </button>
        {group === 'recents' && state === 'revision' && (
          <button
            onClick={() => {
              setRevision(revision + 1)
              setNotice('模拟另一个标签页更新最近记录')
            }}
          >
            更新最近记录
          </button>
        )}
        {group === 'query' && state === 'closed-late' && (
          <button
            onClick={() => {
              closePalette()
              later(() => {
                setRequest('ready')
                setNotice('迟到请求已返回，搜索保持关闭')
              })
            }}
          >
            关闭后返回结果
          </button>
        )}
        {group === 'selection' && ['list-growth', 'list-shrink'].includes(state) && (
          <button
            onClick={() => {
              setRequest(request === 'loading' ? 'ready' : 'empty')
              setNotice('异步列表发生变化')
            }}
          >
            改变结果列表
          </button>
        )}
        {state === 'focus-missing' && (
          <button
            onClick={() => {
              previousFocus.current = null
              closePalette()
              setNotice(
                proposal ? '原触发器不可用，返回稳定搜索入口' : '原触发器不可用，当前回焦无兜底',
              )
            }}
          >
            模拟原触发器卸载
          </button>
        )}
      </div>
      <p className="canvas-instruction">
        {hostDialog
          ? '可操作弹窗字段与按钮；保存结果可由下方模拟响应控制。'
          : '在画布中输入、用 ↑ ↓ 选择、Enter 打开、Tab 访问按钮、Esc 关闭。请求仅作本地演示。'}
        {composition && ' 中文选字状态已预置，可点击“完成模拟选字”后继续。'}
      </p>
    </section>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
