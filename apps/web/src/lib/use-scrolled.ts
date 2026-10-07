import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * 滚动容器「是否已经离开顶部」——固定区分隔线的显形开关（D-070）。
 *
 * Notion 式去线：界面上不画常驻的分割线，分组交给留白与标签、分区交给
 * 底色。但「固定区 vs 滚动内容」的边界在线消失后只剩不透明裁切，内容
 * 滚动、开始被切断的那一刻需要一道线说明边界——所以这些线改成
 * **滚动才显形**：`scrollTop > 0` 时淡入，回到顶部就淡出。静态下
 * （包括刚进页面、内容未动时）界面上没有任何线。
 *
 * 用法：`data-scrolled={scrolled || undefined}` 挂在**画线的那一个元素**上，
 * CSS 里 `&[data-scrolled] { border-…-color: … }`（默认透明 + transition）。
 *
 * ## 它与 `packages/chat/src/hooks/use-scrolled.ts` 是**两份**
 *
 * 不是笔误：对话包带了自己的一份（它 import 不到宿主）。这个文件留给宿主
 * 自己的使用方——列表页、文档详情、导航侧栏的固定区都用它。
 * 「一份实现两处放」在这里是必要的代价（29 行、无依赖、纯 DOM 事件），
 * 比「让宿主去依赖一个 UI 包里的工具函数」更容易解释。
 */
export function useScrolled(ref: RefObject<HTMLElement | null>): boolean {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const update = () => setScrolled((ref.current?.scrollTop ?? 0) > 0)
    update()
    /* scroll 不冒泡，但在 document 上开捕获能收到所有滚动容器的变化——
       ref 指向的元素晚挂载（详情页先渲染加载态）也能接上 */
    document.addEventListener('scroll', update, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', update, { capture: true })
  }, [ref])

  return scrolled
}
