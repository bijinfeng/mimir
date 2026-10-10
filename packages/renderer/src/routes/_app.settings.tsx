import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Menu, Select } from 'antd'
import { AccountSection } from '../components/settings/AccountSection'
import { AppearanceSection } from '../components/settings/AppearanceSection'
import { ClientSection } from '../components/settings/ClientSection'
import { DataSection } from '../components/settings/DataSection'
import { FeedsSection } from '../components/settings/FeedsSection'
import { ModelsSection } from '../components/settings/ModelsSection'
import { PluginsSection } from '../components/settings/PluginsSection'
import { RetrievalSection } from '../components/settings/RetrievalSection'
import { StatsSection } from '../components/settings/StatsSection'
import { StorageSection } from '../components/settings/StorageSection'
import { useStyles } from '../components/settings/settings.style'
import { useIsDesktop } from '../platform'
import { useNarrowViewport } from '../lib/nav-collapse'

/**
 * 设置页。
 *
 * 它按用户任务展示配置与支持能力；实现清单留在服务端。
 * 每一行「可配置的东西」都对应一个注册进接缝的实现。这样「可配置的东西」
 * 和「代码里的实现」永远一一对应，不会出现设置里有开关但代码里没有对应逻辑。
 *
 * M0 阶段真正能生效的只有几处：导出、重建索引、检索自检。
 * 其余分区**如实标注「现在改不了」**，而不是画一个存不进去的假表单——
 * 那种表单比没有更糟：用户改了、以为生效了，实际什么都没发生。
 *
 * 分区导航在宽屏为独立侧栏，窄屏为 Select。正文只渲染当前分区。
 *
 * ## 分区选择走 URL
 *
 * 用 `?section=` 而不是 `useState`：设置页的地址是可以贴给人的，
 * 「去设置 > 数据与备份」应当能直接给一个链接。刷新回到原分区也是同一件事。
 * 不带参数时落在**第一个分区**（`DEFAULT_SECTION`，结构性取
 * `SECTIONS[0]`，不写死字面量——见那里的说明）。
 *
 * ## 窄屏下分区导航换成下拉（`Select`）
 *
 * 窄屏（`NAV_NARROW_QUERY`，与工作区侧栏同一个断点）换成 `Select`，
 * 完整显示分区名；宽屏用独立分区栏，使正文保持足够宽度。
 *
 * 断点从 `tokens.ts` 取，不在这里写数字：它要与外壳的网格（`_app.tsx`）和
 * 栏内的 `matchMedia`（`lib/nav-collapse.ts`）说的是同一个宽度。
 */

const SECTIONS = [
  { key: 'models', label: '模型' },
  { key: 'retrieval', label: '检索' },
  { key: 'feeds', label: '订阅' },
  { key: 'storage', label: '存储' },
  { key: 'plugins', label: '支持能力' },
  { key: 'stats', label: '统计' },
  { key: 'data', label: '数据与备份' },
  { key: 'appearance', label: '外观' },
  { key: 'account', label: '账号' },
] as const

type SectionKey = (typeof SECTIONS)[number]['key'] | 'client'

/**
 * 桌面壳专属分区（D-100）。
 *
 * 单独一处、而不是塞进上面那张常量表：那张表的每一项在**所有部署**里都成立，
 * 而「客户端」只在 Electron 壳里有意义（浏览器的使用方式就是访问哪个地址，
 * 没有可切换的对象）。混进去会让 Web 部署也多一个点了没有对应页面的 tab。
 */
const CLIENT_SECTION = { key: 'client' as const, label: '客户端' }

/** 当前部署下真实存在的分区列表 */
function sectionsFor(desktop: boolean): { key: SectionKey; label: string }[] {
  const base = [...SECTIONS]
  if (!desktop) return base
  // 客户端分区排在「数据与备份」之后、「外观」之前：它是关于这个应用的
  // 事实，与「外观」同属「这个客户端本身」那一类
  return [...base.slice(0, 7), CLIENT_SECTION, ...base.slice(7)]
}

const SECTION_KEYS: ReadonlySet<string> = new Set([
  ...SECTIONS.map((s) => s.key),
  CLIENT_SECTION.key,
])

/**
 * 默认分区：**结构性地取第一个**，不写死字面量。
 *
 * 「打开设置」的语义是「打开这一页」，落在哪个 tab 应当是「排在最前面的
 * 那一个」而不是一个需要跟着维护的常量——调整分区顺序时默认值自然跟着走，
 * 不会出现「第一个是检索、不带参数却打开模型」。
 */
