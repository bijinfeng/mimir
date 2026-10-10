import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import type { ModelConfigDraft } from './model-config'
import { ProviderForm } from './ProviderForm'

afterEach(() => vi.restoreAllMocks())

describe('供应商错误反馈', () => {
  it('提交空表单后聚焦首个错误，输入与错误文本程序化关联', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const client = new QueryClient()
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            MimirProvider,
            null,
            createElement(ProviderForm, {
              providers: [],
              roles: [],
              presets: [],
              editing: null,
              onDraft: vi.fn<(draft: ModelConfigDraft, options?: { silent?: boolean }) => void>(),
              onDone: vi.fn<() => void>(),
            }),
          ),
        ),
      )
    })

    const save = [...host.querySelectorAll('button')].find(
      (button) => button.textContent?.replace(/\s+/g, '') === '保存',
    )!
    await act(async () => save.click())
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const name = host.querySelector('input[aria-label="显示名"]') as HTMLInputElement
    expect(document.activeElement).toBe(name)
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(host.querySelector(`#${name.getAttribute('aria-describedby')}`)?.textContent).toContain(
      '请填写显示名',
    )

    await act(async () => root.unmount())
    host.remove()
  })
})
