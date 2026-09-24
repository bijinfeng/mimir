import { useSyncExternalStore } from 'react'

/**
 * 主题外观状态 —— 全应用唯一的来源。
 *
 * ## 三个取值，两个概念
 *
 * | 概念 | 取值 | 谁消费 |
 * |---|---|---|
 * | `ThemeMode` 用户的选择 | `auto` / `light` / `dark` | 设置页的控件 |
 * | `Appearance` 实际生效的外观 | `light` / `dark` | `MimirProvider`（决定算法与 token） |
 *
 * 拆开是因为「跟随系统」不能存成一个布尔：用户选了 auto 之后，系统切到深色时
 * 界面要跟着变，而这时**用户的选择没有变**。存成 `light`/`dark` 会在三处出错：
 * 控件显示成「浅色」、系统变化不再被跟踪、也没法回到跟随。
 *
 * ## 为什么在 localStorage 而不是 settings 表
 *
 * 与左栏折叠同一个判断（`routes/_app.tsx`）：它是**纯客户端的渲染偏好**——
 * 服务端一个字节都不用知道，也没有任何服务端逻辑会读它。放进 settings 表
 * 会多出三件坏事：设置页多一条假的「可配置项」（`TECH.md` §7.5 的闭集会被
 * 撑开）、首帧要等一次请求才知道该用哪套色（闪白）、以及同一台机器上
 * 两个浏览器的偏好会互相覆盖。
 *
 * 代价如实写在这里：**换一台设备要重选一次**，因为偏好不跟着账号走。
 * 界面上的说明与这句一致（`AppearanceSection`），不假装它同步了。
 *
 * ## 与 antd-style 的关系
 *
 * antd-style 的 `ThemeProvider` 自己也有 `themeMode` / `appearance` 两套状态，
 * 但它不持久化，而且 `themeMode='auto'` 的首次匹配走 `setTimeout(…, 1)`
 * （见其 `ThemeSwitcher` 实现）——**首帧先按浅色渲染再翻成深色**，深色下
 * 那一下白闪正是要避免的东西。
 *
 * 所以这里自己持有状态，把 `appearance` 作为**受控 prop** 交给它：
 * 受控时它不再自己判断，值就是我们算好的那一个。
 */

export type ThemeMode = 'auto' | 'light' | 'dark'
export type Appearance = 'light' | 'dark'

/** 存储键。`index.html` 的首帧脚本里有一份字符串副本，改动时要同步 */
export const APPEARANCE_STORAGE_KEY = 'mimir.appearance'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * 三个取值的**唯一**清单。校验用 Set（存在性判断），界面用它渲染选项——
 * 两处各写一份时，加一个取值会只改到一处，表现是「存进去了但选不中」。
 */
export const THEME_MODES = ['auto', 'light', 'dark'] as const

const MODE_SET: ReadonlySet<string> = new Set(THEME_MODES)

/**
 * 读偏好。**必须 try/catch**：`localStorage` 在隐私模式或被策略禁用时
 * 读取会**抛错**而不是返回 null，不兜住的话整个应用壳都渲染不出来——
 * 一个渲染偏好不该有这种能力（`routes/_app.tsx` 的同一条）。
 *
 * 存了不认识的值（换过版本、被人手改）时回落到 `auto`，而不是把它当合法值
 * 传下去——否则控件会匹配不上任何一项，界面显示空白且**没有任何报错**。
 */
function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    return MODE_SET.has(stored ?? '') ? (stored as ThemeMode) : 'auto'
  } catch {
    return 'auto'
  }
}

function writeStoredMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, mode)
  } catch {
    // 写不进去只影响「下次打开还记不记得」，不该影响这次切换
  }
}

/**
 * 系统偏好。
 *
 * `matchMedia` 在极老的浏览器与某些测试环境里不存在，所以先判存在性；
 * 拿不到就当浅色——这是这份界面的原始外观，也是最不容易出错的一侧。
 */
function detectSystem(): Appearance {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

let mode: ThemeMode = readStoredMode()
let system: Appearance = detectSystem()
let appearance: Appearance = mode === 'auto' ? system : mode

const listeners = new Set<() => void>()

/**
 * 把外观写到 `html` 上。
 *
 * - `data-theme`：**只作**观测与调试用（`document.documentElement` 上能直接看到
 *   当前是哪一套）。颜色本身由 token 承担，没有任何样式规则去选它——
 *   加一条 `[data-theme='dark'] .foo` 就等于把「两套外观」变成第三处判断
 * - `color-scheme`：**必须设置**。它决定滚动条、`<select>` 的下拉、表单控件
 *   与默认背景由浏览器按哪一侧渲染。不设的话深色页面上会挂着一根亮色滚动条，
 *   而它不在我们的样式管辖范围内——改多少 CSS 都盖不住
 */
function syncDocument(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = appearance
  root.style.colorScheme = appearance
}

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * 把当前 `mode` + `system` 的结果落到 `appearance` 上，并通知订阅者。
 *
 * **顺序是关键：先更新状态，再通知。** 反过来的话订阅者拿到的快照还是旧的，
 * React 会渲染一帧过期值——而这次触发正是要它重渲染。
 *
 * 每次都通知（即使 appearance 没变）：`mode` 也是一份快照，
 * 「auto → light」在系统本来就是浅色时外观不变，但控件要跟着变。
 */
function apply(): void {
  const next: Appearance = mode === 'auto' ? system : mode
  if (next !== appearance) {
    appearance = next
    syncDocument()
  }
  emit()
}

/**
 * 监听系统偏好。**在模块初始化时就开始**，不等第一次订阅——
 * 「跟随系统」的语义是用户改了系统主题界面就变，而不是「有人订阅时才变」。
 */
function watchSystem(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  const query = window.matchMedia(DARK_QUERY)
  if (typeof query.addEventListener !== 'function') return
  query.addEventListener('change', () => {
    system = query.matches ? 'dark' : 'light'
    apply()
  })
}

syncDocument()
watchSystem()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 当前生效的外观。快照是字符串，比较稳定，不会引起多余的重渲染 */
export function getAppearance(): Appearance {
  return appearance
}

/** 用户的选择（可能是 `auto`） */
export function getThemeMode(): ThemeMode {
  return mode
}

export function setThemeMode(next: ThemeMode): void {
  if (next === mode) return
  mode = next
  writeStoredMode(next)
  apply()
}

/**
 * 生效外观。`MimirProvider` 用它选 token，组件用它选那些 antd 没有的
 * 分支（如来源徽标的两套色对）。
 */
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getAppearance)
}

/** 设置页的控件用。`setMode` 是稳定引用，可以安全地进依赖数组 */
export function useThemeMode(): { mode: ThemeMode; setMode: (next: ThemeMode) => void } {
  const current = useSyncExternalStore(subscribe, getThemeMode)
  return { mode: current, setMode: setThemeMode }
}
