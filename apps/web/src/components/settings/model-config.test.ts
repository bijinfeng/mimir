import { describe, expect, it } from 'vitest'
import type { ModelRoleStatus, ProviderInstance } from '@mimir/shared'
import {
  mergeFetchedModels,
  modelsForRole,
  roleOptions,
  validateProviderForm,
  withProviderSaved,
} from './model-config'

/**
 * 模型配置的编辑动作（纯函数）。
 *
 * ## 为什么这些必须有测试
 *
 * 它们的错误全是**静默**的，而且都要用户下一次操作时才显形：
 *
 *  1. `mergeFetchedModels` 把用户标过的用途冲掉 → 用户下次去任务分配
 *     发现模型不见了，而拉取时界面上写的是「成功」
 *  2. `withProviderSaved` 漏清一个绑定 → 角色显示「绑定的模型已不在列表里」，
 *     而用户只是改了个模型清单
 *  3. `modelsForRole` 的过滤条件写反 → 向量化角色的下拉里出现对话模型，
 *     直到第一次写向量时才炸
 *  4. `validateProviderForm` 拦错东西（如编辑时不许清除密钥）→
 *     按钮点了没反应，或者一个永远无法保存的表单
 *
 * 四条都不报错，所以断言必须落在具体的值上。
 */

function provider(overrides: Partial<ProviderInstance> = {}): ProviderInstance {
  return {
    id: 'p1',
    preset: 'custom',
    name: '测试供应商',
    family: 'openai-compatible',
    baseUrl: 'https://example.dev/v1',
    hasKey: true,
    models: [],
    modelsFetchedAt: null,
    ...overrides,
  }
}

describe('拉取结果的合并', () => {
  it('保留用户标过的用途（拉取不覆盖显式标注）', () => {
    const current = [
      { id: 'glm-5', source: 'fetched' as const, purposes: ['chat' as const, 'rerank' as const] },
    ]

    const merged = mergeFetchedModels(current, [{ id: 'glm-5', purpose: null }])

    expect(merged.models[0]?.purposes).toEqual(['chat', 'rerank'])
    expect(merged.added).toEqual([])
    expect(merged.kept).toBe(1)
  })

  it('新模型用端点回传的类型（名字认不出也能标对）', () => {
    const merged = mergeFetchedModels(
      [],
      [
        { id: 'voyage-3', purpose: 'embed' },
        { id: 'nameless-thing', purpose: null },
      ],
    )

    expect(merged.models[0]?.purposes).toEqual(['embed'])
    // 端点没给类型的按模型名推断
    expect(merged.models[1]?.purposes).toEqual(['chat'])
    expect(merged.typed).toBe(1)
    expect(merged.added).toEqual(['voyage-3', 'nameless-thing'])
  })

  it('手动添加的模型不在拉取时被冲掉（端点的清单里没有它）', () => {
    const current = [
      { id: 'hand-added', source: 'manual' as const, purposes: ['chat' as const] },
      { id: 'from-endpoint', source: 'fetched' as const, purposes: ['chat' as const] },
    ]

    const merged = mergeFetchedModels(current, [{ id: 'brand-new', purpose: null }])

    const ids = merged.models.map((model) => model.id)
    expect(ids).toContain('hand-added')
    expect(ids).toContain('brand-new')
    // 端点不再提供的会被移除
    expect(ids).not.toContain('from-endpoint')
    expect(merged.removed).toBe(1)
  })

  it('端点清单里也有的手动模型保持 manual（不被降级成 fetched）', () => {
    const current = [{ id: 'hand-added', source: 'manual' as const, purposes: ['chat' as const] }]

    const merged = mergeFetchedModels(current, [{ id: 'hand-added', purpose: null }])

    expect(merged.models[0]?.source).toBe('manual')
  })

  it('端点里消失的预设模型计数为移除，而不是静默丢弃', () => {
    const current = [{ id: 'gone-preset', source: 'preset' as const, purposes: ['chat' as const] }]

    const merged = mergeFetchedModels(current, [{ id: 'alive', purpose: null }])

    expect(merged.removed).toBe(1)
    expect(merged.kept).toBe(0)
  })
})

