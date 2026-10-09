import { act, createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 窄屏强制折叠。
 *
 * ## 为什么这个 hook 值得一条测试
 *
 * 它的失败**不是「样式不好看」，而是整个左栏变形**：外壳的 `@media` 把左列压到
 * 48px，而栏内的标签 / 目录树 / 品牌名由这个 hook 决定怎么渲染。两边一旦不一致
 * （这正是修它之前的实际状态），中文标签会**逐字竖排**、品牌名与开关叠在一起
 * ——不报错，只是坏了。所以「它跟着视口走」这件事必须被守住。
 *
 * ## 模块级状态要重新导入
 *
 * `matchMedia` 的替身必须在模块求值**之前**装好（模块在 import 时就创建了
 * `MediaQueryList`），所以每条测试都 `resetModules` 后动态导入——照搬
 * `theme/appearance.test.ts` 的做法，那里踩过同一个坑。
 */

/** 可控的 matchMedia 替身。范围是 `(max-width: 880px)` */
function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: initialMatches,
    media: '(max-width: 880px)',
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener)
    },
  }

  vi.stubGlobal('matchMedia', () => query)

  return {
    /** 模拟窗口被拖窄 / 拉宽 */
    resize(matches: boolean) {
      query.matches = matches
      for (const listener of listeners) listener()
    },
    listenerCount: () => listeners.size,
  }
}

/** 重新导入模块，拿到干净的模块级状态 */
async function freshImport() {
  vi.resetModules()
  return import('./nav-collapse')
}

const mounted: { unmount: () => void }[] = []

afterEach(async () => {
  for (const item of mounted) await act(async () => item.unmount())
  mounted.length = 0
  vi.unstubAllGlobals()
})

/** 挂一个只用这个 hook 的探针，返回它在 DOM 上的文本（'narrow' / 'wide'） */
async function mountProbe(hook: () => boolean): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  function Probe(): ReactElement {
    return createElement('span', null, hook() ? 'narrow' : 'wide')
  }

  await act(async () => {
    root.render(createElement(Probe))
  })
  mounted.push({ unmount: () => root.unmount() })
  return host
}

describe('窄屏强制折叠', () => {
  it('窄视口下第一帧就是折叠——首帧不能是展开态（会闪一下）', async () => {
    installMatchMedia(true)
    const { useForcedNavCollapse } = await freshImport()

    const host = await mountProbe(useForcedNavCollapse)
    expect(host.textContent).toBe('narrow')
  })

  it('窗口被拉宽后跟着展开，且订阅真的挂上了', async () => {
    const media = installMatchMedia(true)
    const { useForcedNavCollapse } = await freshImport()

    const host = await mountProbe(useForcedNavCollapse)
    expect(media.listenerCount()).toBe(1)

    await act(async () => media.resize(false))
    expect(host.textContent).toBe('wide')
  })

  it('拿不到 matchMedia 时按宽屏处理，不抛错', async () => {
    // 极老的浏览器与某些测试环境没有它。这里守的是「一个渲染偏好
    // 不该有能力让整个应用壳渲染不出来」——与 localStorage 那两处同一条规矩
    vi.stubGlobal('matchMedia', undefined)
    const { useForcedNavCollapse } = await freshImport()

    const host = await mountProbe(useForcedNavCollapse)
    expect(host.textContent).toBe('wide')
  })

  it('断点取自 tokens.ts，不在别处再写一个 880', async () => {
    const { NAV_NARROW_BREAKPOINT, NAV_NARROW_QUERY } = await import('../theme/tokens')

    // 宿主与栏内内容必须问同一个宽度：查询串是从那个常量派生的，
    // 而不是模块里另写的字符串（另写就必然有一天只改一处，静默变形）
    expect(NAV_NARROW_QUERY).toBe(`(max-width: ${NAV_NARROW_BREAKPOINT}px)`)
    expect(NAV_NARROW_QUERY).toContain(String(NAV_NARROW_BREAKPOINT))
  })
})
