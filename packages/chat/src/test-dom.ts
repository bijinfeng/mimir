/**
 * 测试环境的垫片（**只给测试用**，不从 `index.ts` 导出）。
 *
 * ## 为什么需要它
 *
 * 这个包的组件在 happy-dom 里跑起来缺四样东西，**缺一不可**——都是静默的：
 *
 *  - `ResizeObserver`：引擎的 viewport 用它做自动跟随与滚动状态
 *  - `IntersectionObserver`：同上（不同版本用不同的观察器）
 *  - `requestAnimationFrame`：`ScrollToBottom` 与几处动画走它
 *  - `matchMedia`：`antd` 的响应式（Grid / 断点）与外观探测
 *
 * happy-dom 对前两个**没有实现**（抛 `not a constructor`），后两个有但
 * 行为不同（rAF 的调度时机与浏览器不一致）。所以测试文件顶部 import 它、
 * 直接调用 `installDomShims()` 即可——与 `@mimir/office` 的
 * `test-dom`（`antd-test-dom.ts`）同一条做法。
 *
 * ## 什么时候调用
 *
 * 在 import 被测组件**之前**（模块顶层）。放在 `beforeAll` 里太晚：
 * 组件模块在 import 时就会读 `window`。
 *
 * ```ts
 * import { installDomShims } from '../test-dom.js'
 * installDomShims()
 * ```
 *
 * ## 为什么 rAF 用 setTimeout 而不是同步回调
 *
 * 同步回调会让「等待一帧」变成递归调用栈（React 的调度器会撞上无限递归）。
 * `setTimeout(fn, 0)` 是**等这次渲染落地**的通行做法（本仓记过同一条：
 * 后台标签页里 rAF 根本不派发，见`.trellis/spec/project/pitfalls.md` 的坑表）。
 */
/* rAF：happy-dom 有，但它绑在它自己的 window 上；组件里调用
   `window.requestAnimationFrame` 时可能落到 window 而不是 globalThis。
   两边都补一次——同一个实现，提到模块级（否则会命中
   `unicorn(consistent-function-scoping)`） */
const raf = (callback: FrameRequestCallback): number =>
  setTimeout(() => {
    callback(performance.now())
  }, 0) as unknown as number
const cancel = (handle: number): void => {
  clearTimeout(handle)
}

export function installDomShims(): void {
  const global = globalThis as Record<string, unknown>

  /**
   * `act()` 的环境标记。**必须在这里设**，而且必须在测试文件**最前面**
   * （组件 import 之前）——React 在模块初始化时读它，设晚了整轮测试都会
   * 打「The current testing environment is not configured to support act(...)」，
   * 而那句话的后果是**状态更新不落地**：断言读到的是上一帧的 DOM，
   * 看起来像「组件没反应」。
   */
  global.IS_REACT_ACT_ENVIRONMENT = true

  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  }

  if (typeof global.IntersectionObserver === 'undefined') {
    global.IntersectionObserver = class IntersectionObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): [] {
        return []
      }
    }
  }

  global.requestAnimationFrame = raf
  global.cancelAnimationFrame = cancel
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame = raf
    window.cancelAnimationFrame = cancel
  }

  /* matchMedia：happy-dom 实现了它，但 `matches` 恒为 false。
     组件不依赖具体断点（本仓的断点判断在宿主的导航里），
     这里只需保证它**能返回一个对象**。 */
  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
}