describe('保存供应商时的角色绑定', () => {
  it('模型被移除后，指向它的绑定一起清掉', () => {
    const draft = withProviderSaved(
      { providers: [provider()], roles: { chat: { providerId: 'p1', model: 'old-model' } } },
      provider({ models: [{ id: 'new-model', source: 'fetched', purposes: ['chat'] }] }),
      null,
    )

    expect(draft.roles.chat).toBeNull()
  })

  it('用途被改成不覆盖该角色时，绑定也清掉', () => {
    const draft = withProviderSaved(
      { providers: [provider()], roles: { chat: { providerId: 'p1', model: 'm' } } },
      // 原来标了 chat，现在只剩 embed——对话角色不该继续绑着它
      provider({ models: [{ id: 'm', source: 'fetched', purposes: ['embed'] }] }),
      null,
    )

    expect(draft.roles.chat).toBeNull()
  })

  it('用途仍然覆盖时绑定保留', () => {
    const draft = withProviderSaved(
      { providers: [provider()], roles: { chat: { providerId: 'p1', model: 'm' } } },
      provider({ models: [{ id: 'm', source: 'fetched', purposes: ['chat'] }] }),
      null,
    )

    expect(draft.roles.chat).toEqual({ providerId: 'p1', model: 'm' })
  })

  it('别的供应商的绑定不受影响', () => {
    const draft = withProviderSaved(
      {
        providers: [provider(), provider({ id: 'p2' })],
        roles: { chat: { providerId: 'p2', model: 'other' } },
      },
      provider({ models: [] }),
      null,
    )

    expect(draft.roles.chat).toEqual({ providerId: 'p2', model: 'other' })
  })

  it('新建时追加进列表，而不是替换', () => {
    const draft = withProviderSaved(
      { providers: [provider()], roles: {} },
      provider({ id: 'p-new', name: '新家' }),
      { value: 'sk-new' },
    )

    expect(draft.providers.map((item) => item.id)).toEqual(['p1', 'p-new'])
    expect(draft.keyDrafts).toEqual({ 'p-new': 'sk-new' })
  })

  it('不填密钥时不带 keyDrafts（服务端保留已存的）', () => {
    const draft = withProviderSaved(
      { providers: [provider()], roles: {} },
      provider({ name: '改了名字' }),
      null,
    )

    expect(draft.keyDrafts).toBeUndefined()
  })

  it('清除密钥传空串（与「不传」是两回事）', () => {
    const draft = withProviderSaved(
      { providers: [provider()], roles: {} },
      provider({ hasKey: false }),
      { value: '' },
    )

    expect(draft.keyDrafts).toEqual({ p1: '' })
  })
})

describe('角色可选模型（按用途过滤）', () => {
  const mixed = provider({
    models: [
      { id: 'chat-model', source: 'fetched', purposes: ['chat'] },
      { id: 'embed-model', source: 'fetched', purposes: ['embed'] },
      { id: 'rerank-model', source: 'fetched', purposes: ['rerank'] },
      { id: 'dual', source: 'fetched', purposes: ['chat', 'embed'] },
    ],
  })

  it('对话 / 深度思考 / 摘要都接受 chat 用途', () => {
    expect(modelsForRole(mixed, 'chat').map((model) => model.id)).toEqual(['chat-model', 'dual'])
    expect(modelsForRole(mixed, 'reasoning').map((model) => model.id)).toEqual([
      'chat-model',
      'dual',
    ])
    expect(modelsForRole(mixed, 'summarize').map((model) => model.id)).toEqual([
      'chat-model',
      'dual',
    ])
  })

  it('向量化只接受 embed 用途', () => {
    expect(modelsForRole(mixed, 'embed').map((model) => model.id)).toEqual(['embed-model', 'dual'])
  })

  it('rerank 用途暂无角色，不进任何下拉', () => {
    const all = ['chat', 'reasoning', 'summarize', 'embed'].flatMap((roleName) =>
      modelsForRole(mixed, roleName).map((model) => model.id),
    )

    expect(all).not.toContain('rerank-model')
  })
})

