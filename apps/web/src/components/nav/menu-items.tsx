import {
  AppstoreOutlined,
  HddOutlined,
  MessageOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import type { ConversationSummary, DocumentCounts } from '@mimir/shared'
import { formatRelative } from '@/components/list-helpers'

/**
 * 左导航的菜单项构造。
 *
 * **抽成纯函数是为了让它可测**：这里的每个 key 都是「点下去会发生什么」的
 * 唯一真相（`NavSidebar` 按 key 前缀分发），而串错一个前缀**不会报错**——
 * 只是点了没反应。这类问题只能靠断言覆盖。
 *
 * key 的约定（前缀 + 参数）：
 *
 * ```
 * action:new-chat       动作：新对话
 * action:search         动作：搜索（命令面板）
 * action:capture        动作：收集内容
 * action:settings       动作：设置
 * scope:inbox           导航：知识库的四个视图
 * conv:<id>             导航：某次会话
 * ```
 *
 * （标签那一组已移除——它是「横切」维度的入口，而侧边栏是「归属」维度的地方；
 * 标签筛选改从命令面板与中栏的筛选行进入。这条记在这里是为了避免后人
 * 又把它加回来。）
 */

type MenuItem = Required<MenuProps>['items'][number]

export type NavAction = 'new-chat' | 'search' | 'capture' | 'settings'

/** 把当前所在位置编码成一个菜单 key，与 items 里的 key 对应 */
export function currentKey(input: {
  page: 'docs' | 'chat' | 'settings'
  scope: string
  id?: string | undefined
}): string {
  if (input.page === 'settings') return 'action:settings'
  if (input.page === 'chat') return input.id ? `conv:${input.id}` : 'action:new-chat'

  /**
   * 标签筛选点亮「全部文档」。
   *
   * 侧边栏**没有标签项**（标签是「横切」维度，归中栏的筛选行与命令面板），
   * 所以按标签筛选时侧边栏本来会没有任何选中项——用户彻底失去位置感。
   *
   * 点亮「全部文档」是诚实的近似：标签筛选确实是「全部文档」的一个子筛选
   * （命中的可以是笔记也可以是资料）。比「不点亮」好在用户至少知道自己
   * 在文档区，而不是怀疑界面坏了。
   *
   * 目录（folder:）不同——侧边栏**有**目录树，那时应该点亮具体的那个目录，
   * 所以下面它保持自己的 key。
   */
  if (input.scope.startsWith('tag:')) return 'scope:all'

  // scope 已经是 `folder:x` 这种带前缀的形式，直接用
  return `scope:${input.scope}`
}

/** 顶部动作列表。右侧只显示**真实存在**的快捷键——不编不存在的 */
export function buildActions(): MenuItem[] {
  return [
    { key: 'action:new-chat', icon: <PlusOutlined />, label: '新建对话' },
    {
      key: 'action:search',
      icon: <SearchOutlined />,
      label: '搜索',
      // Ctrl K 是真的绑了（见 _app.tsx 的 window keydown）
      extra: <kbd style={{ fontFamily: 'inherit' }}>Ctrl K</kbd>,
    },
    { key: 'action:capture', icon: <UploadOutlined />, label: '收集内容' },
  ]
}

/**
 * 知识库的两个视图。来源（笔记 / 资料）不再是浏览维度（D-047），
 * 收件箱也不再是（D-054）——库靠目录、标签与搜索组织，
 * 入口只剩全集与归档。
 *
 * **不要把它当作「少一个筛选」而加回来**：收件箱存在的前提是「先收进来、
 * 之后再整理」那条两段式流程，而它已经退役（新的内容直接可用）。
 * 理由与代价见 D-054。
 */
export function buildScopes(counts: DocumentCounts | undefined): MenuItem[] {
  const rows = [
    { key: 'all', icon: <AppstoreOutlined />, label: '全部文档', count: counts?.all },
    { key: 'archived', icon: <HddOutlined />, label: '已归档', count: counts?.archived },
  ]

  return rows.map((row) => ({
    key: `scope:${row.key}`,
    icon: row.icon,
    label: row.label,
    // 计数为 0 时不显示——「0」比空白更占注意力，而它不携带信息
    extra: row.count ? row.count : undefined,
  }))
}

/**
 * 会话历史。
 *
 * **单一分组，不按日期切分。** 早期版本分「今天 / 昨天 / 更早」三组，
 * 那是照搬原型的分法，但实际用起来它是负担：
 *
 *  - 分组标题（「更早」）比它标示的内容更显眼，而它不携带任何信息——
 *    会话本身已经带了相对时间
 *  - 侧边栏宽度只有 200px，三个组标题吃掉三行，而会话总数常常不到十条
 *  - 日期分组的价值在于**筛选**（「我要找上周那个」），但侧边栏不是
 *    用来筛选的，点会话靠的是认出标题
 *
 * 相对时间留在每行的右侧（`extra`），需要时一眼就能看到，但不占结构。
 */
export function buildConversations(
  conversations: ConversationSummary[],
  limit: number,
): MenuItem[] {
  return [
    {
      key: 'conv-group:all',
      type: 'group' as const,
      label: '对话',
      children: conversations.slice(0, limit).map((conversation) => ({
        key: `conv:${conversation.id}`,
        icon: <MessageOutlined />,
        label: conversation.title || '新对话',
        // 相对时间：翻会话时想知道的是「多久以前问的」
        extra: formatRelative(conversation.updatedAt),
      })),
    },
  ]
}
