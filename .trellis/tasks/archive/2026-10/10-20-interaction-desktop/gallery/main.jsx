import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MimirProvider } from '@gallery-repo/packages/renderer/src/theme/MimirProvider'
import { setThemeMode } from '@gallery-repo/packages/renderer/src/theme/appearance'
import { queryClient } from '@gallery-repo/packages/renderer/src/lib/query'
import './style.css'

const params = new URLSearchParams(location.search)
const scene = params.get('scene') ?? 'setup-first'
const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
const platform = ['darwin', 'win32', 'linux'].includes(params.get('platform'))
  ? params.get('platform')
  : 'win32'
const width = Math.max(280, Number(params.get('width') ?? 1100))
const height = Math.max(220, Number(params.get('height') ?? 760))
const longUrl =
  'https://knowledge-workspace.personal-deployment.example.com/mimir/research/knowledge-base/team-space/desktop-connection'
const longVersion = '2026.10.20-preview-desktop-interaction-polish-build-abcdef0123456789'.repeat(4)
const failureMessage = '无法连接服务器：域名解析失败。请检查服务器地址与网络连接，然后重试。'
const scenes = {
  'setup-first': '首次选择',
  'setup-local': '从本地切换',
  'setup-cloud': '从云端切换 · 长地址',
  'setup-loading': '读取使用方式中',
  'setup-read-error': '读取失败与重试',
  'choose-pending': '选择请求手动结算',
  'choose-failure': '选择失败与保稿',
  'choose-success': '选择成功与activate记录',
  'bridge-missing': '桥缺失',
  about: '关于 · 正常版本',
  'about-loading': '关于 · 读取中',
  'about-error': '关于 · 读取失败与重试',
  'about-long': '关于 · 长版本',
  titlebar: '标题栏 · 可折叠',
  'titlebar-collapsed': '标题栏 · 已折叠',
  'titlebar-login': '标题栏 · 无侧栏开关',
  'window-controls': '窗口控件 · 模拟事件',
}
const listeners = new Set(),
  maximizeListeners = new Set()
let snapshot = { log: [], pending: [] }
let queued = []
let getReads = 0,
  bootReads = 0,
  maximized = params.get('maximized') === '1'
const publish = () => {
  snapshot = { ...snapshot, pending: queued.map((item) => item.label) }
  listeners.forEach((listener) => listener())
}
const log = (message) => {
  snapshot = { ...snapshot, log: [...snapshot.log.slice(-25), message] }
  publish()
}
const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const readSnapshot = () => snapshot
const deferred = (label, value) =>
  new Promise((resolve, reject) => {
    queued.push({ label, value, resolve, reject })
    publish()
  })
const stateForScene = () =>
  scene === 'setup-first' || scene === 'setup-loading' || scene === 'bridge-missing'
    ? null
    : scene === 'setup-local'
      ? { mode: 'local' }
      : { mode: 'cloud', cloudUrl: params.get('cloudUrl') ?? longUrl }
const bootInfo = () => ({
  mode: params.get('mode') === 'cloud' ? 'cloud' : 'local',
  origin: 'http://127.0.0.1:31999',
  dataDir: '<isolated-demo-memory-only>',
  version: scene === 'about-long' ? longVersion : '0.1.0',
})
const emitMaximized = (next) => {
  maximized = next
  log(`模拟宿主maximize-change(${next})`)
  maximizeListeners.forEach((listener) => listener(next))
}
const bridge = {
  boot: async () => {
    bootReads++
    log(`模拟IPC boot #${bootReads}`)
    if (scene === 'about-loading') return deferred('读取客户端信息', bootInfo())
    if (scene === 'about-error' && bootReads <= 3) throw new Error('模拟IPC：客户端信息暂不可读')
    return bootInfo()
  },
  quit: () => log('模拟IPC quit；浏览器不退出'),
  mode: {
    get: async () => {
      getReads++
      log(`模拟IPC mode.get #${getReads}`)
      if (scene === 'setup-loading') return deferred('读取当前使用方式', null)
      if (scene === 'setup-read-error' && getReads === 1)
        throw new Error('模拟IPC：当前配置读取失败')
      return stateForScene()
    },
    choose: async (choice) => {
      log(`模拟IPC mode.choose：${JSON.stringify(choice)}`)
      if (scene === 'choose-failure') return { ok: false, message: failureMessage }
      if (scene === 'choose-success') return { ok: true }
      return deferred('选择使用方式', { ok: true })
    },
    activate: () => log('模拟IPC mode.activate；真实窗口会导航，本Demo保留当前组件供检查'),
    openSetup: () => log('模拟IPC mode.openSetup；未触发真实导航'),
  },
  window: {
    platform,
    minimize: () => log('模拟IPC minimize；浏览器窗口尺寸未改变'),
    toggleMaximize: () => {
      log('模拟IPC toggleMaximize')
      emitMaximized(!maximized)
    },
    close: () => log('模拟IPC close；浏览器标签保留'),
    isMaximized: async () => {
      log(`模拟IPC isMaximized → ${maximized}`)
      return maximized
    },
    onMaximizeChange: (listener) => {
      maximizeListeners.add(listener)
      return () => maximizeListeners.delete(listener)
    },
  },
}
// The real module reads this once, just as preload injects before the first frame.
// This is a contract-shaped fixture, never an Electron/preload/native IPC execution.
if (scene !== 'bridge-missing') window.mimirDesktop = bridge
setThemeMode(theme)
document.documentElement.style.setProperty('--fixture-width', `${width}px`)
document.documentElement.style.setProperty('--fixture-height', `${height}px`)
document.body.dataset.capture = String(params.get('capture') === '1')