describe('保存前的校验', () => {
  const base = {
    name: '测试',
    baseUrl: 'https://example.dev/v1',
    models: [] as { id: string; source: 'manual' | 'fetched' | 'preset'; purposes: [] }[],
    hasKey: true,
    keyDraft: '',
    keyCleared: false,
    editing: null as ProviderInstance | null,
  }

  it('新建时缺密钥被拦（本地地址除外）', () => {
    expect(validateProviderForm({ ...base, hasKey: false }).key).toBeDefined()

    // 本地服务不校验密钥——不该拦
    expect(
      validateProviderForm({ ...base, hasKey: false, baseUrl: 'http://localhost:11434/v1' }).key,
    ).toBeUndefined()
  })

  it('编辑时清除密钥不被拦（那是一个显式动作）', () => {
    expect(
      validateProviderForm({
        ...base,
        editing: provider(),
        hasKey: true,
        keyCleared: true,
      }).key,
    ).toBeUndefined()
  })

  it('地址必须带协议', () => {
    expect(validateProviderForm({ ...base, baseUrl: 'api.example.com' }).baseUrl).toBeDefined()
  })

  it('模型 ID 重复时标在那一行上', () => {
    const errors = validateProviderForm({
      ...base,
      models: [
        { id: 'dup', source: 'manual', purposes: ['chat'] },
        { id: 'dup', source: 'manual', purposes: ['chat'] },
      ],
    })

    expect(errors.model0).toBeUndefined()
    expect(errors.model1).toContain('重复')
  })

  it('空模型行被要求删除或补 ID', () => {
    const errors = validateProviderForm({
      ...base,
      models: [{ id: '  ', source: 'manual', purposes: ['chat'] }],
    })

    expect(errors.model0).toContain('模型 ID')
  })
})

function roleStatus(overrides: Partial<ModelRoleStatus> = {}): ModelRoleStatus {
  return {
    role: 'chat',
    label: '对话',
    providerId: null,
    providerName: null,
    model: '',
    ready: false,
    reason: '还没有选择模型',
    ...overrides,
  }
}

describe('角色级联的选项', () => {
  const a = provider({
    id: 'pa',
    name: 'A 家',
    models: [
      { id: 'a-chat', source: 'fetched', purposes: ['chat'] },
      { id: 'a-embed', source: 'fetched', purposes: ['embed'] },
    ],
  })
  const b = provider({
    id: 'pb',
    name: 'B 家',
    hasKey: false,
    models: [{ id: 'b-chat', source: 'fetched', purposes: ['chat'] }],
  })

  it('第一层是供应商（缺密钥的带后缀），第二层是该角色可用的模型', () => {
    const options = roleOptions(roleStatus(), [a, b])

    expect(options.map((item) => item.label)).toEqual(['A 家', 'B 家 · 缺密钥'])
    expect(options[0]?.children?.map((item) => item.value)).toEqual(['a-chat'])
    expect(options[1]?.children?.map((item) => item.value)).toEqual(['b-chat'])
  })

  it('当前绑定不在候选里时，仍挂在对应供应商下（标「不在列表里」）', () => {
    const options = roleOptions(roleStatus({ providerId: 'pa', model: 'a-gone' }), [a, b])

    expect(options[0]?.children?.map((item) => item.label)).toEqual([
      'a-gone（不在列表里）',
      'a-chat',
    ])
    // 别的供应商不挂这条
    expect(options[1]?.children?.map((item) => item.value)).toEqual(['b-chat'])
  })

  it('某家没有可用模型时给一个 disabled 占位，而不是空 children', () => {
    const options = roleOptions(roleStatus({ role: 'embed' }), [a, b])

    // A 家：a-embed 可用
    expect(options[0]?.children?.map((item) => item.value)).toEqual(['a-embed'])

    // B 家：一个 embed 模型都没有 → 占位项，且不可能与真实模型 id 撞
    const placeholder = options[1]?.children?.[0]
    expect(placeholder?.disabled).toBe(true)
    expect(placeholder?.value).toContain('__none__')
    expect(placeholder?.label).toContain('没有可用于该角色的模型')
  })
})
