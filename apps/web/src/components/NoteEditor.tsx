import type { DocumentDetail } from '@mimir/shared'
import { useQueryClient } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'
import { App } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useStyles } from '@/components/NoteEditor.style'
import { useContentStyles } from '@/components/ContentTypography.style'
import { InlineToolbar } from '@/components/document/InlineToolbar'
import { createExtensions } from '@/editor/extensions'
import { api } from '@/lib/api'
import { useUnsaved } from '@/lib/unsaved'

/**
 * 笔记的正文编辑器。
 *
 * **只负责正文，不负责标题。** 标题是文档级元数据（它决定文件名，见
 * `lib/vault.ts` 的 `buildNotePath`），由 `DocumentPanel` 用 antd 的
 * `Typography.Title editable` 就地编辑。曾经两处都渲染标题，结果页面上
 * 出现两个一模一样的标题——一个来自面板的 h1，一个来自这里的输入框。
 *
 * ## 为什么用 `@tiptap/react` 而不是 `new Editor()`
 *
 * 手写实例意味着要自己管：创建的时机、销毁的时机、回调闭包读到过期值、
 * 卸载时的清理。这些 `useEditor` 都处理了——
 *
 *  - 它把传入的**每个回调都包一层**，从 `options.current` 读取，所以回调里
 *    放心用最新的 props/state，不需要再用 ref 承接
 *  - `deps` 传空数组时它只 `setOptions` 而不重建实例（保住光标位置）
 *  - `EditorContent` 负责把 DOM 挂进 React 树，卸载时自动清理
 *
 * 用它之后这个组件比手写版短了一截，而且少了两处「必须靠注释提醒自己」
 * 的坑（ref 声明顺序、依赖数组该放什么）。
 *
 * ## 三条设计来自原型阶段（`docs/PRD.md` §5.9）
 *
 *  1. 保存状态必须始终可见。文字类产品最让人失去信任的是丢内容
 *  2. 保存是防抖的，但不能让用户猜「存上了没有」
 *  3. 有未保存内容时切换文档要拦截（拦截在 `lib/unsaved.tsx`）
 */

const SAVE_DEBOUNCE_MS = 900

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  document: DocumentDetail
  /** 标题由面板编辑，保存正文时要带上它 */
  title: string
  /** 「就这段提问」：把选中的话带进对话 */
  onAskAboutSelection?: (passage: string) => void
  /**
   * 保存状态上报，供面板顶部的工具条显示。
   *
   * 工具条在 `DocumentPanel` 里，而保存逻辑在这里——所以状态必须上去。
   * `retry` 一起交出去，是因为「保存失败 · 点此重试」这个动作要用它。
   */
  onSaveStateChange?: (snapshot: { state: SaveState; retry: () => void }) => void
}

