import { makeUpdateBridge } from '@/update/test-bridge'
import { MimirProvider } from '@mimir/renderer/titlebar-kit'
import type { DesktopPlatform, MimirDesktopBridge } from '@mimir/shared/desktop'
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const noop = () => {}

/**
 * 自绘标题栏的渲染（D-094 / D-103）。
 *
 * ## 为什么这几条值得测
 *
 * 标题栏是**插槽注入的产物**：桌面端给它、浏览器端给 null。它坏掉的方式
 * 全是静默的——窗口里少一条 chrome、或者按钮在那儿但点不动，而两者都不报错。
 * 代码推断也看不出来（这正是 D-094 把「拖动区 / no-drag」记进坑表的原因）。
 *
 * 四条断言各对应一个真实踩过或被明确否决过的形态：
 *
 *  1. **每个可点元素都带 `me-no-drag`** —— 漏标的表现是「按钮点不动」，
 *     不报错、控制台也没有任何东西。这是方案 C 被否掉的理由
 *  2. **macOS 不画那三枚控件** —— 系统红绿灯已经在左上角，右边再来三枚
 *     就是两套窗口控件
 *  3. **Windows / Linux 画三枚，且点击真的发出对应动作** —— 它们是窗口
 *     唯一的关闭/最小化入口（`frame: false`）
 *  4. **最大化图标跟随宿主状态** —— 状态是订阅来的而不是自己记的，
 *     自己记必然与真相脱节（双击标题栏、系统快捷键、贴靠都会改它）
 *
 * ## 为什么不截图
 *
 * 本机是 Wayland，`scrot` 抓不到 Electron 的窗口内容（实测截出来是空的）。
 * 这几条断言守的是同一批东西里**能被机器守住**的那部分，且它每次 CI 都在跑，
 * 比一张一次性的截图留得住。纯视觉的部分（红底白字的关闭态、mac 的让位距离）
 * 仍然要靠人看一眼，见 D-094 的验证方式。
 */

/** 可点元素必须显式标注的类名（与样式里的 `-webkit-app-region: no-drag` 配对） */
const NO_DRAG = 'me-no-drag'

function makeBridge(platform: DesktopPlatform, maximized = false) {
  const calls: string[] = []
  let listener: ((value: boolean) => void) | undefined

  const bridge: MimirDesktopBridge = {
    update: makeUpdateBridge().api,
    /*
     * boot / quit / mode 只是为了凑齐桥的契约——标题栏一个都不碰，
     * 所以这里给的是普通桩函数而不是 spy（没有要断言的调用）。
     */
    boot: async () => null,
    quit: noop,
    mode: {
      get: async () => null,
      choose: async () => ({ ok: true as const }),
      activate: noop,
      openSetup: noop,
    },
    window: {
      platform,
      minimize: () => calls.push('minimize'),
      toggleMaximize: () => calls.push('toggleMaximize'),
      close: () => calls.push('close'),
      isMaximized: async () => maximized,
      onMaximizeChange: (fn) => {
        listener = fn
        return () => {
          listener = undefined
        }
      },
    },
  }

  return { bridge, calls, emitMaximize: (value: boolean) => listener?.(value) }
}

/**
 * 装好桥再 import 组件。
 *
 * `desktop-bridge.ts` 在**模块求值时**读一次 `window.mimirDesktop`（那是刻意的：
 * preload 在首帧前注入，写成 hook 会多一帧抖动）。所以必须先设全局、
 * 再动态 import，且每次用 `resetModules` 拿一份新的模块实例。
 */
async function loadTitleBar(bridge: MimirDesktopBridge) {
  vi.resetModules()
  ;(window as Window & { mimirDesktop?: MimirDesktopBridge }).mimirDesktop = bridge
  return (await import('./TitleBar')).TitleBar
}

