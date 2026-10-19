import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import {
  App as AntApp,
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Input,
  Menu,
  Modal,
  Segmented,
  Skeleton,
  Tooltip,
} from 'antd'
import type { InputRef, MenuProps } from 'antd'
import { createStyles } from 'antd-style'
import {
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  FileText,
  LibraryBig,
  LogOut,
  MessageCircle,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  User,
  X,
} from 'lucide-react'
import { MimirProvider } from '../../../../packages/renderer/src/theme/MimirProvider'
import { setThemeMode, useAppearance } from '../../../../packages/renderer/src/theme/appearance'
import { BrandMark } from '../../../../packages/renderer/src/components/BrandMark'
import { FolderGlyph } from '../../../../packages/renderer/src/components/nav/folder-icons'
import { FOLDER_ICONS } from '../../../../packages/shared/src/structure'
import { useStyles as useNavStyles } from '../../../../packages/renderer/src/components/NavSidebar.style'
import sceneData from './scenes.json'
import inventory from './coverage-v2.json'
import './review.css'

type Scene = (typeof sceneData)[number]
type ThemeChoice = 'auto' | 'light' | 'dark'
const themeLabels: Record<ThemeChoice, string> = { auto: '跟随系统', light: '浅色', dark: '深色' }
const groupScene: Record<string, string> = {
  shell: 'overview',
  rail: 'drawer',
  drawer: 'drawer',
  actions: 'overview',
  selection: 'overview',
  libraries: 'kb',
  'library-menu': 'kb',
  create: 'create',
  rename: 'rename',
  remove: 'remove',
  history: 'history',
  recent: 'recent',
  'recent-recovery': 'recent',
  identity: 'account',
  'account-menu': 'account',
  appearance: 'theme',
  signout: 'logout',
  unsaved: 'guard',
  stress: 'overview',
}
const useReviewStyles = createStyles(({ css, token }) => ({
  root: css`
    --surface: ${token.colorBgContainer};
    --elevated: ${token.colorBgElevated};
    --canvas: ${token.colorBgLayout};
    --nav: ${token.tintNav};
    --text: ${token.colorText};
    --secondary: ${token.colorTextSecondary};
    --muted: ${token.colorTextTertiary};
    --border: ${token.colorBorderSecondary};
    --selected: ${token.navSelectedBg};
    --selected-text: ${token.navSelectedText};
    --hover: ${token.tintHover};
    --focus: ${token.focusRing};
    --error: ${token.colorErrorText};
    --brand: ${token.colorLink};
    --brand-bg: ${token.colorPrimaryBg};
    color: var(--text);
    background: var(--canvas);
    min-height: 100dvh;
  `,
}))

