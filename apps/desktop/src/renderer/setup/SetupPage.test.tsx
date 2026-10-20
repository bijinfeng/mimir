import { makeUpdateBridge } from '@/update/test-bridge'
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function pressEnter(input: HTMLInputElement) {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

function changeInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function makeBridge(options: {
  current?: DesktopModeState | null
  chooseResult?: DesktopModeResult
}) {
  const calls: string[] = []
  const chosen: DesktopModeState[] = []

  const bridge: MimirDesktopBridge = {
    update: makeUpdateBridge().api,
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
  it('读取期间保留品牌和可用窗口控件，不提前显示首启表单', async () => {
    const read = deferred<DesktopModeState | null>()
    const { bridge, calls } = makeBridge({})
    bridge.mode.get = () => read.promise
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))

    expect(view.text()).toContain('mimir')
    expect(view.host.querySelector('[role="status"]')?.textContent).toBe('正在读取使用方式…')
    expect(view.button('开始使用')).toBeUndefined()
    expect(view.host.querySelector('[role="group"][aria-label="使用方式"]')).toBeNull()
    expect(view.host.querySelector('[aria-label="最大化"]')).toBeNull()
    await act(async () => {
      view.host.querySelector<HTMLButtonElement>('[aria-label="最小化"]')?.click()
      view.host.querySelector<HTMLButtonElement>('[aria-label="关闭"]')?.click()
    })
    expect(calls).toEqual(['minimize', 'close'])

    await act(async () => read.resolve({ mode: 'local' }))
    expect(view.text()).toContain('切换使用方式')
    expect(view.text()).not.toContain('选择使用方式')
    await view.unmount()
  })

  it('读取失败后的重试仍显示真实等待，成功前不出现选择表单', async () => {
    const first = deferred<DesktopModeState | null>()
    const retry = deferred<DesktopModeState | null>()
    const { bridge } = makeBridge({})
    bridge.mode.get = vi
      .fn<MimirDesktopBridge['mode']['get']>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(retry.promise)
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))
    await act(async () => first.reject(new Error('IPC 暂时不可用')))
    expect(view.text()).toContain('无法读取使用方式')

    await act(async () => view.button('重')?.click())
    expect(view.host.querySelector('[role="status"]')?.textContent).toBe('正在读取使用方式…')
    expect(view.button('开始使用')).toBeUndefined()
    await act(async () => retry.resolve(null))
    expect(view.text()).toContain('选择使用方式')
    await view.unmount()
  })

  it('读取迟到结果不会在卸载后发布', async () => {
    const read = deferred<DesktopModeState | null>()
    const { bridge } = makeBridge({})
    bridge.mode.get = () => read.promise
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))
    await view.unmount()
    await act(async () => read.resolve({ mode: 'local' }))
    expect(view.host.textContent).toBe('')
  })

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

  it('读取当前模式失败时不误判为首次启动，并可重试', async () => {
    const { bridge } = makeBridge({ current: { mode: 'local' } })
    let attempts = 0
    bridge.mode.get = async () => {
      attempts += 1
      if (attempts === 1) throw new Error('IPC 暂时不可用')
      return { mode: 'local' }
    }
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))

    expect(view.text()).toContain('无法读取使用方式')
    expect(view.button('开始使用')).toBeUndefined()
    expect(view.button('切换')).toBeUndefined()
    const retry = [...view.host.querySelectorAll('button')].find(
      (button) => button.textContent?.replace(/\s/g, '') === '重试',
    )
    expect(retry).toBeDefined()

    await act(async () => {
      retry?.click()
      await Promise.resolve()
    })

    expect(attempts).toBe(2)
    expect(view.text()).toContain('切换使用方式')
    expect(view.button('返回，不改')).toBeDefined()

    await view.unmount()
  })

  it('服务器地址有可读标签', async () => {
    const { bridge } = makeBridge({ current: null })
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))

    await act(async () => view.button('连接服务器')?.click())

    const input = view.host.querySelector<HTMLInputElement>('input[type="url"]')
    expect(input?.labels?.[0]?.textContent).toBe('服务器地址')

    await view.unmount()
  })

  it('空地址及空白地址按 Enter 不会绕过按钮禁用', async () => {
    const { bridge, chosen } = makeBridge({})
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))
    await act(async () => view.button('连接服务器')?.click())
    const input = view.host.querySelector<HTMLInputElement>('input[type="url"]')!
    await act(async () => pressEnter(input))
    await act(async () => changeInput(input, '   '))
    await act(async () => pressEnter(input))
    expect(view.button('开始使用')?.disabled).toBe(true)
    expect(chosen).toEqual([])
    await view.unmount()
  })

  it('同帧 Enter 和点击只提交一次，成功后等待 activate 而不重新解锁', async () => {
    const choose = deferred<DesktopModeResult>()
    const url = 'kb.example.com'
    const { bridge, calls } = makeBridge({ current: { mode: 'cloud', cloudUrl: url } })
    const chooseSpy = vi.fn<MimirDesktopBridge['mode']['choose']>(() => choose.promise)
    bridge.mode.choose = chooseSpy
    const { SetupPage, MimirProvider } = await loadPage(bridge)
    const view = await render(MimirProvider, createElement(SetupPage))
    const input = view.host.querySelector<HTMLInputElement>('input[type="url"]')!
    await act(async () => {
      pressEnter(input)
      view.button('切换')?.click()
      pressEnter(input)
    })
    expect(chooseSpy).toHaveBeenCalledExactlyOnceWith({ mode: 'cloud', cloudUrl: url })
    expect(input.disabled).toBe(true)
    expect(view.button('本地使用')?.disabled).toBe(true)
    expect(view.button('返回，不改')?.disabled).toBe(true)
    expect(view.host.querySelector('[role="status"]')?.textContent).toBe('正在连接服务器…')
    expect(view.host.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(calls).not.toContain('activate')

    await act(async () => choose.resolve({ ok: true }))
    expect(calls).toEqual(['activate'])
    expect(view.host.querySelector('[role="status"]')?.textContent).toBe('正在打开…')
    expect(input.disabled).toBe(true)
    await act(async () => pressEnter(input))
    expect(chooseSpy).toHaveBeenCalledTimes(1)
    await view.unmount()
  })

  it.each(['result', 'reject'] as const)(
    '%s 失败保留地址并释放提交入口供原址重试',
    async (kind) => {
      const first = deferred<DesktopModeResult>()
      const retry = deferred<DesktopModeResult>()
      const url = 'kb.example.com/team'
      const { bridge, calls } = makeBridge({ current: { mode: 'cloud', cloudUrl: url } })
      const chooseSpy = vi
        .fn<MimirDesktopBridge['mode']['choose']>()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(retry.promise)
      bridge.mode.choose = chooseSpy
      const { SetupPage, MimirProvider } = await loadPage(bridge)
      const view = await render(MimirProvider, createElement(SetupPage))
      const input = view.host.querySelector<HTMLInputElement>('input[type="url"]')!
      await act(async () => pressEnter(input))
      await act(async () => {
        if (kind === 'result') first.resolve({ ok: false, message: '连接失败，请重试' })
        else first.reject(new Error('IPC 暂时不可用'))
      })
      expect(view.text()).toContain(kind === 'result' ? '连接失败，请重试' : 'IPC 暂时不可用')
      expect(input.value).toBe(url)
      expect(input.disabled).toBe(false)
      expect(view.button('返回，不改')?.disabled).toBe(false)
      expect(view.host.querySelector('[role="status"]')?.textContent).toBe('')
      expect(calls).not.toContain('activate')

      await act(async () => pressEnter(input))
      expect(chooseSpy).toHaveBeenNthCalledWith(2, { mode: 'cloud', cloudUrl: url })
      await act(async () => retry.resolve({ ok: true }))
      expect(calls).toEqual(['activate'])
      await view.unmount()
    },
  )

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