export function NoteEditor({
  document: doc,
  title,
  onAskAboutSelection,
  onSaveStateChange,
}: Props) {
  const { styles } = useStyles()
  const { styles: contentStyles } = useContentStyles()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  /**
   * 未保存状态交给**共同祖先**，而不是靠 props 往下传。
   *
   * 这里曾经声明了 `onDirtyChange` / `registerSave` 两个 props，而全仓
   * **没有任何调用方传它们**——于是 `UnsavedGuard` 从来没被武装过。
   * 后果是数据丢失（实测）：输入之后在 900ms 防抖窗口内切换文档，
   * 卸载时定时器被清掉、待保存的那一次写请求再也不会发出，而「有改动
   * 还没保存」的拦截框也不出现——用户以为存上了，实际丢了。
   *
   * 直接从 context 取，与 `lib/unsaved.tsx` 的设计一致（它开头就写着
   * 「脏标记必须提到一个共同祖先，而不是靠编辑器往下传回调」）。
   */
  const { setDirty, setSave } = useUnsaved()

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)

  /**
   * 初始正文，**只取挂载时的那一份**。
   *
   * 编辑器实例自己维护内容，之后 `doc.body` 的变化都是保存回写的回声，
   * 不该灌回编辑器（会丢光标位置）。
   *
   * 用 `useState` 的惰性初始化而不是 `useRef`：这个值要在**渲染期**传给
   * `useEditor`，而渲染期读 ref 会让 React Compiler 拒绝优化这个组件
   * （`react(refs): Cannot access refs during render`，实测报过）。
   * 用 state 表达「这是初始快照」既准确，又避开那个限制。
   */
  const [initialBody] = useState(doc.body)

  /**
   * 编辑器实例。
   *
   * `deps` 传空数组：正文变化（保存回写、查询刷新）**不重建**实例，
   * 否则每次自动保存都会丢光标。切换文档由外层 `key={doc.id}` 处理。
   *
   * 回调里直接用最新的 `saveNow` 与 `title` 就行——`useEditor` 内部把回调
   * 包了一层、从 `options.current` 读，所以它们永远是最新的，不需要 ref 承接。
   */
  const editor = useEditor(
    {
      extensions: createExtensions(),
      content: initialBody,
      contentType: 'markdown',
      onUpdate: () => {
        dirtyRef.current = true
        setDirty(true)
        report('saving')

        // 防抖：连续敲字期间不发请求。到点后走与「重试」同一条保存路径，
        // 于是状态上报与脏标记的处理只有一处，不会两边不一致
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS)
      },
    },
    [],
  )

  /** 一次上报 = 状态 + 当时的重试入口。不使用 effect，避免每次渲染都推一次 */
  const report = (state: SaveState) => {
    onSaveStateChange?.({ state, retry: () => void saveNow() })
  }

  /**
   * 立即保存并返回真实结果。
   *
   * 三处要用它：防抖到点后的自动保存、工具条上的「点此重试」、
   * 以及离开时的「保存并离开」。返回的 promise 必须反映**真实结果**——
   * 拦截框靠它决定放不放行：放行了而实际没存上，比不拦截更糟
   * （`docs/PRD.md` §5.9）。
   *
   * 用普通函数而不是 useCallback：React Compiler 会处理记忆化，
   * 手写反而让人以为有必要（`apps/web/AGENTS.md`）。
   */
  const saveNow = async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    try {
      const updated = await api.documents.update(doc.id, {
        title,
        body: editor?.getMarkdown() ?? initialBody,
      })
      dirtyRef.current = false
      setDirty(false)
      report('saved')
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.setQueryData(['document', updated.id], updated)
      return true
    } catch (error) {
      report('error')
      message.error(error instanceof Error ? error.message : '保存失败')
      return false
    }
  }

  /**
   * `saveNow` 的「最新值 ref」。
   *
   * `saveNow` 每次渲染都是一个新闭包（它读 `title`、`editor`），所以不能直接
   * 进注册 effect 的依赖数组——那会让 effect 每次渲染都拆装一遍，而且
   * `react-hooks/exhaustive-deps` 会（正确地）报出来。把最新的闭包放进 ref，
   * 注册的却是一个**稳定**的转发函数，于是注册只在挂载与卸载时发生。
   *
   * 这正是 `useEditor` 内部对回调做的同一件事（从 `options.current` 读）。
   * 更新 ref 的 effect 声明在注册 effect **之前**——`apps/web/AGENTS.md`
   * 要求 ref 的声明顺序在使用它的 effect 之前，否则 React Compiler 会静默
   * 跳过这个组件。
   */
  const saveNowRef = useRef(saveNow)
  useEffect(() => {
    saveNowRef.current = saveNow
  })

  /**
   * 把「立即保存」交给共同祖先，供「保存并离开」调用。
   *
   * **这是数据丢失的修复点。** 这里原先声明了 `onDirtyChange` /
   * `registerSave` 两个 props 并在此注册，但全仓没有任何调用方传它们——
   * 于是 `UnsavedGuard` 从来没被武装。实测：输入后在 900ms 防抖窗口内
   * 切换文档，卸载时定时器被清掉、待发的写请求再也不会发出，拦截框也不出现，
   * 用户以为存上了、实际丢了。
   */
  useEffect(() => {
    setSave(() => saveNowRef.current())
    return () => {
      setSave(null)
      // 卸载时清掉脏标记：留着它会让下一次导航被一个已经不存在的编辑拦截
      setDirty(false)
    }
  }, [setSave, setDirty])

  /** 卸载时清掉待触发的防抖定时器，免得在已销毁的实例上保存 */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  /** 离开页面时的兜底提示。有未保存内容才触发浏览器的原生确认框 */
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return (
    <div className={styles.shell}>
      <InlineToolbar
        editor={editor}
        onAskAboutSelection={(passage) => onAskAboutSelection?.(passage)}
      />

      {/* EditorContent 负责把编辑器挂进 React 树，并在卸载时清理。
          正文排版与只读视图共用同一个类（ContentTypography.style.ts）——
          两边各写一份已经漂移过 */}
      <EditorContent editor={editor} className={`${styles.body} ${contentStyles.content}`} />
    </div>
  )
}
