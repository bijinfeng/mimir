import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ProviderInstance } from '@mimir/shared'
import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import { ProviderList } from './ProviderList'

const mounted: Array<() => void> = []
afterEach(() => {
  for (const unmount of mounted) unmount()
  mounted.length = 0
})

it('供应商独立披露模型状态，并为重复动作保留供应商上下文', async () => {
  const providers: ProviderInstance[] = ['甲供应商', '乙供应商'].map((name, index) => ({
    id: `provider-${index}`,
    name,
    preset: 'custom',
    family: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    hasKey: true,
    models: [{ id: `model-${index}`, source: 'manual', purposes: ['chat'], reasoningEfforts: [] }],
    modelsFetchedAt: null,
  }))
  const onEdit = vi.fn<ComponentProps<typeof ProviderList>['onEdit']>()
  const onDraft = vi.fn<ComponentProps<typeof ProviderList>['onDraft']>()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const queryClient = new QueryClient()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mounted.push(() => {
    act(() => root.unmount())
    queryClient.clear()
    host.remove()
  })
  await act(async () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <MimirProvider>
          <ProviderList providers={providers} roles={[]} onEdit={onEdit} onDraft={onDraft} />
        </MimirProvider>
      </QueryClientProvider>,
    ),
  )

  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === label)!
  const disclosures = [...host.querySelectorAll<HTMLButtonElement>('button[aria-controls]')]
  expect(disclosures).toHaveLength(2)
  const regions = disclosures.map((item) =>
    document.getElementById(item.getAttribute('aria-controls')!)!,
  )
  expect(regions[0]).not.toBe(regions[1])
  for (const [index, disclosure] of disclosures.entries()) {
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(regions[index]!.hidden).toBe(true)
    expect(regions[index]!.getAttribute('role')).toBe('region')
    expect(regions[index]!.getAttribute('aria-labelledby')).toBe(disclosure.id)
    for (const action of ['测试连接', '编辑', '删除']) {
      expect(button(`${action}：${providers[index]!.name}`)).toBeDefined()
    }
  }

  await act(async () => disclosures[0]!.click())
  expect(disclosures[0]!.getAttribute('aria-expanded')).toBe('true')
  expect(regions[0]!.hidden).toBe(false)
  expect(regions[0]!.textContent).toContain('model-0')
  expect(disclosures[1]!.getAttribute('aria-expanded')).toBe('false')
  expect(regions[1]!.hidden).toBe(true)

  await act(async () => disclosures[1]!.click())
  await act(async () => disclosures[0]!.click())
  expect(regions[0]!.hidden).toBe(true)
  expect(disclosures[0]!.getAttribute('aria-expanded')).toBe('false')
  expect(disclosures[1]!.getAttribute('aria-expanded')).toBe('true')
  expect(regions[1]!.hidden).toBe(false)

  await act(async () => button('编辑：乙供应商').click())
  expect(onEdit).toHaveBeenCalledExactlyOnceWith(providers[1])
  expect(onDraft).not.toHaveBeenCalled()
})
