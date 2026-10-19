import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MimirProvider } from '@gallery-repo/packages/renderer/src/theme/MimirProvider'
import { PlatformProvider } from '@gallery-repo/packages/renderer/src/platform'
import { api, ApiRequestError } from '@gallery-repo/packages/renderer/src/lib/api'
import { useStyles } from '@gallery-repo/packages/renderer/src/components/settings/settings.style'
import { ModelsSection } from '@gallery-repo/packages/renderer/src/components/settings/ModelsSection'
import { NetworkSearchSection } from '@gallery-repo/packages/renderer/src/components/settings/NetworkSearchSection'
import { RetrievalSection } from '@gallery-repo/packages/renderer/src/components/settings/RetrievalSection'
import { FeedsSection } from '@gallery-repo/packages/renderer/src/components/settings/FeedsSection'
import { StorageSection } from '@gallery-repo/packages/renderer/src/components/settings/StorageSection'
import { PluginsSection } from '@gallery-repo/packages/renderer/src/components/settings/PluginsSection'
import { StatsSection } from '@gallery-repo/packages/renderer/src/components/settings/StatsSection'
import { DataSection } from '@gallery-repo/packages/renderer/src/components/settings/DataSection'
import { AppearanceSection } from '@gallery-repo/packages/renderer/src/components/settings/AppearanceSection'
import { AccountSection } from '@gallery-repo/packages/renderer/src/components/settings/AccountSection'
import { ClientSection } from '@gallery-repo/packages/renderer/src/components/settings/ClientSection'
import fixtures from './fixtures.json'
import './style.css'

// This is an isolated component fixture. Every Settings IO method is replaced;
// there is no service connection, credential, real upload, export or mode change.
const query = new URLSearchParams(location.search)
const state = query.get('state') ?? 'normal'
const section = query.get('section') ?? 'models'
const config = structuredClone(fixtures.config)
const session = structuredClone(fixtures.session)
const feeds = structuredClone(fixtures.feeds)
const width = Number(query.get('width') ?? '760')
if (Number.isFinite(width) && width > 200)
  document.documentElement.style.setProperty('--fixture-width', `${width}px`)
