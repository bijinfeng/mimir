import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 外观状态：持久化、系统跟随、以及坏输入不炸。
 *
 * ## 为什么这些看起来像「不用测」的东西要测
 *
 * `theme/appearance.ts` 有三个**静默**的失败点，它们都不会报错：
 *
 *  1. 存进 localStorage 的值读回来时没收敛 → 存了个坏值就永远回不到可用状态
 *  2. `localStorage` 抛错没兜住 → 隐私模式下整个应用壳渲染不出来
 *     （一个渲染偏好不该有这种能力）
 *  3. 切到 `auto` 之后不再监听系统变化 → 用户改了系统主题，界面不动
 *
 * 而且这个模块的状态是**模块级**的（`index.html` 的首帧脚本读同一份约定），
 * 所以测试必须重新导入模块才能拿到干净的初始态——`resetModules` 是这里的
 * 关键动作，不是样板。
 */

/** 可控的 matchMedia 替身。范围是 `(prefers-color-scheme: dark)` */
function installMatchMedia(initialDark: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: initialDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener)
    },
  }

  vi.stubGlobal('matchMedia', () => query)

  return {
    /** 模拟操作系统切换深浅色 */
    setSystemDark(dark: boolean) {
      query.matches = dark
      for (const listener of listeners) listener()
    },
    listenerCount: () => listeners.size,
  }
}

/** 重新导入模块，拿到干净的模块级状态 */
async function freshImport() {
  vi.resetModules()
  return import('./appearance')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('外观状态', () => {
  it('默认跟随系统：系统深色时第一帧就是深色', async () => {
    installMatchMedia(true)
    const appearance = await freshImport()

    // 同步可得，不需要等 effect——这是它不用 antd-style 自带 themeMode 的理由：
    // 那个走 setTimeout(…, 1)，首帧会先按浅色渲染再翻成深色（白闪）
    expect(appearance.getThemeMode()).toBe('auto')
    expect(appearance.getAppearance()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('系统浅色时是浅色', async () => {
    installMatchMedia(false)
    const appearance = await freshImport()

    expect(appearance.getAppearance()).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('显式选择会存下来，并在下一次进入时优先于系统', async () => {
    installMatchMedia(false)
    const first = await freshImport()
    first.setThemeMode('dark')

    expect(localStorage.getItem('mimir.appearance')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    // 下一次打开（新模块实例 = 新页面加载），系统仍是浅色，但用户的深色优先
    const second = await freshImport()
    expect(second.getThemeMode()).toBe('dark')
    expect(second.getAppearance()).toBe('dark')
  })

  it('切回跟随系统会重新听系统', async () => {
    const system = installMatchMedia(false)
    const appearance = await freshImport()

    appearance.setThemeMode('dark')
    expect(appearance.getAppearance()).toBe('dark')

    appearance.setThemeMode('auto')
    expect(appearance.getAppearance()).toBe('light')

    // 系统变了要跟着走，而用户的「选择」仍是 auto
    system.setSystemDark(true)
    expect(appearance.getAppearance()).toBe('dark')
    expect(appearance.getThemeMode()).toBe('auto')
  })

  it('存了坏值时回落到跟随系统，而不是卡在一个不认识的值上', async () => {
    localStorage.setItem('mimir.appearance', 'sepia')
    installMatchMedia(true)
    const appearance = await freshImport()

    expect(appearance.getThemeMode()).toBe('auto')
    expect(appearance.getAppearance()).toBe('dark')
  })

  it('localStorage 抛错时不炸，退回跟随系统', async () => {
    // 隐私模式 / 存储被策略禁用时，读取会抛错而不是返回 null
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    installMatchMedia(false)

    const appearance = await freshImport()
    expect(appearance.getAppearance()).toBe('light')

    // 写不进去也只影响「下次记不记得」，这次切换仍然要生效
    expect(() => appearance.setThemeMode('dark')).not.toThrow()
    expect(appearance.getAppearance()).toBe('dark')

    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('订阅者收到变化通知，取消订阅后不再收到', async () => {
    installMatchMedia(false)
    const appearance = await freshImport()

    const seen: string[] = []
    const unsubscribe = appearance.subscribe(() => seen.push(appearance.getAppearance()))

    appearance.setThemeMode('dark')
    appearance.setThemeMode('light')
    expect(seen).toEqual(['dark', 'light'])

    // 重复设同一个值不该产生通知（避免无谓的重渲染）
    appearance.setThemeMode('light')
    expect(seen).toEqual(['dark', 'light'])

    unsubscribe()
    appearance.setThemeMode('dark')
    expect(seen).toEqual(['dark', 'light'])
  })

  it('把外观写到 color-scheme 上', async () => {
    installMatchMedia(false)
    const appearance = await freshImport()

    // 不设它，深色页面上会挂着一根亮色滚动条与亮色原生下拉——
    // 而那些不在我们的样式管辖范围内，改多少 CSS 都盖不住
    expect(document.documentElement.style.colorScheme).toBe('light')
    appearance.setThemeMode('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