const [{ SetupPage }, { TitleBar }, { WindowControls }, { Route }] = await Promise.all([
  import('@gallery-repo/apps/desktop/src/renderer/setup/SetupPage'),
  import('@gallery-repo/apps/desktop/src/renderer/components/TitleBar'),
  import('@gallery-repo/apps/desktop/src/renderer/components/WindowControls'),
  import('@gallery-repo/apps/desktop/src/renderer/routes/about'),
])
const AboutPage = Route.options.component
function Demo() {
  const state = useSyncExternalStore(subscribe, readSnapshot)
  const [collapsed, setCollapsed] = useState(scene === 'titlebar-collapsed')
  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => !value)
    log('实际TitleBar回调：切换侧栏折叠状态（只控制演示prop）')
  }, [])
  useEffect(() => {
    const key = (event) => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault()
        document.body.dataset.capture = String(document.body.dataset.capture !== 'true')
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  const settle = (fail) => {
    const pending = queued
    queued = []
    publish()
    for (const item of pending) {
      if (fail && item.label === '选择使用方式')
        item.resolve({ ok: false, message: failureMessage })
      else if (fail) item.reject(new Error('模拟IPC手动读取失败'))
      else item.resolve(item.value)
    }
    log(`手动${fail ? '失败' : '完成'}${pending.length}项模拟IPC；无持久化、宿主启动或真实导航`)
  }
  const href = (updates) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(updates)) next.set(key, value)
    return `?${next}`
  }
  const titleScene = scene.startsWith('titlebar')
  return (
    <>
      <header className="fixture-tools">
        <h1>
          Desktop真实组件 · {__GALLERY_VARIANT__ === 'before' ? '基线53285bb' : '当前实现'} · 模拟桥
        </h1>
        <p>
          这是浏览器中的真实React组件与产品主题。IPC、配置、启动、窗口动作均为可控模拟；没有Electron、原生菜单、系统拖动、真实红绿灯或真实导航。
        </p>
        <nav aria-label="组件与桥条件">
          {Object.entries(scenes).map(([key, label]) => (
            <a
              key={key}
              href={href({ scene: key })}
              aria-current={scene === key ? 'page' : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="fixture-actions">
          <a href={href({ theme: theme === 'dark' ? 'light' : 'dark' })}>切换主题</a>
          {['win32', 'linux', 'darwin'].map((value) => (
            <a key={value} href={href({ platform: value })}>
              {value}
            </a>
          ))}
          <a href={href({ width: '1440', height: '900' })}>生产默认1440×900</a>
          <a href={href({ width: '1100', height: '760' })}>1100×760</a>
          <a href={href({ width: '390', height: '400' })}>390×400压力测试</a>
          <button
            onClick={() => {
              document.body.dataset.capture = 'true'
            }}
          >
            隐藏辅助区（Alt+Shift+H恢复）
          </button>
          <button disabled={!state.pending.length} onClick={() => settle(false)}>
            完成模拟IPC
          </button>
          <button disabled={!state.pending.length} onClick={() => settle(true)}>
            失败模拟IPC
          </button>
          <button onClick={() => emitMaximized(!maximized)}>模拟外部最大化事件</button>
        </div>
        <p role="status">
          场景：{scenes[scene] ?? scene} · {theme} · {platform} · 组件区{width}×{height} · 待结算：
          {state.pending.join('、') || '无'}
        </p>
        <p>
          当前主进程默认1440×900，未设minWidth/minHeight；390×400为非真实生产窗口的压力条件。macOS原生红绿灯不由HTML模拟；关闭和最小化仅记日志。关于页沿产品QueryClient重试策略，错误场景前三次boot拒绝后出现真实错误UI，点击重试后成功。
        </p>
      </header>
      <div className="fixture-frame">
        {scene.startsWith('setup') || scene.startsWith('choose') || scene === 'bridge-missing' ? (
          <SetupPage />
        ) : titleScene ? (
          <div className="fixture-shell">
            <TitleBar
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
              showToggle={scene !== 'titlebar-login'}
            />
            <div className="fixture-shell-body">
              <AboutPage />
            </div>
          </div>
        ) : scene === 'window-controls' ? (
          <div className="fixture-shell">
            <div className="fixture-controls-strip">
              <WindowControls omit={params.get('omit')?.split(',') ?? []} />
            </div>
            <div className="fixture-shell-body">
              <AboutPage />
            </div>
          </div>
        ) : (
          <AboutPage />
        )}
      </div>
      <pre className="fixture-log" aria-label="模拟桥调用记录">
        {state.log.join('\n')}
      </pre>
    </>
  )
}
createRoot(document.getElementById('root')).render(
  <MimirProvider>
    <QueryClientProvider client={queryClient}>
      <Demo />
    </QueryClientProvider>
  </MimirProvider>,
)