const long = '研究资料与项目知识管理工作空间的长期归档供应商'
if (state === 'long') {
  config.modelConfig.providers[0].name = long.repeat(3)
  config.modelConfig.providers[0].baseUrl =
    'https://example.com/' + 'research-knowledge-management/'.repeat(8)
  session.user.name = long.repeat(2)
  feeds.items = [
    {
      url: 'https://example.com/' + 'research-feed/'.repeat(12) + 'rss.xml',
      title: long.repeat(2),
      folder: null,
      lastFetchedAt: '2026-10-20T00:00:00Z',
      lastError: '隔离模拟：来源暂时不可用，请稍后更新',
      itemCount: 12,
    },
  ]
}
if (state === 'empty') {
  config.modelConfig.providers = []
  feeds.items = []
}
config.localMode = state === 'local'
const pending = []
async function read(value) {
  if (state === 'loading') return new Promise(() => {})
  if (state === 'error')
    throw new ApiRequestError(503, 'DEMO_UNAVAILABLE', '隔离模拟：暂时无法读取，请重试')
  return structuredClone(value)
}
async function write(value) {
  if (state === 'save-error')
    throw new ApiRequestError(503, 'DEMO_SAVE_FAILED', '隔离模拟：保存失败，草稿仍保留')
  if (state === 'pending') await new Promise((resolve) => pending.push(resolve))
  return structuredClone(value)
}
Object.assign(api, {
  config: () => read(config),
  stats: () => read(fixtures.stats),
  updateSettings: async (values) => {
    await write({})
    for (const [key, value] of Object.entries(values)) {
      const entry = config.settings.find((item) => item.key === key)
      if (entry) entry.value = value
    }
    return { ok: true, settings: config.settings }
  },
  testNetworkSearch: () => write({ ok: true, results: 3 }),
  probeStorage: () => write({ ok: true, message: '隔离模拟：连接可用', target: 'storage:local' }),
  probeProvider: () => write({ ok: true, message: '隔离模拟：连接可用' }),
  probeRole: () => write({ ok: true, message: '隔离模拟：模型可用' }),
  fetchModels: () => write({ models: ['demo-model'], fetchedAt: '2026-10-20T00:00:00Z' }),
  search: () => read({ items: [], total: 0 }),
  maintenance: {
    chunks: () => read(fixtures.chunks),
    reindex: () => write({ scanned: 2, created: 0, updated: 2, removed: 0, orphans: 0 }),
    embed: () => write({ processed: 2, remaining: 0, failed: 0 }),
    rebuildChunks: () => write({ documents: 2, chunks: 3 }),
  },
  feeds: {
    list: () => read(feeds),
    create: (input) =>
      write({ feed: { ...input, title: '隔离模拟订阅' }, imported: 0, skipped: 0 }),
    update: () => write({ ok: true }),
    remove: () => write({ ok: true }),
    refresh: () => write({ items: [] }),
  },
  export: { stats: () => read(fixtures.exportStats), url: () => '#simulated-export' },
  avatar: { upload: () => write({ url: '' }) },
  local: {
    updateProfile: async ({ name }) => {
      await write({})
      session.user.name = name
      return { name }
    },
  },
  auth: {
    session: () => read(session),
    updateUser: async ({ name }) => {
      await write({})
      session.user.name = name
      return { status: true }
    },
    signOutAndLeave: () => write({}),
  },
})
const bridge = {
  boot: () =>
    read({
      mode: state === 'local' ? 'local' : 'cloud',
      origin: 'https://example.com/' + (state === 'long' ? 'research/'.repeat(20) : ''),
    }),
  mode: {
    openSetup: () => {
      document.getElementById('fixture-result').textContent =
        '模拟：已请求打开客户端选择页（未调用原生桥）'
    },
  },
}
const sections = {
  models: ModelsSection,
  'network-search': NetworkSearchSection,
  retrieval: RetrievalSection,
  feeds: FeedsSection,
  storage: StorageSection,
  plugins: PluginsSection,
  stats: StatsSection,
  data: DataSection,
  appearance: AppearanceSection,
  account: AccountSection,
  client: ClientSection,
}
const labels = {
  models: '模型',
  'network-search': '网络搜索',
  retrieval: '检索',
  feeds: '订阅',
  storage: '存储',
  plugins: '支持能力',
  stats: '统计',
  data: '数据与备份',
  appearance: '外观',
  account: '账号',
  client: '客户端',
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})
function Fixture() {
  const { styles } = useStyles()
  const Component = sections[section] ?? ModelsSection
  return (
    <>
      <header className="fixture-header">
        <strong>设置 · 隔离交互验收</strong>
        <span>真实组件 / 固定数据 / IO 全部模拟</span>
        <nav>
          {Object.entries(labels).map(([key, label]) => (
            <a key={key} href={`?section=${key}&state=${state}&width=${width}`}>
              {label}
            </a>
          ))}
        </nav>
        <label>
          状态{' '}
          <select
            value={state}
            onChange={(event) => {
              const next = new URL(location.href)
              next.searchParams.set('state', event.target.value)
              location.href = next.href
            }}
          >
            {['normal', 'long', 'empty', 'loading', 'error', 'save-error', 'pending', 'local'].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <button onClick={() => pending.splice(0).forEach((resolve) => resolve())}>
          完成模拟请求
        </button>
        <output id="fixture-result" />
      </header>
      <main className={`${styles.content} fixture-content`}>
        <div className={styles.inner}>
          <Component />
        </div>
      </main>
    </>
  )
}
createRoot(document.getElementById('root')).render(
  <PlatformProvider platform={{ kind: 'desktop', bridge, renderTitleBar: () => null }}>
    <MimirProvider>
      <QueryClientProvider client={client}>
        <Fixture />
      </QueryClientProvider>
    </MimirProvider>
  </PlatformProvider>,
)
