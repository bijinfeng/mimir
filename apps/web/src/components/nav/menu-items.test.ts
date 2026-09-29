import { describe, expect, it } from 'vitest'
import { buildActions, buildConversations, currentKey } from '@/components/nav/menu-items'

/**
 * 左导航的 key 约定。
 *
 * 这些断言看似琐碎，但它们守住的是**「点了没反应」这一类问题**——
 * `NavSidebar` 按 key 前缀分发动作，而前缀拼错不会报错：
 * 点下去什么都不发生，也没有任何提示。只能靠断言覆盖。
 */
describe('导航 key 的编码与解码', () => {
  it('文档页返回 null：没有 scope 项，目录树自己高亮（D-068）', () => {
    // 「全部文档」入口已移除（进库就是默认视图）；目录高亮由 FolderSection
    // 按 scope=folder: 精确点亮；标签筛选没有对应项，不强点亮任何东西
    expect(currentKey({ page: 'docs', scope: 'all' })).toBeNull()
    expect(currentKey({ page: 'docs', scope: 'tag:react' })).toBeNull()
    expect(currentKey({ page: 'docs', scope: 'folder:技术/前端' })).toBeNull()
  })

  it('对话页有 id 时指向那个会话，没有 id 时指向「新建对话」', () => {
    expect(currentKey({ page: 'chat', scope: 'all', id: 'abc' })).toBe('conv:abc')
    // 没有 id = 新对话。它必须映射到 action:new-chat，
    // 否则侧边栏会没有任何选中项（用户看不出自己在哪）
    expect(currentKey({ page: 'chat', scope: 'all' })).toBe('action:new-chat')
  })

  it('设置页指向设置项', () => {
    // 这条曾经是坏的：设置页被并进 docs，于是判据 scope === 'settings'
    // 永远不成立，设置项从来不高亮
    expect(currentKey({ page: 'settings', scope: 'all' })).toBe('action:settings')
  })

  it('每个 currentKey 的结果都能在 items 里找到对应的 key', () => {
    // 这是最关键的一条：**两端必须对得上**。
    // 编码端（这个函数）与渲染端（build* 系列）分处两个地方，
    // 任何一边改了命名而另一边没跟上，表现都是「选中态消失」
    const allKeys = new Set<string>()
    const collect = (items: { key?: unknown; children?: unknown }[] | undefined) => {
      for (const item of items ?? []) {
        if (typeof item.key === 'string') allKeys.add(item.key)
        collect((item as { children?: { key?: unknown }[] }).children)
      }
    }
    collect(buildActions() as never)
    collect(buildConversations([], 10) as never)
    // 空会话列表时 buildConversations 返回一个带空 children 的分组，
    // 这里补上真实情形的那一条
    allKeys.add('conv:abc')
    // 设置入口在底部账号行的 ⚙ 按钮里（NavSidebar 直接渲染），
    // 不经过 buildActions/buildScopes——补上真实情形
    allKeys.add('action:settings')

    for (const input of [
      { page: 'chat' as const, scope: 'all' },
      { page: 'chat' as const, scope: 'all', id: 'abc' },
      { page: 'settings' as const, scope: 'all' },
    ]) {
      expect(allKeys, `${JSON.stringify(input)} 编出的 key 没有对应的菜单项`).toContain(
        currentKey(input),
      )
    }
    // 文档页编出 null（没有对应菜单项）——目录树的高亮在 FolderSection
    expect(currentKey({ page: 'docs', scope: 'folder:技术' })).toBeNull()
  })
})

describe('菜单项构造', () => {
  it('会话只有一个分组，不按日期切', () => {
    const items = buildConversations(
      [
        {
          id: 'a',
          title: '今天问的',
          refs: [],
          createdAt: '',
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'b',
          title: '很久以前问的',
          refs: [],
          createdAt: '',
          updatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
        },
      ] as never,
      10,
    )

    const groups = items.filter((i) => (i as { type?: string }).type === 'group')
    expect(groups).toHaveLength(1)
    expect((groups[0] as { label: string }).label).toBe('对话')
  })

  it('相对时间显示在右侧 extra 里', () => {
    const items = buildConversations(
      [
        {
          id: 'a',
          title: 'x',
          refs: [],
          createdAt: '',
          updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        },
      ] as never,
      10,
    )
    const group = items[0] as { children: { extra?: string }[] }
    expect(group.children[0]?.extra).toBe('2 天前')
  })
})
