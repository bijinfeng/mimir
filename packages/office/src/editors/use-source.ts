/**
 * 取原件 → 编辑 → 写回。四种编辑器共用的这一段。
 *
 * ## 它统一掉的是什么
 *
 * 改之前三种格式各写了一遍这套流程，而且**三份都不一样**：
 * docx 用 `message.success` 弹提示、xlsx 用顶栏的 Tag 说「未保存」、
 * pptx 用另一个 Tag。同一件事三种说法——统一的第一步是让它只有一处实现。
 *
 * 现在保存状态落在**状态行**上（`已修改 / 保存中… / 已保存 / 保存失败 · 重试`），
 * 与办公软件一致：Word 也是把保存状态放在状态栏，而不是弹窗。
 *
 * ## 两个容易写错的地方
 *
 * ### 1. `io` 不能进加载 effect 的依赖
 *
 * 宿主传进来的 `io` 是对象字面量，每次渲染都是新引用；写进依赖数组会让
 * 「加载 → setState → 重渲染 → 重新加载」无限循环。但把 `io` 从依赖里去掉
 * 又会被 `react-hooks/exhaustive-deps` 拦下，而**抑制 React 规则是禁止的**
 * （`.trellis/spec/project/rules.md` 铁律 1：编译器会静默跳过整个组件）。
 *
 * 所以用 ref 承接最新值、注册一个稳定的转发函数——`NoteEditor` 里
 * `saveNowRef` 是同一个手法。ref 的更新 effect 声明在加载 effect **之前**。
 *
 * ### 2. 卸载后不能再 setState
 *
 * 解析大文件要几百毫秒，用户可能在解析完之前就切走了。用 `cancelled` 旗子
 * 挡住——不加的话 React 会警告，而更糟的是**旧文档的结果会盖到新文档上**。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EditorIo, SaveTarget } from './types.js'

export interface SourceHandle {
  /** 原件字节。null 表示还在读 */
  bytes: Uint8Array | null
  /** 读取失败的原因（显示在状态行） */
  loadError: string | null
  /** 正在写回 */
  saving: boolean
  /** 写回失败的原因 */
  saveError: string | null
  /** 本次打开以来成功保存过几次。0 表示还没保存过 */
  saveCount: number
  /** 写回。返回是否成功——调用方据此决定要不要 `commit()` */
  save: (bytes: Uint8Array, target: SaveTarget) => Promise<boolean>
  /** 重试读取（读了失败时给用户一个动作，而不是只把失败画出来） */
  reload: () => void
}

export function useSource(io: EditorIo, documentId: string): SourceHandle {
  /**
   * 读到的东西，以及**它是为哪一份文档、哪一次尝试读的**。
   *
   * 把这三个放在同一个 state 里是刻意的：分开存（`bytes` + `loading` 两个
   * state）就会出现「换文档了但 bytes 还是旧的」那一帧，界面会在那一帧里
   * 渲染上一篇的内容。把身份一起存下来，加载态就是在渲染期**导出的**
   * （比较身份），不存在中间帧，也不需要 `loading` 这个 state。
   */
  const [loaded, setLoaded] = useState<{
    documentId: string
    attempt: number
    bytes: Uint8Array | null
    error: string | null
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveCount, setSaveCount] = useState(0)
  const [attempt, setAttempt] = useState(0)

  /** 最新的 `io`。理由见文件顶部第 1 条 */
  const ioRef = useRef(io)
  useEffect(() => {
    ioRef.current = io
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await ioRef.current.load()
        if (cancelled) return
        setLoaded({ documentId, attempt, bytes: next, error: null })
      } catch (cause) {
        if (!cancelled) setLoaded({ documentId, attempt, bytes: null, error: messageOf(cause) })
      }
    })()

    return () => {
      cancelled = true
    }
    /**
     * **依赖只有这两个**，`io` 不进依赖数组（理由见文件顶部第 1 条：
     * 它是每次渲染新建的对象，写进去会无限重新加载）。`documentId` 变了要
     * 重新读；`attempt` 变了是用户点了「重试」。
     */
  }, [documentId, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  /**
   * 「读取中」与「读完了」由**同一次尝试**判定，而不是在 effect 里先清空
   * state。
   *
   * 原先的写法是在 effect 开头 `setBytes(null)` 清掉上一次的结果——那是
   * 在 effect 里同步 setState（lint 报 `set-state-in-effect`，而且它的理由
   * 是对的：那次 setState 会立刻触发一轮额外渲染，而这一轮渲染的内容
   * 「还没有结果」完全可以**在渲染时算出来**）。
   *
   * 现在只在拿到结果时 setState 一次，加载中用「快照的身份 ≠ 当前的身份」
   * 在渲染期导出——没有多余的渲染，也没有「旧文档的字节还留着」那一帧。
   *
   * 身份是 `documentId` + `attempt` **两个**：只比 attempt 的话，换文档时
   * （attempt 仍是 0）上一篇的字节会被当成当前的结果。宿主一般用 `key={id}`
   * 让编辑器整体重建，但那条约定不该是这个 hook 正确性的前提。
   */
  const settled =
    loaded !== null && loaded.documentId === documentId && loaded.attempt === attempt
      ? loaded
      : null
  const bytes = settled?.bytes ?? null
  const loadError = settled?.error ?? null

  const save = useCallback(async (next: Uint8Array, target: SaveTarget): Promise<boolean> => {
    setSaving(true)
    setSaveError(null)
    try {
      await ioRef.current.save(next, target)
      setSaveCount((n) => n + 1)
      setSaving(false)
      return true
    } catch (cause) {
      setSaveError(messageOf(cause))
      setSaving(false)
      return false
    }
    /**
     * 空依赖：保存做的事（写字节 + 记状态）不依赖任何渲染期变量——
     * `io` 与 `target` 都从 ref / 参数来。依赖数组里放 `io` 会让宿主每次
     * 渲染都换一个新的 save 引用，而下游把它当依赖就会跟着重跑。
     */
  }, [])

  return { bytes, loadError, saving, saveError, saveCount, save, reload }
}

