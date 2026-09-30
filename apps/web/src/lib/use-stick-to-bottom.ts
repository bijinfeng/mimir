import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * 消息区自动跟随（`docs/DESIGN.md` §8.7）。
 *
 * ## 为什么需要它
 *
 * 在这之前 apps/web 对消息区**零 scrollTop 写入**（`DocumentPanel` 与
 * `CommandPalette` 有两处，对话区没有）。于是回答一开始流式、内容一超过
 * 视口高度，用户看到的就是一段不再变化的文字——像卡住了，而它其实还在写。
 *
 * ## 两条规则（不是「永远跳到底」）
 *
 * 1. **自己发出的新消息总是跳到底**：`jumpKey` 变化就无条件跳——用户做了
 *    一个明确的动作，视线应该跟过去。打开既有会话时同理（首次运行也跳）
 * 2. **流式内容只在贴底时跟随**：用户用滚轮 / 拖动滚动条往上走就退出跟随，
 *    之后内容继续长也不会把他拽回底部
 *
 * ## 「是否跟随」是**状态**，不是每次现算的距离
 *
 * 这一条是真浏览器里量出来的（headless Chrome + CDP）：
 *
 *  距底 = scrollHeight - scrollTop - clientHeight，跟随中它恒为 0。
 *  一个 token 在**同一行内**只改宽度不改高度，ResizeObserver 根本不触发；
 *  触发的那一刻是**换行**——内容一次长高**一整行**（实测消息区 40px：
 *  14px × 1.75 的行高再加段落的 margin）。
 *
 * 所以「增长后在回调里重算距底、小于阈值才跟随」会在**第一次换行**时把跟随
 * 关掉：40px 已经越过阈值，而此后的每个 token 都不再改高度、也就再没有回调
 * 来恢复它——用户看到的是「跟了一下，然后就不动了」。
 *
 * 正确形状是把跟随当状态：**ResizeObserver 只看这个状态，不看距离**；
 * 距离只在 scroll 事件里算，而 scroll 事件是「用户在滚」与「我们刚滚过」
 * 共用的入口——后者算出来仍是贴底，状态不变。
 *
 * ## 另外两个容易写错的地方
 *
 *  1. **跟随写 scrollTop 会再触发 scroll**，所以 `update()` 里只在**值真的
 *     变了**才 setState（函数式 setState 返回原值，React 会跳过这次渲染），
 *     否则流式期间就是「token → 滚 → setState → 渲染 → 滚」的自激
 *  2. **ResizeObserver 盯内容，不是盯 scroll**：流式追加 token 不触发
 *     scroll 事件，真正变化的是内容高度。只监听 scroll 的话，「用户停在
 *     中间、回答继续长」这一段不会有任何回调
 *
 * ## 为什么跳转和观察在同一个 effect 里
 *
 * 拆成两个的话，跳转那个的依赖数组里会出现一个**函数体里没读到的**
 * `jumpKey`——`react(exhaustive-effect-dependencies)` 会报 extra dependency，
 * 而它附带的提示正是「React Compiler 跳过了这个 hook 的优化」（`AGENTS.md`
 * 铁律 1 说的那件事）。所以由本 effect 自己比较「上一轮 vs 这一轮」的 key。
 */
export function useStickToBottom(
  /** 滚动容器 */
  scrollerRef: RefObject<HTMLElement | null>,
  /** 滚动容器里的内容列（高度变化由它反映） */
  contentRef: RefObject<HTMLElement | null>,
  /**
   * 无条件跳到底的触发键（用消息条数即可）。
   *
   * 值变化时跳到底并重新进入跟随——它代表「用户自己发出的新消息」。
   */
  jumpKey: string | number,
): { atBottom: boolean; scrollToBottom: () => void } {
  const [atBottom, setAtBottom] = useState(true)
  /** 上一轮跳过的 key。初值 null：**首次运行也跳**（打开会话要看最后一段） */
  const jumpedForRef = useRef<string | number | null>(null)
  /**
   * `atBottom` 的镜像。
   *
   * ResizeObserver 的回调只在 effect 建立时创建一次，闭包里的 `atBottom`
   * 会停在那一刻——长会话里它必然过期。**在事件处理器里写 ref 是合法的**
   * （Rules of React 禁的是渲染期读写），所以 `update()` 一处写、两处读。
   */
  const atBottomRef = useRef(true)

  useEffect(() => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    if (!scroller || !content) return

    const distanceFromBottom = () =>
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight

    const update = () => {
      const next = distanceFromBottom() < FOLLOW_THRESHOLD_PX
      atBottomRef.current = next
      // 函数式 setState：值没变时返回原值，React 会跳过这次渲染。
      // 直接 setAtBottom(next) 也能工作，但每次 scroll 都会重渲染一次
      setAtBottom((current) => (current === next ? current : next))
    }

    // 自己发出的新消息（或首次挂载）→ 无条件跳到底；否则只同步「是否贴底」
    if (jumpedForRef.current !== jumpKey) {
      jumpedForRef.current = jumpKey
      atBottomRef.current = true
      scroller.scrollTop = scroller.scrollHeight
      setAtBottom(true)
    } else {
      update()
    }

    const observer = new ResizeObserver(() => {
      // **只看状态，不看距离** —— 见文件头「换行会一次长一整行」的说明
      if (atBottomRef.current) scroller.scrollTop = scroller.scrollHeight
      update()
    })
    observer.observe(content)
    scroller.addEventListener('scroll', update, { passive: true })

    return () => {
      observer.disconnect()
      scroller.removeEventListener('scroll', update)
    }
  }, [scrollerRef, contentRef, jumpKey])

  const scrollToBottom = () => {
    const scroller = scrollerRef.current
    if (!scroller) return
    atBottomRef.current = true
    scroller.scrollTop = scroller.scrollHeight
    setAtBottom(true)
  }

  return { atBottom, scrollToBottom }
}

/**
 * 「还算贴底」的容差。
 *
 * 不能取 0：滚动位置是小数（浏览器的高 DPI 缩放与 `scrollHeight` 的取整
 * 都会留下零点几像素的差），等于 0 会让「一直在底部」的判定随机失灵。
 *
 * 32px 是**脱离跟随的闸门**，不是「单次增长能有多大」——跟随期间的增长由
 * `atBottomRef` 那个状态兜住（一次长一整行也照样跟）。它要挡的是**用户的
 * 滚动**：一次滚轮在 Chrome 里约 100px，所以 32px 足以让「想往上读」这件事
 * 立刻生效，同时容得下滚动位置的零头。
 */
const FOLLOW_THRESHOLD_PX = 32
