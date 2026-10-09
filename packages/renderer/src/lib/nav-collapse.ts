import { useSyncExternalStore } from 'react'
import { NAV_NARROW_QUERY } from '../theme/tokens'

/**
 * 窄屏（≤880px）吗。
 *
 * 这个断点决定三件事，它们问的是**同一个** matchMedia：
 *
 *  1. 左导航是否被视口强制折叠（`routes/_app.tsx`）
 *  2. 设置页的分区导航换成下拉（`routes/_app.settings.tsx`）
 *  3. 文档大纲是否渲染（`components/DocumentPanel.tsx`——窄屏下正文
 *     减去大纲列只剩约 150px，实测一行约 7 个字）
 *
 * ## 它解决的是什么
 *
 * `docs/DESIGN.md` §5.5 规定 ≤880px 时导航折叠成 48px 图标条。原先这件事只在
 * 外壳的 CSS 里做（`@media` 改 `grid-template-columns`），而栏内的**内容**
 * 仍按 `navCollapsed` 这份用户偏好渲染——于是窄屏下标签、目录树、品牌名被塞
 * 进 48px 里逐字换行（实测：「知识库」竖成一列、品牌名与折叠开关叠在一起）。
 *
 * 一个「栏是 48px 宽」的界面，必须让**渲染栏的那个人**也知道这件事：
 * 网格的宽度和内容的形态是同一件事的两半，分开决定就一定会错开。
 *
 * ## 与手动折叠的关系
 *
 * `useForcedNavCollapse` 返回的是「**视口强制的**折叠」，与 `localStorage`
 * 里那份用户偏好是两回事：偏好照常保存，窄屏下被这个返回值压过
 * （`collapsed = 偏好 || 强制`），窗口变宽后偏好原样生效。所以它不写任何
 * 持久化状态。
 *
 * ## 为什么用 `useSyncExternalStore` 而不是 `useState` + `useEffect`
 *
 * 与 `theme/appearance.ts` 同一个理由：**首帧就要是对的**。走 effect 的话，
 * 窄窗口打开时会先按展开态渲染一帧再收起来——用户看到的是一次闪现。
 * `matchMedia` 是同步可读的，没有理由分两帧。
 *
 * `matchMedia` 在极老的浏览器与某些测试环境里不存在，那时按宽屏处理：
 * 这是展开态，也是这份界面的默认形态。
 */
const media =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NAV_NARROW_QUERY)
    : null

function subscribe(listener: () => void): () => void {
  // 老实现（Safari < 14）只有 addListener，没有 addEventListener。
  // 拿不到订阅能力就退化成「只在挂载时读一次」——比抛错好。
  if (!media || typeof media.addEventListener !== 'function') return () => {}
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

function getSnapshot(): boolean {
  return media?.matches ?? false
}

export function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * 左导航强制折叠。**与 `useNarrowViewport` 同一个事实**，名字留给导航
 * 那一处：读 `_app.tsx` 时「导航为什么收起」比「视口窄不窄」更接近意图。
 */
export function useForcedNavCollapse(): boolean {
  return useNarrowViewport()
}
