import { describe, expect, it } from 'vitest'
import {
  buildActions,
  buildConversations,
  buildScopes,
  currentKey,
} from '@/components/nav/menu-items'

/**
 * 左导航的 key 约定。
 *
 * 这些断言看似琐碎，但它们守住的是**「点了没反应」这一类问题**——
 * `NavSidebar` 按 key 前缀分发动作，而前缀拼错不会报错：
 * 点下去什么都不发生，也没有任何提示。只能靠断言覆盖。
 */
describe('导航 key 的编码与解码', () => {
  it('文档页把 scope 编成 scope:<name>', () => {
    expect(currentKey({ page: 'docs', scope: 'inbox' })).toBe('scope:inbox')
    expect(currentKey({ page: 'docs', scope: 'all' })).toBe('scope:all')
  })

  it('标签筛选点亮「全部文档」——侧边栏没有标签项', () => {
    // 侧边栏移除了标签分组，所以按标签筛选时没有对应的项可点亮。
    // 返回 scope:all 是**诚实的近似**：标签筛选是「全部文档」的子筛选，
    // 用户至少知道自己还在文档区，而不是怀疑界面坏了。
    //
    // 若将来标签回到侧边栏，这里应该改成返回 `tag:react` 本身
    expect(currentKey({ page: 'docs', scope: 'tag:react' })).toBe('scope:all')
  })

  it('目录筛选点亮具体的那个目录', () => {
    // 与标签不同：侧边栏**有**目录树，所以应当精确点亮
    expect(currentKey({ page: 'docs', scope: 'folder:技术/前端' })).toBe('scope:folder:技术/前端')
  })

  it('对话页有 id 时指向那个会话，没有 id 时指向「新建对话」', () => {
    expect(currentKey({ page: 'chat', scope: 'inbox', id: 'abc' })).toBe('conv:abc')
    // 没有 id = 新对话。它必须映射到 action:new-chat，
    // 否则侧边栏会没有任何选中项（用户看不出自己在哪）
    expect(currentKey({ page: 'chat', scope: 'inbox' })).toBe('action:new-chat')
  })

  it('设置页指向设置项', () => {
    // 这条曾经是坏的：设置页被并进 docs，于是判据 scope === 'settings'
    // 永远不成立，设置项从来不高亮
    expect(currentKey({ page: 'settings', scope: 'inbox' })).toBe('action:settings')
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
    collect(buildScopes({ inbox: 1, all: 2, note: 3, clip: 0 } as never) as never)
    collect(buildConversations([], 10) as never)
    // 空会话列表时 buildConversations 返回一个带空 children 的分组，
    // 这里补上真实情形的那一条
    allKeys.add('conv:abc')
    // 设置入口在底部账号行的 ⚙ 按钮里（NavSidebar 直接渲染），
    // 不经过 buildActions/buildScopes——补上真实情形
    allKeys.add('action:settings')

    for (const input of [
      { page: 'docs' as const, scope: 'inbox' },
      { page: 'docs' as const, scope: 'all' },
      // 来源（note / clip）不再是 scope（D-047）。标签走 tag: 前缀，
      // currentKey 把它映射到「全部文档」点亮（目录树的 folder key
      // 属于 NavSidebar 的树，不在 buildScopes 的清单里，不进这个断言）
      { page: 'docs' as const, scope: 'tag:react' },
      { page: 'chat' as const, scope: 'inbox' },
      { page: 'chat' as const, scope: 'inbox', id: 'abc' },
      { page: 'settings' as const, scope: 'inbox' },
    ]) {
      expect(allKeys, `${JSON.stringify(input)} 编出的 key 没有对应的菜单项`).toContain(
        currentKey(input),
      )
    }
  })
})

describe('菜单项构造', () => {
  it('计数为 0 时不显示计数', () => {
    // 「0」比空白更占注意力，而它不携带信息
    const items = buildScopes({ inbox: 0, all: 5, note: 0, clip: 0 }) as {
      key: string
      extra?: unknown
    }[]
    expect(items.find((i) => i.key === 'scope:inbox')?.extra).toBeUndefined()
    expect(items.find((i) => i.key === 'scope:all')?.extra).toBe(5)
  })

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
