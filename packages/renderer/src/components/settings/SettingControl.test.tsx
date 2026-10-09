import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingEntry } from '@mimir/shared'
import { SettingControl } from './SettingControl'
import { MimirProvider } from '../../theme/MimirProvider'

/**
 * 设置项的保存路径。
 *
 * ## 为什么这条要有测试
 *
 * 最初把保存挂在输入框的 `onBlur` 上，实测**没有生效**：真实浏览器里
 * 输入完按 Tab，输入框仍保持焦点，blur 不触发。结果是
 *
 * ```
 * 界面上显示新值 → 数据库一行都没有 → 徽标依然写「默认」
 * ```
 *
 * 也就是「用户以为改了，实际什么都没发生」——设置页自己那条
 * 「画一个存不进去的假表单比没有更糟」（`docs/TECH.md` §7.7）。
 *
 * 这类缺陷靠人工点一下**很容易漏**（点完看起来是对的，值也在框里），
 * 所以它必须由测试守着：改了值就要能点保存，点了就要真的发请求。
 */

const BASE_ENTRY: SettingEntry = {
  key: 'model.baseUrl',
  label: '接口地址',
  description: 'test',
  group: 'models',
  type: 'string',
  value: 'https://api.deepseek.com/v1',
  configured: true,
  source: 'default',
  envName: 'MODEL_BASE_URL',
  defaultValue: 'https://api.deepseek.com/v1',
  writable: true,
  rebuild: 'none',
  problem: null,
}

/**
 * 按钮文案。
 *
 * antd 会在**两个汉字之间插一个空格**（「保存」渲染成「保 存」，
 * 见它的 autoInsertSpace 行为），所以断言前要去掉所有空白——
 * 否则测试会因为一个排版细节而红，而那与被测行为无关。
 */
function buttonLabel(button: HTMLButtonElement | null): string {
  return (button?.textContent ?? '').replace(/\s+/g, '')
}

/** 模拟用户在受控输入框里打字。直接设 value 不会触发 React 的 onChange */
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function render(element: ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client }, createElement(MimirProvider, null, element)),
    )
  })

  return {
    host,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('设置项的保存', () => {
  it('改动之后出现可点的保存按钮（不是靠 blur 触发）', async () => {
    const { host, unmount } = await render(createElement(SettingControl, { entry: BASE_ENTRY }))

    const input = host.querySelector('input')
    expect(input).not.toBeNull()

    // 初始状态：按钮禁用，文案是「已保存」
    const button = () => host.querySelector('button')
    expect(buttonLabel(button())).toBe('已保存')
    expect(button()?.disabled).toBe(true)

    await act(async () => {
      typeInto(input!, 'https://example.dev/v1')
    })

    // 仅靠 onChange 就该变脏——这一步就是当初 onBlur 方案失效的地方
    expect(buttonLabel(button())).toBe('保存')
    expect(button()?.disabled).toBe(false)

    await unmount()
  })

  it('点保存真的发请求，值以 null 之外的形状传给服务端', async () => {
    const calls: Record<string, unknown>[] = []
    const { api } = await import('../../lib/api')
    vi.spyOn(api, 'updateSettings').mockImplementation((values) => {
      calls.push(values)
      return Promise.resolve({ ok: true, issues: [] })
    })

    const { host, unmount } = await render(createElement(SettingControl, { entry: BASE_ENTRY }))
    const input = host.querySelector('input')!

    await act(async () => {
      typeInto(input, 'https://example.dev/v1')
    })
    await act(async () => {
      host.querySelector('button')!.click()
    })

    expect(calls).toEqual([{ 'model.baseUrl': 'https://example.dev/v1' }])

    await unmount()
  })

  it('清空输入框等于「清除覆盖」，发的是 null 而不是空串', async () => {
    const calls: Record<string, unknown>[] = []
    const { api } = await import('../../lib/api')
    vi.spyOn(api, 'updateSettings').mockImplementation((values) => {
      calls.push(values)
      return Promise.resolve({ ok: true, issues: [] })
    })

    const { host, unmount } = await render(createElement(SettingControl, { entry: BASE_ENTRY }))
    const input = host.querySelector('input')!

    await act(async () => {
      typeInto(input, '')
    })
    await act(async () => {
      host.querySelector('button')!.click()
    })

    // 空串与非空串的语义差异是这类界面上最常见的困惑：
    // 契约里 null 表示「删掉覆盖行」，空串会被存成一个空值
    expect(calls).toEqual([{ 'model.baseUrl': null }])

    await unmount()
  })

  it('不可写的键不渲染输入框（只显示值）', async () => {
    const { host, unmount } = await render(
      createElement(SettingControl, {
        entry: { ...BASE_ENTRY, writable: false },
      }),
    )

    expect(host.querySelector('input')).toBeNull()
    expect(host.textContent).toContain('https://api.deepseek.com/v1')

    await unmount()
  })
})
