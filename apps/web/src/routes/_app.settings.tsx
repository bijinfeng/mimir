import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Tabs } from 'antd'
import { AccountSection } from '@/components/settings/AccountSection'
import { AppearanceSection } from '@/components/settings/AppearanceSection'
import { CaptureSection } from '@/components/settings/CaptureSection'
import { DataSection } from '@/components/settings/DataSection'
import { ModelsSection } from '@/components/settings/ModelsSection'
import { PluginsSection } from '@/components/settings/PluginsSection'
import { RetrievalSection } from '@/components/settings/RetrievalSection'
import { StatsSection } from '@/components/settings/StatsSection'
import { StorageSection } from '@/components/settings/StorageSection'
import { useStyles } from '@/components/settings/settings.style'

/**
 * 设置页。
 *
 * 它不是一堆散落的表单，而是**插件注册表的人类可读视图**（`docs/TECH.md` §7.4）：
 * 每一行「可配置的东西」都对应一个注册进接缝的实现。这样「可配置的东西」
 * 和「代码里的实现」永远一一对应，不会出现设置里有开关但代码里没有对应逻辑。
 *
 * M0 阶段真正能生效的只有几处：导出、重建索引、检索自检。
 * 其余分区**如实标注「现在改不了」**，而不是画一个存不进去的假表单——
 * 那种表单比没有更糟：用户改了、以为生效了，实际什么都没发生。
 *
 * ## 布局：分区导航是**横向**的
 *
 * 早期版本用 `tabPosition="left"` 把分区导航摆在内容列里面，于是这一页
 * 有了**两条左栏**：全局左导航 + 分区的 tab 竖栏。三个后果：
 *
 *  1. 位置反馈重复了——左上角的「设置」已经说明你在哪一页
 *  2. 760px 的限宽内容列里再切掉约 100px，正文只剩约 570px，而右侧空着
 *  3. antd 的 ink bar 是一条脱离文字的竖线，看起来像渲染坏了
 *
 * 改成横向之后，内容列恢复成完整的 760px（`docs/DESIGN.md` §5.4 的
 * 「设置内容列 760px」），且这一页仍然只占一栏。
 *
 * ## 分区选择走 URL
 *
 * 用 `?section=` 而不是 `useState`：设置页的地址是可以贴给人的，
 * 「去设置 > 数据与备份」应当能直接给一个链接。刷新回到原分区也是同一件事。
 * 默认值是 models，与原来的首个 tab 一致。
 */

const SECTIONS = [
  { key: 'models', label: '模型' },
  { key: 'retrieval', label: '检索' },
  { key: 'capture', label: '抓取' },
  { key: 'storage', label: '存储' },
  { key: 'plugins', label: '插件' },
  { key: 'stats', label: '统计' },
  { key: 'data', label: '数据与备份' },
  { key: 'appearance', label: '外观' },
  { key: 'account', label: '账号' },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

const SECTION_KEYS = SECTIONS.map((section) => section.key) as readonly string[]

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
  return typeof value === 'string' && SECTION_KEYS.includes(value)
    ? (value as SectionKey)
    : 'models'
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
    typeof search.section === 'string' && SECTION_KEYS.includes(search.section)
      ? { section: search.section as SectionKey }
      : {},
  component: SettingsPage,
})

function SettingsPage() {
  const { styles } = useStyles()
  const navigate = useNavigate()
  const search = Route.useSearch()
  const section = resolveSection(search.section)

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>设置</h1>
        <p className={styles.lead}>
          这一页是各条接缝当前状态的如实反映：能改的在这里改，不能改的说清为什么。
        </p>

        <Tabs
          className={styles.tabs}
          activeKey={section}
          onChange={(key) => {
            const next = resolveSection(key)
            // replace 而不是 push：分区切换是页内定位，不是导航，
            // 不该让「返回」变成在设置内部一路退回去。
            //
            // scope 要显式带上：搜索参数沿路由树合并，父路由的 scope 是
            // 必需字段，下次跳到文档区时它决定看哪个视图
            void navigate({
              to: '/settings',
              search: { scope: search.scope, section: next },
              replace: true,
            })
          }}
          items={SECTIONS.map((item) => ({
            key: item.key,
            label: item.label,
            children: <SectionBody section={item.key} />,
          }))}
        />
      </div>
    </div>
  )
}

function SectionBody({ section }: { section: SectionKey }) {
  if (section === 'data') return <DataSection />
  if (section === 'plugins') return <PluginsSection />
  if (section === 'models') return <ModelsSection />
  if (section === 'capture') return <CaptureSection />
  if (section === 'storage') return <StorageSection />
  if (section === 'stats') return <StatsSection />
  if (section === 'appearance') return <AppearanceSection />
  if (section === 'account') return <AccountSection />
  return <RetrievalSection />
}