function Feedback({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <p className={`feedback ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

function Review() {
  const { styles } = useReviewStyles()
  const appearance = useAppearance()
  const [sceneId, setSceneId] = useState('rename')
  const [state, setState] = useState('默认')
  const [size, setSize] = useState('桌面')
  const [coverage, setCoverage] = useState(false)
  const [focusedEvidence, setFocusedEvidence] = useState('')
  const scene = sceneData.find((s) => s.id === sceneId) ?? sceneData[0]!
  function chooseScene(id: string, nextState?: string) {
    const next = sceneData.find((s) => s.id === id)!
    setSceneId(id)
    setState(nextState ?? next.states[0]!)
    setFocusedEvidence('')
  }
  return (
    <div className={styles.root}>
      <header className="review-header">
        <div>
          <h1>工作区导航与账户菜单</h1>
          <p>逐模块交互精修 · v2 待认可</p>
        </div>
        <div className="toolbar">
          <Segmented
            aria-label="预览主题"
            options={['浅色', '深色']}
            value={appearance === 'dark' ? '深色' : '浅色'}
            onChange={(v) => setThemeMode(v === '深色' ? 'dark' : 'light')}
          />
          <Segmented
            aria-label="对比尺寸"
            options={['桌面', '窄屏', '低高度']}
            value={size}
            onChange={setSize}
          />
          <Button onClick={() => setCoverage(!coverage)}>
            {coverage ? '收起覆盖清单' : '查看完整覆盖清单'}
          </Button>
        </div>
      </header>
      <div className="review-layout">
        <aside className="scene-nav" aria-label="场景目录">
          {['工作区', '知识库', '历史与最近', '账户', '载体与键盘'].map((g) => (
            <div key={g}>
              <h2>{g}</h2>
              {sceneData
                .filter((s) => s.group === g)
                .map((s) => (
                  <button
                    key={s.id}
                    aria-current={s.id === scene.id ? 'page' : undefined}
                    onClick={() => chooseScene(s.id)}
                  >
                    {s.name}
                    <span>{s.states.length}</span>
                  </button>
                ))}
            </div>
          ))}
          <p className="scope-note">
            本轮只审导航及账户。搜索、收集、知识库整页、设置内容与原生标题栏后续分别评审。
          </p>
        </aside>
        <main className="review-main">
          <section className="scene-intro">
            <h2>{scene.name}</h2>
            <p>{scene.change}</p>
            <div className="state-tabs" role="group" aria-label="交互状态">
              {scene.states.map((s) => (
                <Button
                  key={s}
                  type={s === state ? 'primary' : 'default'}
                  size="small"
                  onClick={() => {
                    setState(s)
                    setFocusedEvidence('')
                  }}
                >
                  {s}
                </Button>
              ))}
            </div>
            {focusedEvidence && (
              <Feedback>
                覆盖项：{focusedEvidence}
                。请结合下方「操作路径与边界」检查实际触发、键盘与退出；此清单不代表产品验收。
              </Feedback>
            )}
          </section>
          <div
            className={`comparison size-${size === '窄屏' ? 'narrow' : size === '低高度' ? 'short' : 'desktop'}`}
          >
            {[false, true].map((proposed) => (
              <article className="comparison-column" key={String(proposed)}>
                <div className="comparison-title">
                  <h3>{proposed ? '打磨提案' : '当前实现'}</h3>
                  <span>{proposed ? '待认可 · 本地模拟' : '当前源码复现片段'}</span>
                </div>
                <Preview
                  key={`${scene.id}-${state}-${size}-${proposed}`}
                  scene={scene}
                  state={state}
                  proposed={proposed}
                  narrow={size === '窄屏'}
                />
                <p className="comparison-note">{proposed ? scene.change : scene.current}</p>
              </article>
            ))}
          </div>
          <section className="detail-section">
            <h3>操作路径与边界</h3>
            <p>
              点击导航、行尾菜单、账户与主题级联；Tab / Shift+Tab 检查焦点，Enter / Space
              触发，Escape 退出当前浮层。弹窗切片下方可打开真实 AntD
              弹窗检查焦点和关闭。所有请求结果、路由及数据均在本页模拟。
            </p>
            <p>
              加载、提交中为可选定格状态；实际点击「重试」或提交会模拟约 0.8
              秒请求。默认成功；选择失败场景后首次操作失败，随后可重试成功。双栏交互独立，切换场景会重置。
            </p>
            <p>
              保留 256px 侧栏、52px 折叠栏、280px 抽屉；知识库顶层平铺，对话最多 12 条、最近笔记最多
              6
              条。未返回的旧对话不能凭空展示。账号缺席场景指根鉴权已成功后的独立查询，根鉴权失败仍走登录或全局错误页。
            </p>
            <p className="source">源码：packages/renderer/src/{scene.source}</p>
          </section>
          {coverage && (
            <section className="coverage">
              <h2>
                完整交互盘点 · {inventory.counts.groups} 组 / {inventory.counts.states} 项
              </h2>
              <p>
                这些是源码状态、操作步骤和跨端条件的并集，并非 {inventory.counts.states}
                个页面。可点击任一项进入对应切片；主题、尺寸和实际键盘步骤需组合核验。标记「保留」的行为也包含在此次评审中。
              </p>
              {inventory.groups.map((g) => (
                <details key={g.id} open>
                  <summary>
                    {g.title} · {g.states.length} 项
                  </summary>
                  <p>{g.proposal}</p>
                  <div className="coverage-items">
                    {g.states.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          const target = groupScene[g.id]!
                          const targetScene = sceneData.find((x) => x.id === target)!
                          const hint = s.label
                          let fixture = targetScene.states.find((x) => hint.includes(x))
                          if (hint.includes('当前id在12')) fixture = '当前对话在第13项'
                          else if (hint.includes('404') || hint.includes('无权限'))
                            fixture = '失效或无权限'
                          else if (hint.includes('部分成功')) fixture = '部分读取失败'
                          else if (hint.includes('session尚')) fixture = '会话加载中'
                          else if (hint.includes('session读取')) fixture = '会话读取失败'
                          else if (hint.includes('config未')) fixture = '配置加载中'
                          else if (hint.includes('config读取')) fixture = '配置读取失败'
                          else if (hint.includes('loading')) fixture = '加载中'
                          else if (hint.includes('自动保存') || hint.includes('auto正在'))
                            fixture = '自动保存中'
                          else if (hint.includes('auto已保存')) fixture = '自动保存完成'
                          else if (hint.includes('深层目录')) fixture = '知识库内部'
                          else if (hint.includes('笔记打开') || hint.includes('笔记page'))
                            fixture = '笔记位置'
                          else if (hint.includes('桌面宿主')) fixture = 'Desktop宿主'
                          else if (hint.includes('长内容')) fixture = '长内容与滚动'
                          else if (hint.includes('空本地')) fixture = '空列表'
                          else if (hint.includes('暂时请求失败')) fixture = '读取失败'
                          if (
                            hint.includes('390') ||
                            hint.includes('窄屏') ||
                            hint.includes('触屏')
                          )
                            setSize('窄屏')
                          if (hint.includes('低高度')) setSize('低高度')
                          if (hint.includes('深色桌面')) setThemeMode('dark')
                          if (hint.includes('浅色桌面')) setThemeMode('light')
                          chooseScene(
                            target,
                            targetScene.states.includes(fixture ?? '') ? fixture : undefined,
                          )
                          setFocusedEvidence(`${s.id} ${s.label}`)
                          window.scrollTo({ top: 0, behavior: 'instant' })
                        }}
                      >
                        <span>{s.id}</span>
                        {s.label}
                        <ExternalLink size={12} />
                      </button>
                    ))}
                  </div>
                  <p className="small">
                    键盘：{g.keyboard} 退出与恢复：{g.exit}
                  </p>
                </details>
              ))}
              <h3>不适用与后续边界</h3>
              {inventory.notApplicable.map((n) => (
                <p key={n.id}>
                  {n.label}：{n.reason}
                </p>
              ))}
            </section>
          )}
          <footer className="review-footer">
            <p>
              视觉沿用已认可的语雀适配与现有 Mimir token。Obsidian仅作工作区连续性参考；WeKnora
              v0.8.3 / 3e22822c 复核官网与源码，参考中性导航选中角色；不引入其工作台或编辑器能力。
            </p>
            <strong>本版仅 HTML 提案。你认可本模块的具体版本后，才会修改产品代码。</strong>
          </footer>
        </main>
      </div>
    </div>
  )
}

function Preview({
  scene,
  state,
  proposed,
  narrow: forcedNarrow,
}: {
  scene: Scene
  state: string
  proposed: boolean
  narrow: boolean
}) {
  const narrow = forcedNarrow || window.matchMedia('(max-width:880px)').matches
  const { styles } = useNavStyles()
  const { message } = AntApp.useApp()
  const fieldRef = useRef<InputRef>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [inlineOpen, setInlineOpen] = useState(state !== '成功' && state !== '取消返回')
  const [guardFixture, setGuardFixture] = useState(
    (scene.id === 'guard' && state !== '默认') ||
      (scene.id === 'logout' && state === '未保存内容' && proposed),
  )
  const [activeForm, setActiveForm] = useState(
    scene.id === 'create' ? 'create' : scene.id === 'remove' ? 'remove' : 'rename',
  )
  const accountRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(false)
  const firstAttempt = useRef(true)
  const [busy, setBusy] = useState(
    state.includes('提交中') || state === '登出中' || state === '保存中' || state === '自动保存中',
  )
  const [result, setResult] = useState(state === '成功' ? '模拟成功，已进入目的地' : '')
  const [error, setError] = useState(
    state === '重名错误'
      ? '已存在同名知识库，请换一个名称。'
      : state === '提交失败'
        ? '请求失败，请重试。已保留输入。'
        : state === '失败与重试'
          ? '删除未完成，请重试。'
          : state === '登出失败'
            ? '登出失败，请重试。'
            : state === '保存失败'
              ? '保存未完成，请重试或继续编辑。'
              : '',
  )
  const [name, setName] = useState(
    state === '空白名称'
      ? '   '
      : state === '含斜杠' || state === '名称错误'
        ? '产品/设计'
        : scene.id === 'create'
          ? state === '默认'
            ? ''
            : '产品设计'
          : state === '未修改' ||
              state === '默认' ||
              state === '仅修改描述' ||
              state === '清空描述' ||
              state === '描述上限' ||
              state === '统一表单'
            ? '产品设计'
            : '产品设计与研究',
  )
  const [description, setDescription] = useState(
    state === '描述上限'
      ? '这是一段用于检查描述上限的本地示例。'.repeat(35).slice(0, 500)
      : state === '清空描述'
        ? ''
        : state === '仅修改描述' || state === '名称与描述一起改'
          ? '补充新的调研范围和资料整理方式。'
          : scene.id === 'create' && state === '默认'
            ? ''
            : '团队的产品设计与研究记录',
  )
  const [icon, setIcon] = useState<string | null>(null)
  const initialDraft = useRef({ name: '产品设计', description: '团队的产品设计与研究记录' })
  const [fieldError, setFieldError] = useState(
    proposed && (state === '含斜杠' || state === '名称错误') ? '名称不能包含 /' : '',
  )
  const [route, setRoute] = useState(
    state === '设置页面'
      ? '设置'
      : state === '对话页面' || state === '当前对话在第13项'
        ? '一周前的方案讨论'
        : state === '新建对话'
          ? '新建对话'
          : state === '笔记位置'
            ? '需求澄清记录'
            : state === '知识库内部'
              ? '产品设计 / 调研 / 访谈'
              : state === '标签筛选'
                ? '标签 / 设计'
                : state === '默认'
                  ? '产品设计'
                  : '知识库',
  )
  const [recentOpen, setRecentOpen] = useState(state !== '折叠')
  const [accountOpen, setAccountOpen] = useState(false)
  const [folderMenu, setFolderMenu] = useState<string | null>(null)
  const folderMenuRef = useRef<HTMLButtonElement | null>(null)
  const [themeOpen, setThemeOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeChoice>(
    state === '浅色' ? 'light' : state === '深色' ? 'dark' : 'auto',
  )
  const [collapsed, setCollapsed] = useState(scene.id === 'drawer' || narrow)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dialog, setDialog] = useState<string | null>(null)
  const [guardOpen, setGuardOpen] = useState(false)
  const [destination, setDestination] = useState('')
  const [recovered, setRecovered] = useState(false)
  const [retrying, setRetrying] = useState(state === '重试中')
  const [sessionRecovered, setSessionRecovered] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const local = state === '本地账户'
  const sessionMissing =
    scene.id === 'account' &&
    !sessionRecovered &&
    (state === '会话加载中' || state === '会话读取失败')
  const configUnknown =
    scene.id === 'account' && !recovered && (state === '配置加载中' || state === '配置读取失败')
  const long = state.includes('长')
  const touch = narrow || window.matchMedia('(max-width:880px)').matches
  const userName = long ? 'admin · 产品设计与知识管理团队工作账户' : 'admin'
  const email = long ? 'admin.product.design.and.research@example.com' : 'admin@example.com'
  const isDirty =
    state === '未保存内容' || state === '未保存确认中' || (scene.id === 'guard' && state !== '默认')
  const frozen =
    state === '重试中' ||
    state === '提交中' ||
    state === '登出中' ||
    state === '保存中' ||
    state === '自动保存中'
  const canonical =
    proposed || scene.id === 'create' || scene.id === 'remove' || scene.id === 'guard'
  const missingAccountUI = sessionMissing && !proposed
  function navigate(next: string) {
    if (isDirty) {
      setDestination(next)
      setGuardOpen(true)
      if (drawerOpen) setDialog('full-guard')
      return
    }
    setRoute(next)
    setDrawerOpen(false)
    setResult(`已打开「${next}」（模拟目的地）`)
  }
  function retry() {
    if (retrying) return
    setRetrying(true)
    window.setTimeout(() => {
      setRetrying(false)
      setRecovered(true)
      setSessionRecovered(true)
      setResult('已重新读取（本地模拟）')
    }, 800)
  }
  function closeLocal() {
    if (canonical && busy) return
    setDialog(null)
    setInlineOpen(false)
    setGuardFixture(false)
    setGuardOpen(false)
    setResult('已取消，原内容保持，返回触发入口')
  }
  function submit(kind: string) {
    if (canonical && (busyRef.current || busy)) return
    if (kind === 'rename' || kind === 'create') {
      if (!name.trim()) return
      if (name.includes('/')) {
        if (canonical) setFieldError('名称不能包含 /')
        else void message.error('名称不能包含 /')
        return
      }
      if (
        kind === 'rename' &&
        name.trim() === initialDraft.current.name &&
        (!proposed || description.trim() === initialDraft.current.description)
      ) {
        setDialog(null)
        setInlineOpen(false)
        setResult(proposed ? '名称与描述均未修改，直接关闭' : '名称未修改，直接关闭')
        return
      }
      if ((kind === 'create' || (proposed && kind === 'rename')) && description.length > 500) return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    setFieldError('')
    window.setTimeout(() => {
      busyRef.current = false
      setBusy(false)
      if (firstAttempt.current && (state.includes('失败') || state === '含斜杠')) {
        firstAttempt.current = false
        if (canonical) setError('请求失败，请重试。已保留输入。')
        else void message.error('请求失败，请重试')
      } else {
        setDialog(null)
        setInlineOpen(false)
        setResult(
          kind === 'remove'
            ? '已删除知识库，12篇文档保留并回到库根（模拟）'
            : kind === 'rename'
              ? proposed
                ? `已保存知识库「${name.trim()}」，描述${description.trim() ? '已更新' : '已清空'}；当前子目录后缀保持（模拟）`
                : '已重命名，当前子目录后缀 / 调研 / 访谈保持（模拟）'
              : '已创建并进入新知识库（模拟）',
        )
        setRoute((previous) => {
          if (kind === 'remove') return '知识库'
          if (kind === 'create') return name.trim()
          const previousName = initialDraft.current.name
          return previous === previousName || previous.startsWith(`${previousName} /`)
            ? name.trim() + previous.slice(previousName.length)
            : previous
        })
      }
    }, 800)
  }
  function openKnowledgeBaseForm(kind: string, libraryName = '产品设计') {
    const baseDescription = '团队的产品设计与研究记录'
    initialDraft.current = { name: libraryName, description: baseDescription }
    firstAttempt.current = true
    busyRef.current = false
    setIcon(null)
    setActiveForm(kind)
    setName(kind === 'create' ? '' : libraryName)
    setDescription(kind === 'create' ? '' : baseDescription)
    setFieldError('')
    setError('')
    setBusy(false)
    setDialog('full-form')
  }
  function signout() {
    if (logoutBusy || local || configUnknown) return
    if (proposed && isDirty) {
      setDestination('登录')
      setGuardOpen(true)
      return
    }
    sendSignout()
  }
  function sendSignout() {
    if (logoutBusy) return
    setAccountOpen(proposed)
    setLogoutBusy(true)
    setLogoutError('')
    window.setTimeout(() => {
      setLogoutBusy(false)
      if (firstAttempt.current && state === '登出失败') {
        firstAttempt.current = false
        if (proposed) setLogoutError('登出失败，当前内容已保留。请重试。')
        else setResult('当前请求失败无界面反馈（源码行为；此行为说明仅供评审）')
      } else {
        setAccountOpen(false)
        setRoute('登录')
        setResult('登出成功，进入登录（本地模拟，未退出真实账户）')
      }
    }, 800)
  }
  function resolveGuard(choice: 'cancel' | 'discard' | 'save') {
    if (busy) return
    if (choice === 'cancel') {
      setDialog(null)
      setGuardFixture(false)
      setGuardOpen(false)
      setResult('继续编辑，原位置与抽屉保持')
      return
    }
    if (choice === 'discard') {
      setDialog(null)
      setGuardFixture(false)
      setGuardOpen(false)
      setDrawerOpen(false)
      setRoute(destination || '知识库')
      setResult('已丢弃本地模拟改动并离开')
      if (destination === '登录') sendSignout()
      return
    }
    setBusy(true)
    setError('')
    window.setTimeout(() => {
      setBusy(false)
      if (firstAttempt.current && state === '保存失败') {
        firstAttempt.current = false
        setError('保存未完成，请重试或继续编辑。')
        return
      }
      setDialog(null)
      setGuardFixture(false)
      setGuardOpen(false)
      setDrawerOpen(false)
      setResult('已保存并离开（模拟）')
      if (destination === '登录') sendSignout()
      else setRoute(destination || '知识库')
    }, 800)
  }
  const menuItems: MenuProps['items'] = [
    {
      type: 'group',
      label: (
        <div className={styles.accountMenuIdentity}>
          <Avatar className={styles.accountAvatar} size={28}>
            A
          </Avatar>
          <div className={styles.accountMenuIdentityText}>
            <Tooltip title={userName}>
              <span className={styles.accountMenuName}>{userName}</span>
            </Tooltip>
            <Tooltip
              title={local ? '本地用户' : configUnknown && proposed ? '正在读取账户模式' : email}
            >
              <span className={styles.accountMenuEmail}>
                {local ? '本地用户' : configUnknown && proposed ? '账户模式未确认' : email}
              </span>
            </Tooltip>
          </div>
        </div>
      ),
      children: [
        { key: 'account', label: '账号资料', icon: <User size={16} /> },
        {
          key: 'theme',
          label: '主题',
          icon: <Palette size={16} />,
          popupClassName: `${styles.accountMenuPopup} ${proposed && touch ? 'touch-menu' : ''}`,
          children: (['auto', 'light', 'dark'] as const).map((t) => ({
            key: `theme:${t}`,
            label: themeLabels[t],
            extra: theme === t ? <Check size={16} /> : undefined,
          })),
        },
        { key: 'stats', label: '数据统计', icon: <ChartColumn size={16} /> },
      ],
    },
    ...(!local && (!configUnknown || !proposed)
      ? [
          { type: 'divider' as const },
          {
            key: 'signout',
            label: logoutBusy ? '登出中…' : logoutError ? '重试登出' : '登出',
            icon: <LogOut size={16} />,
            danger: true,
            disabled: logoutBusy,
          },
        ]
      : []),
  ]
  const account = missingAccountUI ? null : (
    <div
      className={`${styles.accountRow} ${collapsed && !drawerOpen ? styles.accountRowCollapsed : ''}`}
    >
      {sessionMissing && proposed ? (
        <div className="account-recovery">
          {state === '会话加载中' ? (
            <>
              <Skeleton.Avatar active size={26} />
              <span role="status">正在读取账户…</span>
            </>
          ) : (
            <>
              <span>账户读取失败</span>
              <Button size="small" type="link" loading={retrying} onClick={retry}>
                重试
              </Button>
            </>
          )}
        </div>
      ) : (
        !sessionMissing && (
          <Dropdown
            trigger={['click']}
            placement="topRight"
            open={accountOpen}
            onOpenChange={(v) => {
              if (logoutBusy) return
              setAccountOpen(v)
              if (!v) setThemeOpen(false)
            }}
            destroyOnHidden
            classNames={{
              root: `${styles.accountMenuPopup} ${proposed && touch ? 'touch-menu' : ''}`,
            }}
            menu={{
              items: menuItems,
              openKeys: themeOpen ? ['theme'] : [],
              onOpenChange: (keys) => setThemeOpen(keys.includes('theme')),
              onKeyDown: (e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  if (themeOpen) setThemeOpen(false)
                  else {
                    setAccountOpen(false)
                    accountRef.current?.focus()
                  }
                }
              },
              onClick: ({ key }) => {
                if (key.startsWith('theme:')) {
                  flushSync(() => setThemeOpen(false))
                  setAccountOpen(false)
                  setTheme(key.slice(6) as ThemeChoice)
                  setThemeMode(key.slice(6) as ThemeChoice)
                  setResult(
                    `原型主题已选择${themeLabels[key.slice(6) as ThemeChoice]}；仅本原型域名外观，不修改产品偏好。`,
                  )
                  return
                }
                if (key === 'signout') {
                  signout()
                  return
                }
                setAccountOpen(false)
                navigate(key === 'account' ? '设置 / 账号资料' : '设置 / 数据统计')
              },
            }} /* oxlint-disable-next-line react/no-unstable-nested-components -- AntD popupRender is a render callback, not a component type. */
            popupRender={(menus) => (
              <div>
                {menus}
                {proposed && configUnknown && (
                  <div className="menu-feedback">
                    <span>{state === '配置加载中' ? '正在确认账户模式…' : '账户模式读取失败'}</span>
                    {state === '配置读取失败' && (
                      <Button size="small" type="link" loading={retrying} onClick={retry}>
                        重试
                      </Button>
                    )}
                  </div>
                )}
                {proposed && logoutError && (
                  <div className="menu-feedback error" role="alert">
                    {logoutError}
                  </div>
                )}
              </div>
            )}
          >
            <Button
              type="text"
              ref={accountRef}
              aria-label={`${userName}，账号菜单`}
              className={`${styles.account} ${collapsed && !drawerOpen ? styles.accountCollapsed : ''}`}
            >
              <Avatar size={26} className={styles.accountAvatar}>
                A
              </Avatar>
              {(!collapsed || drawerOpen) && <span className={styles.accountName}>{userName}</span>}
            </Button>
          </Dropdown>
        )
      )}
      {!missingAccountUI && (!collapsed || drawerOpen) && (
        <Tooltip title="设置">
          <Button
            className={`${styles.accountSettings} ${route.startsWith('设置') ? styles.accountSettingsActive : ''}`}
            type="text"
            aria-label="设置"
            icon={<Settings size={16} />}
            onClick={() => navigate('设置')}
          >
            {(!collapsed || drawerOpen) && '设置'}
          </Button>
        </Tooltip>
      )}
    </div>
  )
  const action = (
    label: string,
    actionIcon: ReactNode,
    active: boolean,
    next: string,
    compact = false,
  ) => (
    <Tooltip title={compact ? label : null}>
      <Button
        aria-label={label}
        type="text"
        className={`${compact ? styles.railButton : styles.primaryButton} ${active ? styles.railActive : ''}`}
        icon={actionIcon}
        onClick={() =>
          next === '展开侧边栏'
            ? narrow
              ? setDrawerOpen(true)
              : setCollapsed(false)
            : next === '搜索' || next === '收集'
              ? setDialog(next)
              : navigate(next)
        }
      >
        {!compact && label}
      </Button>
    </Tooltip>
  )
  const queryState = (id: string) => (scene.id === id && !recovered ? state : '默认')
  const kbState = queryState('kb'),
    historyState = queryState('history'),
    recentState = queryState('recent')
  function queryNotice(value: string, subject: string) {
    if (value === '重试中')
      return (
        <div className="query-error">
          <span>{subject}读取失败</span>
          <Button type="link" size="small" loading={proposed} onClick={retry}>
            {proposed ? '重试中…' : '重试'}
          </Button>
        </div>
      )
    if (value === '加载中')
      return proposed || subject === '知识库' ? (
        <div className="query-loading" role="status">
          <Skeleton active title={false} paragraph={{ rows: 2 }} />
          <span className="sr-only">{subject}加载中</span>
        </div>
      ) : subject === '最近笔记' ? (
        <p className="query-text">暂无最近笔记</p>
      ) : null
    if (value === '读取失败' || (value === '后台刷新失败' && !proposed))
      return proposed || subject !== '最近笔记' ? (
        <div className="query-error">
          <span>{subject}读取失败</span>
          <Button type="link" size="small" loading={retrying} onClick={retry}>
            重试
          </Button>
        </div>
      ) : (
        <p className="query-text">暂无最近笔记</p>
      )
    if (value === '空列表' || value === '失效或无权限')
      return (
        <p className="query-text">
          {subject === '知识库'
            ? '还没有知识库，点上方 ＋ 创建'
            : subject === '对话'
              ? '暂无对话，点上方“新建对话”'
              : '暂无最近笔记'}
        </p>
      )
    return undefined
  }
  const folders = [
    {
      name: long ? '产品设计与研究 · 2026年产品体验规范及跨端设计资料' : '产品设计',
      count: long ? 1234 : 12,
    },
    { name: '工程与技术', count: 8 },
    { name: '个人笔记', count: 0 },
  ]
  const conversations = Array.from(
    {
      length:
        state === '长内容与滚动' || state === '当前对话在第13项' || state === '超过12条' ? 12 : 3,
    },
    (_, i) =>
      i === 11 && proposed && state === '当前对话在第13项'
        ? '一周前的方案讨论'
        : i === 0 && long
          ? '产品体验规范与跨端知识管理的长期迭代计划'
          : i < 3
            ? ['整理调研结论', '新对话', '本周阅读清单'][i]!
            : `方案讨论 ${13 - i}`,
  )
  const panel = (
    <div className={styles.panel}>
      <div className={styles.panelHeading}>
        <span className={styles.brand}>
          {state !== 'Desktop宿主' && <BrandMark size={22} title={null} />}{' '}
          {state === 'Desktop宿主' ? '工作区' : 'Mimir'}
        </span>
        <Tooltip title={drawerOpen ? '关闭侧边栏' : '折叠侧边栏'}>
          <Button
            type="text"
            ref={drawerRef}
            aria-label={drawerOpen ? '关闭侧边栏' : '折叠侧边栏'}
            className={styles.railButton}
            icon={drawerOpen ? <X size={18} /> : <PanelLeftClose size={18} />}
            onClick={() => (drawerOpen ? setDrawerOpen(false) : setCollapsed(true))}
          />
        </Tooltip>
      </div>
      <div className={styles.primaryActions}>
        <Button
          className={styles.searchButton}
          icon={<Search size={17} />}
          onClick={() => {
            setDrawerOpen(false)
            setDialog('搜索')
          }}
        >
          <span className={styles.searchLabel}>快速搜索…</span>
          {!narrow && <kbd className={styles.searchShortcut}>⌘ K</kbd>}
        </Button>
        {action(
          '知识库',
          <LibraryBig size={18} />,
          !route.startsWith('设置') && route !== '新建对话' && !route.includes('讨论'),
          '知识库',
        )}
        {action('新建对话', <MessageCircle size={18} />, route === '新建对话', '新建对话')}
        {action('收集', <Plus size={18} />, false, '收集')}
      </div>
      <div className={styles.body}>
        <div className="group-heading">
          <span>知识库</span>
          <Tooltip title="创建知识库">
            <Button
              type="text"
              size="small"
              aria-label="创建知识库"
              icon={<Plus size={16} />}
              onClick={() => openKnowledgeBaseForm('create')}
            />
          </Tooltip>
        </div>
        {queryNotice(kbState, '知识库') ?? (
          <>
            {folders.map((f, i) => (
              <div
                className="folder-row"
                data-menu-open={folderMenu === f.name || undefined}
                data-current={
                  route === f.name || (i === 0 && route.includes(' / 调研'))
                    ? 'page'
                    : route === '需求澄清记录' || route.includes(' / 调研')
                      ? i === 0
                        ? 'location'
                        : undefined
                      : undefined
                }
                key={f.name}
              >
                <Tooltip
                  title={proposed ? f.name : null}
                  trigger={['hover', 'focus']}
                  placement="right"
                >
                  <button
                    className="folder-title"
                    aria-current={
                      route === f.name || (i === 0 && route.includes(' / 调研'))
                        ? 'page'
                        : i === 0 && route === '需求澄清记录'
                          ? 'location'
                          : undefined
                    }
                    onClick={() => navigate(f.name)}
                  >
                    <FolderGlyph
                      iconKey={
                        state === '图标与回退'
                          ? i === 0
                            ? 'book'
                            : i === 1
                              ? 'unknown-example'
                              : null
                          : i === 0
                            ? 'book'
                            : null
                      }
                    />
                    <span>{f.name}</span>
                  </button>
                </Tooltip>
                <span className="folder-ops">
                  <span className="folder-count">{f.count || ''}</span>
                  <Dropdown
                    trigger={['click']}
                    placement="rightTop"
                    open={folderMenu === f.name}
                    onOpenChange={(open) => setFolderMenu(open ? f.name : null)}
                    menu={{
                      items: [
                        { key: 'rename', label: proposed ? '编辑' : '重命名' },
                        { type: 'divider' },
                        { key: 'remove', label: '删除', danger: true },
                      ],
                      onKeyDown: (event) => {
                        if (event.key === 'Escape') {
                          event.stopPropagation()
                          setFolderMenu(null)
                          folderMenuRef.current?.focus()
                        }
                      },
                      onClick: ({ key }) => {
                        setFolderMenu(null)
                        openKnowledgeBaseForm(key, f.name)
                      },
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      className="more"
                      ref={folderMenu === f.name ? folderMenuRef : undefined}
                      aria-label={`知识库 ${f.name} 的操作`}
                      icon={<Ellipsis size={16} />}
                    />
                  </Dropdown>
                </span>
              </div>
            ))}
            {kbState === '后台刷新失败' &&
              (proposed ? (
                <div className="query-error">
                  <span>刷新失败，保留上次结果</span>
                  <Button type="link" size="small" loading={retrying} onClick={retry}>
                    重试
                  </Button>
                </div>
              ) : (
                <div className="query-error">
                  知识库读取失败{' '}
                  <Button type="link" size="small" onClick={retry}>
                    重试
                  </Button>
                </div>
              ))}
          </>
        )}
        <div className="group-heading">对话</div>
        {queryNotice(historyState, '对话') ?? (
          <>
            {historyState === '后台刷新失败' && !proposed ? (
              <Button type="text" onClick={retry}>
                读取失败，点此重试
              </Button>
            ) : (
              <Menu
                className={styles.menu}
                mode="inline"
                selectedKeys={[route]}
                onClick={({ key }) => navigate(key)}
                items={conversations.map((c, i) => ({
                  key: c,
                  label: proposed ? (
                    <Tooltip title={c} trigger={['hover', 'focus']}>
                      <span>{c}</span>
                    </Tooltip>
                  ) : (
                    c
                  ),
                  icon: <MessageCircle size={16} />,
                  extra: i === 0 ? '刚刚' : i === 11 ? '1周前' : '昨天',
                  'aria-current': route === c ? 'page' : undefined,
                }))}
              />
            )}
            {historyState === '后台刷新失败' && proposed && (
              <div className="query-error">
                刷新失败，保留上次结果{' '}
                <Button type="link" size="small" loading={retrying} onClick={retry}>
                  重试
                </Button>
              </div>
            )}
          </>
        )}
        <button
          className={`${styles.recentHeading} recent-heading`}
          onClick={() => setRecentOpen(!recentOpen)}
          aria-expanded={recentOpen}
        >
          最近笔记{recentOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {recentOpen &&
          (queryNotice(recentState, '最近笔记') ?? (
            <>
              {(recentState === '部分读取失败'
                ? ['需求澄清记录']
                : state === '6条与顺序' || state === '容量与账号隔离'
                  ? ['需求澄清记录', '产品路线图', '交互评审', '信息架构', '组件约定', '技术笔记']
                  : [
                      '需求澄清记录',
                      long ? '2026 年产品信息架构和设计规范的长期演进记录' : '产品路线图',
                    ]
              ).map((n) => (
                <Tooltip key={n} title={proposed ? `${n} · 产品设计 / 调研` : null}>
                  <button
                    title={`${n} · 产品设计 / 调研`}
                    className="navigation-row"
                    aria-current={route === n ? 'page' : undefined}
                    onClick={() => navigate(n)}
                  >
                    <FileText size={16} />
                    <span>{n}</span>
                  </button>
                </Tooltip>
              ))}
              {recentState === '部分读取失败' && proposed && (
                <div className="query-error">
                  <span>部分笔记暂时无法读取</span>
                  <Button type="link" size="small" loading={retrying} onClick={retry}>
                    重试
                  </Button>
                </div>
              )}
            </>
          ))}
        {retrying && <Feedback>正在重新读取…</Feedback>}
      </div>
      <div className={styles.foot}>{account}</div>
    </div>
  )
  const rail = (
    <div className={styles.rail} inert={drawerOpen}>
      <span className={styles.railBrand}>
        <BrandMark size={23} title={null} />
      </span>
      <Button
        type="text"
        aria-label="展开侧边栏"
        className={styles.railButton}
        icon={<PanelLeftOpen size={18} />}
        onClick={() => (narrow ? setDrawerOpen(true) : setCollapsed(false))}
      />
      {action('知识库', <LibraryBig size={18} />, route === '知识库', '知识库', true)}
      {action('新建对话', <MessageCircle size={18} />, route === '新建对话', '新建对话', true)}
      {action('搜索', <Search size={18} />, false, '搜索', true)}
      {action('收集', <Plus size={18} />, false, '收集', true)}
      <div className={styles.railSpacer} />
      {action('设置', <Settings size={18} />, route.startsWith('设置'), '设置', true)}
      {!drawerOpen && account}
    </div>
  )
  const formKind = activeForm
  const hasForm = ['create', 'rename', 'remove'].includes(scene.id)
  const formTitle =
    formKind === 'create'
      ? '创建知识库'
      : formKind === 'remove'
        ? '删除知识库「产品设计」？'
        : proposed
          ? '编辑知识库'
          : '重命名知识库'
  const formContent = (
    <>
      {formKind === 'remove' ? (
        <p className="dialog-copy">
          {state === '空知识库'
            ? '这是一个空知识库，删除后不影响任何文档。'
            : '里面的 12 篇文档会保留，指派清空后回到库根。'}
        </p>
      ) : (
        <>
          {(canonical || formKind === 'create') && (
            <label className="field-label" htmlFor={`${scene.id}-${proposed}-name`}>
              名称
            </label>
          )}
          <Input
            ref={fieldRef}
            id={`${scene.id}-${proposed}-name`}
            aria-label="知识库名称"
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? `${scene.id}-${proposed}-name-error` : undefined}
            value={name}
            maxLength={formKind === 'create' || proposed ? 60 : undefined}
            disabled={canonical && busy}
            status={fieldError ? 'error' : undefined}
            placeholder={formKind === 'create' ? '如：技术笔记' : '新名称'}
            onChange={(e) => {
              setName(e.target.value)
              setFieldError('')
              setError('')
            }}
            onPressEnter={(e) => {
              if (e.nativeEvent.isComposing) return
              submit(formKind!)
            }}
          />
          {fieldError && (
            <p id={`${scene.id}-${proposed}-name-error`} className="feedback error" role="alert">
              {fieldError}
            </p>
          )}
          {formKind === 'create' || (proposed && formKind === 'rename') ? (
            <>
              <label className="field-label" htmlFor={`${scene.id}-${proposed}-desc`}>
                描述 <small>可选</small>
              </label>
              <Input.TextArea
                id={`${scene.id}-${proposed}-desc`}
                aria-label="知识库描述"
                value={description}
                maxLength={500}
                showCount
                rows={3}
                disabled={busy}
                onChange={(e) => {
                  setDescription(e.target.value)
                  setError('')
                }}
              />
              {!proposed && (
                <>
                  <label className="field-label">
                    图标 <small>再次点击可取消</small>
                  </label>
                  <div className="icon-grid">
                    {FOLDER_ICONS.map((i) => (
                      <button
                        key={i.key}
                        title={i.label}
                        disabled={busy}
                        aria-label={i.label}
                        aria-pressed={icon === i.key}
                        onClick={() => setIcon(icon === i.key ? null : i.key)}
                      >
                        <FolderGlyph iconKey={i.key} />
                        <span>{i.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="dialog-hint">改名即移动：该知识库下的目录结构原样保留</p>
          )}
        </>
      )}
      {error && canonical && <Feedback error>{error}</Feedback>}
    </>
  )
  const formButtons = (
    <>
      <Button ref={cancelRef} disabled={canonical && busy} onClick={closeLocal}>
        取消
      </Button>
      <Button
        type="primary"
        danger={formKind === 'remove'}
        loading={canonical && busy}
        disabled={
          (formKind !== 'remove' && !name.trim()) ||
          ((formKind === 'create' || (proposed && formKind === 'rename')) &&
            description.length > 500)
        }
        onClick={() => submit(formKind!)}
      >
        {canonical && busy
          ? formKind === 'create'
            ? '创建中…'
            : formKind === 'remove'
              ? '删除中…'
              : '保存中…'
          : error && canonical
            ? proposed && formKind === 'rename'
              ? '重试保存'
              : '重试'
            : formKind === 'create'
              ? '创建'
              : formKind === 'remove'
                ? '删除'
                : proposed
                  ? '保存'
                  : '重命名'}
      </Button>
    </>
  )
  const autoSave = state === '自动保存中' || state === '自动保存完成'
  const guardContent = (
    <>
      <p>
        {autoSave
          ? '笔记正在自动保存，请等待保存完成后离开。'
          : '当前内容尚未保存，离开前要如何处理？'}
      </p>
      {error && <Feedback error>{error}</Feedback>}
      <div className="dialog-actions">
        <Button disabled={busy} onClick={() => resolveGuard('cancel')}>
          继续编辑
        </Button>
        {!autoSave && (
          <Button danger disabled={busy} onClick={() => resolveGuard('discard')}>
            丢弃改动
          </Button>
        )}
        <Button type="primary" loading={busy} onClick={() => resolveGuard('save')}>
          {autoSave ? '等待保存并离开' : '保存并离开'}
        </Button>
      </div>
    </>
  )
  const showGuard = (guardOpen || guardFixture) && dialog !== 'full-guard'
  const showInlineForm = hasForm && inlineOpen && dialog !== 'full-form'
  return (
    <div className={`preview-wrap ${narrow ? 'touch-preview' : ''}`}>
      <div className="product-stage">
        <nav
          aria-label={proposed ? '提案主导航' : '当前主导航'}
          className={styles.nav}
          style={{ width: collapsed ? 52 : 256, flex: 'none' }}
        >
          {collapsed ? rail : panel}
        </nav>
        <div className="destination">
          <div className="destination-header">{route}</div>
          <div className="destination-body">
            <p className="destination-label">导航目的地示意</p>
            <h4>{route}</h4>
            <p>正文与工具栏将在各自模块评审。</p>
            {scene.id === 'account' || scene.id === 'theme' || scene.id === 'logout' ? (
              <Button onClick={() => setAccountOpen(!accountOpen)}>打开账户菜单</Button>
            ) : null}
            {scene.id === 'drawer' && (
              <Button onClick={() => setDrawerOpen(true)}>打开窄屏导航</Button>
            )}
            {scene.id === 'logout' && (
              <>
                <Button
                  danger
                  loading={proposed && (logoutBusy || state === '登出中')}
                  onClick={signout}
                >
                  模拟登出
                </Button>
                {state === '未保存内容' && !proposed && (
                  <p className="error">当前实现直接请求登出，未经过未保存保护。</p>
                )}
                {state === '登出失败' && proposed && (
                  <Feedback error>登出失败，当前内容已保留。可重试。</Feedback>
                )}
              </>
            )}
          </div>
        </div>
        {showInlineForm && (
          <div className="embedded-overlay">
            <section className="dialog-sheet" aria-label={`${formTitle}对比片段`}>
              <div className="dialog-title">
                <h4>{formTitle}</h4>
                <Button
                  type="text"
                  aria-label="关闭对比弹窗"
                  disabled={canonical && busy}
                  icon={<X size={16} />}
                  onClick={closeLocal}
                />
              </div>
              <div className="dialog-body">{formContent}</div>
              <div className="dialog-actions">{formButtons}</div>
            </section>
          </div>
        )}
        {showGuard && (
          <div className="embedded-overlay">
            <section className="dialog-sheet" aria-label="未保存内容对比片段">
              <h4>有未保存的改动</h4>
              {guardContent}
            </section>
          </div>
        )}
      </div>
      <div className="preview-controls">
        {proposed && hasForm && formKind !== 'remove' && (
          <span>同一套表单：名称 + 描述（可选，500字）；创建留空，编辑预填，无图标选择。</span>
        )}
        {scene.id === 'recent' && state === '容量与账号隔离' && (
          <p>
            数据合同：当前账号
            admin；本地最多12个ID，界面最多6篇note。重复打开移到最前；权限/404项不显示。账号隔离与系统跟随是实现时的真实宿主验收项，不由本HTML代替。
          </p>
        )}
        {hasForm && (
          <Button size="small" onClick={() => setDialog('full-form')}>
            打开真实弹窗检查焦点
          </Button>
        )}
        {(scene.id === 'guard' || scene.id === 'logout') && (
          <Button
            size="small"
            onClick={() => {
              setDestination(scene.id === 'logout' ? '登录' : '知识库')
              setDialog('full-guard')
            }}
          >
            打开未保存确认
          </Button>
        )}
        {scene.id === 'drawer' && (
          <p>
            对比区显示折叠栏；点击「打开窄屏导航」逐列检查真实抽屉的关闭、遮罩、Tab循环和菜单叠层。宽屏展开是长期偏好，窄屏抽屉仅临时打开。
          </p>
        )}
        {scene.id === 'theme' && <span>本列选择：{themeLabels[theme]}</span>}
        {frozen && <span>选中的忙碌定格状态；可切换其他状态继续操作</span>}
        <div aria-live="polite" className="result-log">
          {result || '可直接操作；仅本页模拟，不发送业务请求。'}
        </div>
      </div>
      <Drawer
        open={drawerOpen}
        placement="left"
        size="min(280px, 100vw)"
        title="工作区导航"
        closable={false}
        keyboard={!guardOpen}
        mask={{ closable: !guardOpen }}
        focusable={{ trap: !guardOpen }}
        onClose={() => setDrawerOpen(false)}
        afterOpenChange={(open) => {
          if (open) drawerRef.current?.focus()
        }}
        styles={{ header: { display: 'none' }, body: { padding: 0, overflow: 'hidden' } }}
      >
        {panel}
      </Drawer>
      <Modal
        open={dialog === 'full-form'}
        title={formTitle}
        onCancel={closeLocal}
        closable={!canonical || !busy}
        keyboard={!canonical || !busy}
        mask={{ closable: !canonical || !busy }}
        footer={formButtons}
        afterOpenChange={(open) => {
          if (open) {
            if (formKind === 'remove') cancelRef.current?.focus()
            else fieldRef.current?.focus()
          }
        }}
        centered
        width={520}
        styles={{ body: { maxHeight: '60dvh', overflowY: 'auto' } }}
      >
        {formContent}
      </Modal>
      <Modal
        open={dialog === 'full-guard'}
        title="有未保存的改动"
        keyboard={!busy}
        closable={!busy}
        mask={{ closable: !busy }}
        onCancel={() => {
          setDialog(null)
          resolveGuard('cancel')
        }}
        footer={null}
        centered
      >
        {guardContent}
      </Modal>
      <Modal
        open={dialog === '搜索' || dialog === '收集'}
        title={`${dialog} · 后续模块边界`}
        footer={<Button onClick={() => setDialog(null)}>返回工作区</Button>}
        onCancel={() => setDialog(null)}
      >
        <p>
          已打开{dialog}覆盖面板；这一步不离开当前内容。内部表单、结果和命令将在对应模块逐项展示。
        </p>
        <p>本轮保留入口、窄屏先关导航抽屉及原有未保存边界。</p>
      </Modal>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <MimirProvider>
    <Review />
  </MimirProvider>,
)
