import type { DesktopModeResult, DesktopModeState, MimirDesktopBridge } from '@mimir/shared/desktop'
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 首启选择页（D-100 / D-103）。
 *
 * ## 为什么这几条值得测
 *
 * 这一页是**首次启动看到的第一个画面**，而它的三种形态只差几句文案与一两个
 * 按钮的有无——漏一处不会报错，只是用户看到一个说错话的界面。搬迁前就踩过
 * 一次：首启时多出一行「已在其他方式下使用过？」。改版后入口直接提供
 * 本地与服务器两个选项，首启不再显示那条多余脚注。
 *
 * 改成 React 之后这类问题变成了可断言的条件渲染，所以这里逐条锁住：
 *
 *  1. 首启（`mode.get()` 返回 null）→ 标题「选择使用方式」、**没有**「返回，不改」
 *  2. 已有模式 → 标题「切换使用方式」、有「返回，不改」、云端地址被预填
 *  3. 选「连接服务器」但地址为空 → 主按钮禁用（否则点下去必然失败）
 *  4. `choose()` 失败 → 原话显示出来，且不导航（`activate` 没被调用）
 *  5. 成功 → 调 `activate()` 让宿主导航
 */

const noop = () => {}

function makeBridge(options: {
  current?: DesktopModeState | null
  chooseResult?: DesktopModeResult
}) {
  const calls: string[] = []
  const chosen: DesktopModeState[] = []

  const bridge: MimirDesktopBridge = {
    boot: async () => null,
    quit: noop,
    mode: {
      get: async () => options.current ?? null,
      choose: async (choice) => {
        chosen.push(choice)
        return options.chooseResult ?? { ok: true }
      },
      activate: () => calls.push('activate'),
      openSetup: () => calls.push('openSetup'),
    },
    window: {
      platform: 'linux',
      minimize: () => calls.push('minimize'),
      toggleMaximize: () => calls.push('toggleMaximize'),
      close: () => calls.push('close'),
      isMaximized: async () => false,
      onMaximizeChange: () => noop,
    },
  }

  return { bridge, calls, chosen }
}

/**
 * 装好桥再 import。
 *
 * `desktop-bridge.ts` 在模块求值时读一次 `window.mimirDesktop`（刻意如此：
 * preload 在首帧前注入，写成 hook 会多一帧抖动），所以必须先设全局、
 * 再动态 import，且每次用 `resetModules` 拿新的模块实例。
 */
async function loadPage(bridge: MimirDesktopBridge | undefined) {
  vi.resetModules()
  if (bridge) {
    ;(window as Window & { mimirDesktop?: MimirDesktopBridge }).mimirDesktop = bridge
  }
  const [{ SetupPage }, { MimirProvider }] = await Promise.all([
    import('./SetupPage'),
    import('@mimir/renderer/titlebar-kit'),
  ])
  return { SetupPage, MimirProvider }
}

async function render(provider: unknown, element: ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  await act(async () => {
    root.render(createElement(provider as never, null, element))
  })

  return {
    host,
    text: () => host.innerText || host.textContent || '',
    button: (label: string) =>
      [...host.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(label)),
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

afterEach(() => {
  delete (window as Window & { mimirDesktop?: MimirDesktopBridge }).mimirDesktop
})

describe('选择页', () => {
  it('首次启动：标题是「选择使用方式」，且没有「返回，不改」', async () => {
    const { bridge } = makeBridge({ current: null })
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))

    expect(view.text()).toContain('选择使用方式')
    // 还没有任何生效中的模式，「返回」无处可去
    expect(view.button('返回，不改')).toBeUndefined()

    await view.unmount()
  })

  it('已有模式：标题是「切换使用方式」，可以返回，云端地址被预填', async () => {
    const { bridge } = makeBridge({
      current: { mode: 'cloud', cloudUrl: 'https://kb.example.com' },
    })
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))

    expect(view.text()).toContain('切换使用方式')
    expect(view.button('返回，不改')).toBeDefined()

    const input = view.host.querySelector<HTMLInputElement>('input[type="url"]')
    expect(input?.value, '预填没生效时用户要重新输一遍地址').toBe('https://kb.example.com')

    await view.unmount()
  })

  it('选了「连接服务器」但地址为空时主按钮禁用', async () => {
    const { bridge } = makeBridge({ current: null })
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))

    // 默认是本地，可以直接开始
    expect(view.button('开始使用')?.disabled).toBe(false)

    await act(async () => view.button('连接服务器')?.click())

    expect(view.button('开始使用')?.disabled, '地址为空就点下去，结果必然是失败').toBe(true)

    await view.unmount()
  })

  it('choose() 失败时显示原话，且不导航', async () => {
    const { bridge, calls } = makeBridge({
      current: null,
      chooseResult: { ok: false, message: '连不上：没有人在这个地址上监听' },
    })
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))

    await act(async () => view.button('开始使用')?.click())

    expect(view.text()).toContain('连不上：没有人在这个地址上监听')
    expect(calls, '失败了还导航，用户会落到一个打不开的窗口').not.toContain('activate')

    await view.unmount()
  })

  it('成功后调 activate() 让宿主导航', async () => {
    const { bridge, calls, chosen } = makeBridge({ current: null, chooseResult: { ok: true } })
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))

    await act(async () => view.button('开始使用')?.click())

    expect(chosen).toEqual([{ mode: 'local' }])
    expect(calls).toContain('activate')

    await view.unmount()
  })

  it('没有桥时如实说明，而不是让按钮点了没反应', async () => {
    const { SetupPage, MimirProvider } = await loadPage(undefined)
    const view = await render(MimirProvider, createElement(SetupPage))

    expect(view.text()).toContain('这个窗口不是桌面客户端')
    expect(view.button('开始使用')?.disabled).toBe(true)

    await view.unmount()
  })
})
