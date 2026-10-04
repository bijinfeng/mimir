import { MessageCircle, Plus, Search } from 'lucide-react'
import type { MenuProps } from 'antd'
import type { ConversationSummary } from '@mimir/shared'
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
 * action:settings       动作：设置
 * action:retry-conversations  动作：会话列表读取失败后重试
 * conv:<id>             导航：某次会话
 * ```
 *
 * （标签那一组已移除——它是「横切」维度的入口，而侧边栏是「归属」维度的地方；
 * 标签筛选改从命令面板与中栏的筛选行进入。这条记在这里是为了避免后人
 * 又把它加回来。）
 *
 * `action:retry-conversations` 由 `NavSidebar` 在 `conversationsQuery.isError`
 * 时直接构造（不经过这里的函数——那条分支要读查询状态，
 * 而这个文件是纯函数）。写在这里是为了 key 表完整：分发端按它匹配。
 */

type MenuItem = Required<MenuProps>['items'][number]

export type NavAction = 'new-chat' | 'search' | 'capture' | 'settings'

/**
 * 把当前所在位置编码成一个菜单 key，与 items 里的 key 对应。
 *
 * 文档页返回 **null**（D-068）：侧边栏菜单里没有任何 scope 项——
 * 「全部文档」入口已移除（进库就是默认视图），目录树由 `FolderSection`
 * 自己高亮，标签筛选没有对应项。返回 null 时调用方给空 selectedKeys，
 * 不强点亮任何东西。
 */
export function currentKey(input: {
  page: 'docs' | 'chat' | 'settings'
  scope: string
  id?: string | undefined
}): string | null {
  if (input.page === 'settings') return 'action:settings'
  if (input.page === 'chat') return input.id ? `conv:${input.id}` : 'action:new-chat'
  return null
}

/** 顶部动作列表。右侧只显示**真实存在**的快捷键——不编不存在的 */
export function buildActions(): MenuItem[] {
  return [
    { key: 'action:new-chat', icon: <Plus size={16} />, label: '新建对话' },
    {
      key: 'action:search',
      icon: <Search size={16} />,
      label: '搜索',
      // Ctrl K 是真的绑了（见 _app.tsx 的 window keydown）
      extra: <kbd style={{ fontFamily: 'inherit' }}>Ctrl K</kbd>,
    },
  ]
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
        icon: <MessageCircle size={16} />,
        label: conversation.title || '新对话',
        // 相对时间：翻会话时想知道的是「多久以前问的」
        extra: formatRelative(conversation.updatedAt),
      })),
    },
  ]
}
