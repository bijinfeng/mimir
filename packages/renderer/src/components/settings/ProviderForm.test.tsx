import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { openSelect } from '@mimir/office/test-dom'
import type { ProviderInstance, ProviderPreset } from '@mimir/shared'
import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import { ProviderForm } from './ProviderForm'

const mounted: Array<() => void> = []
afterEach(() => {
  for (const unmount of mounted) unmount()
  mounted.length = 0
  vi.restoreAllMocks()
})

async function mount(props: Partial<ComponentProps<typeof ProviderForm>> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const onDraft = vi.fn<ComponentProps<typeof ProviderForm>['onDraft']>()
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <MimirProvider>
          <ProviderForm
            providers={[]}
            roles={[]}
            presets={[]}
            editing={null}
            onDraft={onDraft}
            onDone={vi.fn<() => void>()}
            {...props}
          />
        </MimirProvider>
      </QueryClientProvider>,
    ),
  )
  mounted.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const input = (label: string) =>
    host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  return {
    host,
    onDraft,
    input,
    type: async (label: string, text: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input(label),
          text,
        )
        input(label).dispatchEvent(new Event('input', { bubbles: true }))
      })
    },
    click: async (label: string) => {
      const button = [...host.querySelectorAll('button')].find(
        (item) => item.textContent?.replace(/\s+/g, '') === label.replace(/\s+/g, ''),
      )!
      expect(button).toBeDefined()
      await act(async () => button.click())
    },
  }
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const savedProvider: ProviderInstance = {
  id: 'saved',
  preset: 'custom',
  name: '我的供应商',
  family: 'openai-compatible',
  baseUrl: 'https://api.example.com/v1',
  hasKey: true,
  models: [],
  modelsFetchedAt: null,
}

describe('供应商表单反馈', () => {
  it('提交空表单后聚焦首个错误，输入与错误文本程序化关联', async () => {
    const view = await mount()
    await view.click('保存')
    await nextFrame()
    const name = view.input('显示名')
    expect(document.activeElement).toBe(name)
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(name.getAttribute('aria-describedby')!)?.textContent).toContain(
      '请填写显示名',
    )
  })

  it('预设下拉填入连接与建议模型，并聚焦下一步显示名', async () => {
    const preset: ProviderPreset = {
      id: 'local',
      name: '本地模型',
      family: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      models: ['local-chat'],
      canFetchModels: true,
      note: null,
      popular: true,
    }
    const view = await mount({ presets: [preset] })
    const option = openSelect(view.host, '供应商预设')[0]!
    await act(async () => option.click())
    await nextFrame()
    expect(view.input('显示名').value).toBe('本地模型')
    expect(view.input('接口地址').value).toBe(preset.baseUrl)
    expect(view.host.textContent).toContain('local-chat')
    expect(document.activeElement).toBe(view.input('显示名'))
    expect(view.onDraft).not.toHaveBeenCalled()
  })

  it('新密钥与替换密钥诚实显示待保存，清除仍需保存且可撤销', async () => {
    const fresh = await mount()
    expect(fresh.host.textContent).toContain('未配置密钥')
    await fresh.type('API 密钥', 'draft-key')
    expect(fresh.host.querySelector('[role="status"]')?.textContent).toBe('密钥待保存')
    expect(fresh.onDraft).not.toHaveBeenCalled()

    const edit = await mount({ editing: savedProvider, providers: [savedProvider] })
    expect(edit.host.textContent).toContain('已配置密钥')
    await edit.type('API 密钥', 'replacement-key')
    expect(edit.host.querySelector('[role="status"]')?.textContent).toBe('密钥已修改，待保存')
    await edit.click('清除')
    expect(edit.host.textContent).toContain('保存后清除')
    expect(edit.onDraft).not.toHaveBeenCalled()
    await edit.click('撤销清除')
    expect(edit.host.textContent).toContain('已配置密钥')
    await edit.click('保存')
    expect(edit.onDraft).toHaveBeenCalledOnce()
    expect(edit.onDraft.mock.calls[0]?.[0].keyDrafts).toBeUndefined()
  })

  it('重复添加回到现有空模型，稳定输入 ID 也支持校验错误聚焦', async () => {
    const view = await mount({ editing: savedProvider, providers: [savedProvider] })
    await view.click('+ 手动添加')
    const model = view.input('模型 1 的 ID')
    const stableId = model.id
    view.input('显示名').focus()
    await view.click('+ 手动添加')
    await nextFrame()
    expect(view.host.querySelectorAll('input[aria-label$="的 ID"]')).toHaveLength(1)
    expect(document.activeElement).toBe(model)
    await view.click('保存')
    await nextFrame()
    expect(document.activeElement).toBe(model)
    expect(model.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(model.getAttribute('aria-describedby')!)?.textContent).toContain(
      '请填写模型 ID',
    )
    await view.type('模型 1 的 ID', 'model-one')
    expect(view.input('模型 1 的 ID')).toBe(model)
    expect(model.id).toBe(stableId)
    expect(model.getAttribute('aria-invalid')).toBe('false')
  })
})