const DEFAULT_SECTION: SectionKey = SECTIONS[0].key

/**
 * 把任意输入收敛成一个已知分区。
 *
 * 两个调用点（`validateSearch` 与组件）都走这里，是因为**只在一处收敛不够**：
 * 实测手改 URL 成 `?section=bogus` 时，`validateSearch` 返回 `{}` 之后
 * 组件拿到的仍可能是原始值，于是 `activeKey` 匹配不上任何一个 tab，
 * 内容区渲染成**空白**——不报错，只是看起来像这一页坏了。
 *
 * 所以组件侧再收敛一次。`activeKey` 永远落在 SECTIONS 里。
 */
function resolveSection(value: unknown): SectionKey {
  return typeof value === 'string' && SECTION_KEYS.has(value)
    ? (value as SectionKey)
    : DEFAULT_SECTION
}

export const Route = createFileRoute('/_app/settings')({
  /**
   * `section` **可选**，不是「必须有默认值」。
   *
   * 它必须可省：搜索参数会沿路由树合并，而左导航等地方用
   * `navigate({ search: { scope } })` 跳到别处——那里不该被迫携带一个
   * 设置页的分区名。缺省值在组件里取。
   */
  validateSearch: (search: Record<string, unknown>): { section?: SectionKey } =>
    typeof search.section === 'string' && SECTION_KEYS.has(search.section)
      ? { section: search.section as SectionKey }
      : {},
  component: SettingsPage,
})

function SettingsPage() {
  const { styles } = useStyles()
  const navigate = useNavigate()
  const search = Route.useSearch()
  const narrow = useNarrowViewport()
  /**
   * 分区清单按部署取（桌面壳多一个「客户端」，D-103）。
   * `desktop` 在页面生命周期里不会变（插槽在首帧前注入），所以不需要订阅。
   */
  const sections = sectionsFor(useIsDesktop())
  const resolved = resolveSection(search.section)
  /**
   * 浏览器里没有「客户端」分区（见 `CLIENT_SECTION` 的说明），但 URL 里
   * 可能带着 `?section=client`（有人贴过桌面端的链接）。那时落回默认分区，
   * 而不是渲染一个空面板——`Tabs` 找不到对应 tab 会渲染成**空白内容区**，
   * 那看起来像这一页坏了。
   */
  const section =
    resolved === 'client' && !sections.some((s) => s.key === 'client') ? DEFAULT_SECTION : resolved

  /**
   * 换分区。
   *
   * `replace` 而不是 `push`：分区切换是页内定位，不是导航，不该让「返回」
   * 变成在设置内部一路退回去。
   *
   * `scope` 要显式带上：搜索参数沿路由树合并，父路由的 scope 是必需字段，
   * 下次跳到文档区时它决定看哪个视图。
   */
  const goSection = (key: string) => {
    void navigate({
      to: '/settings',
      search: { scope: search.scope, section: resolveSection(key) },
      replace: true,
    })
  }

  return (
    <div className={styles.page}>
      {narrow ? (
        <div className={styles.mobileHead}>
          <h1 className={styles.title}>设置</h1>
          <Select
            className={styles.sectionSelect}
            value={section}
            onChange={goSection}
            options={sections.map((item) => ({ value: item.key, label: item.label }))}
            aria-label="设置分区"
          />
        </div>
      ) : (
        <aside className={styles.sectionRail} aria-label="设置分区">
          <h1 className={styles.title}>设置</h1>
          <Menu
            className={styles.sectionMenu}
            mode="inline"
            selectedKeys={[section]}
            onClick={({ key }) => goSection(key)}
            items={sections.map((item) => ({ key: item.key, label: item.label }))}
          />
        </aside>
      )}
      <main className={styles.content}>
        <div className={styles.inner}>
          <h2 className={styles.contentTitle}>
            {sections.find((item) => item.key === section)?.label}
          </h2>
          <SectionBody section={section} />
        </div>
      </main>
    </div>
  )
}

function SectionBody({ section }: { section: SectionKey }) {
  if (section === 'data') return <DataSection />
  if (section === 'plugins') return <PluginsSection />
  if (section === 'models') return <ModelsSection />
  if (section === 'feeds') return <FeedsSection />
  if (section === 'storage') return <StorageSection />
  if (section === 'stats') return <StatsSection />
  if (section === 'client') return <ClientSection />
  if (section === 'appearance') return <AppearanceSection />
  if (section === 'account') return <AccountSection />
  return <RetrievalSection />
}