async function render(element: ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  await act(async () => {
    root.render(createElement(MimirProvider, null, element))
  })

  return {
    host,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

afterEach(() => {
  delete (window as Window & { mimirDesktop?: MimirDesktopBridge }).mimirDesktop
})

describe('自绘标题栏', () => {
  it('每个可点元素都标了 no-drag（漏标的表现是「按钮点不动」且不报错）', async () => {
    const { bridge } = makeBridge('linux')
    const TitleBar = await loadTitleBar(bridge)
    const { host, unmount } = await render(
      createElement(TitleBar, { collapsed: false, showToggle: true, onToggleCollapsed: noop }),
    )

    const clickable = [...host.querySelectorAll('button')]
    // 折叠开关 + 三枚窗口控件
    expect(clickable).toHaveLength(4)
    for (const button of clickable) {
      expect(
        button.className,
        `「${button.getAttribute('aria-label')}」漏了 ${NO_DRAG}，点击会被当成拖窗口`,
      ).toContain(NO_DRAG)
    }

    await unmount()
  })

  it('macOS 不画那三枚控件（系统红绿灯已经在左上角）', async () => {
    const { bridge } = makeBridge('darwin')
    const TitleBar = await loadTitleBar(bridge)
    const { host, unmount } = await render(
      createElement(TitleBar, { collapsed: false, showToggle: true, onToggleCollapsed: noop }),
    )

    expect(host.querySelector('[data-platform]')?.getAttribute('data-platform')).toBe('darwin')
    // 只剩折叠开关
    expect(host.querySelectorAll('button')).toHaveLength(1)
    expect(host.querySelector('[aria-label="关闭"]')).toBeNull()

    await unmount()
  })

  it('三枚控件点下去真的发出对应动作（它们是关窗唯一入口）', async () => {
    const { bridge, calls } = makeBridge('win32')
    const TitleBar = await loadTitleBar(bridge)
    const { host, unmount } = await render(
      createElement(TitleBar, { collapsed: false, showToggle: false, onToggleCollapsed: noop }),
    )

    for (const label of ['最小化', '最大化', '关闭']) {
      const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
      expect(button, `找不到「${label}」`).not.toBeNull()
      await act(async () => button?.click())
    }

    expect(calls).toEqual(['minimize', 'toggleMaximize', 'close'])

    await unmount()
  })

  it('最大化图标跟随宿主推送的状态（而不是自己记一个布尔值）', async () => {
    const { bridge, emitMaximize } = makeBridge('linux', false)
    const TitleBar = await loadTitleBar(bridge)
    const { host, unmount } = await render(
      createElement(TitleBar, { collapsed: false, showToggle: false, onToggleCollapsed: noop }),
    )

    expect(host.querySelector('[aria-label="最大化"]')).not.toBeNull()

    // 宿主侧改变（双击标题栏 / 系统快捷键 / 贴靠都走这条路）
    await act(async () => emitMaximize(true))

    expect(host.querySelector('[aria-label="向下还原"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="最大化"]')).toBeNull()

    await unmount()
  })

  it('窄屏不渲染折叠开关（那个宽度下点了也不会展开）', async () => {
    const { bridge } = makeBridge('linux')
    const TitleBar = await loadTitleBar(bridge)
    const { host, unmount } = await render(
      createElement(TitleBar, { collapsed: false, showToggle: false, onToggleCollapsed: noop }),
    )

    expect(host.querySelector('[aria-label="折叠侧边栏"]')).toBeNull()
    // 三枚窗口控件仍然在
    expect(host.querySelectorAll('button')).toHaveLength(3)

    await unmount()
  })
  it('状态入口跟随推送，点击只打开详情且保持 no-drag', async () => {
    const { bridge } = makeBridge('linux')
    const update = makeUpdateBridge({ status: 'downloading' })
    bridge.update = update.api
    const TitleBar = await loadTitleBar(bridge)
    const { host, unmount } = await render(
      createElement(TitleBar, { collapsed: false, showToggle: false, onToggleCollapsed: noop }),
    )
    const entry = host.querySelector<HTMLButtonElement>('[aria-label="更新下载中，查看软件更新"]')
    expect(entry?.className).toContain(NO_DRAG)
    await act(async () => entry?.click())
    expect(update.calls).toEqual(['open'])
    await act(async () => update.emit({ status: 'downloaded' }))
    expect(host.querySelector('[aria-label="可重启更新，查看软件更新"]')).not.toBeNull()
    await unmount()
  })
})