/** 状态行左侧显示什么。四种编辑器共用同一套措辞 */
export function statusText(input: {
  handle: Pick<SourceHandle, 'loadError' | 'saving' | 'saveError' | 'saveCount'>
  /** 有没有未保存的改动 */
  dirty: boolean
  /** 没在保存也没改动时显示什么（如「5 页」「3 张表」） */
  idle: string
}): string {
  const { handle, dirty, idle } = input
  if (handle.loadError !== null) return `读取失败：${handle.loadError}`
  if (handle.saving) return '保存中…'
  if (handle.saveError !== null) return `保存失败：${handle.saveError}`
  if (dirty) return '已修改，未保存'
  if (handle.saveCount > 0) return '已保存'
  return idle
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * 解析原件字节，并把结果与**它解析的是哪一份字节**绑在一起。
 *
 * ## 为什么要有这个 hook，而不是每个编辑器各写一遍
 *
 * 三种格式（docx / xlsx / pptx）打开时的形状完全一样：
 *
 * ```
 * 字节到了 → 异步解析 → setState 结果
 * ```
 *
 * 而各写一遍会踩同一个坑：**在 effect 开头 `setParseError(null)` 清上一次的
 * 错误**。那是一次同步 setState，会多触发一轮渲染（lint 报
 * `set-state-in-effect`，理由也对），而且那一轮里界面处于「既没有 session
 * 也没有错误」的状态——看起来像卡住了。
 *
 * 正确做法是**不存「解析中」这个状态**，而是用「结果指向的字节是不是当前
 * 这一份」在渲染期导出它。于是没有中间帧，也没有多余的渲染。
 *
 * ## `parse` 不进依赖数组
 *
 * 调用方传进来的解析函数每次渲染都是新的闭包（它读 props）。写进依赖数组
 * 会让解析在每次渲染后重跑一遍——大文档上是灾难性的（几百毫秒的同步活）。
 * 所以用 ref 承接，注册一个稳定的转发（与 `useSource` 里 `io` 同一个手法）。
 */
export interface ParsedHandle<T> {
  /** 解析结果。null 表示「这一份字节还没解析出结果」 */
  value: T | null
  /** 解析失败的原因 */
  error: string | null
  /** 已经拿到结果（成功或失败）——用于区分「解析中」与「解析完了」 */
  done: boolean
}

export function useParsed<T>(
  bytes: Uint8Array | null,
  parse: (bytes: Uint8Array) => Promise<T>,
): ParsedHandle<T> {
  /**
   * 结果与**它是哪一份字节的结果**。放在同一个 state 里而不是分开两个：
   * 分开存就会出现「换文件了但结果还是旧的」那一帧。
   */
  const [parsed, setParsed] = useState<{
    source: Uint8Array
    value: T | null
    error: string | null
  } | null>(null)

  const parseRef = useRef(parse)
  useEffect(() => {
    parseRef.current = parse
  })

  useEffect(() => {
    if (!bytes) return
    let cancelled = false
    void (async () => {
      try {
        const value = await parseRef.current(bytes)
        if (!cancelled) setParsed({ source: bytes, value, error: null })
      } catch (cause) {
        if (!cancelled) setParsed({ source: bytes, value: null, error: messageOf(cause) })
      }
    })()
    return () => {
      cancelled = true
    }
    /** 只依赖字节：换文件（或重试读到新字节）才重新解析 */
  }, [bytes])

  /** 结果指向的就是当前这份字节吗。不是 → 还没解析完 */
  const settled = parsed && parsed.source === bytes ? parsed : null
  return {
    value: settled?.value ?? null,
    error: settled?.error ?? null,
    done: settled !== null,
  }
}
