import type { DocumentDetail } from '@mimir/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { EditorContent, useEditor } from '@tiptap/react'
import { App, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useIndicatorStyles, useStyles } from '@/components/NoteEditor.style'
import { InlineToolbar } from '@/components/document/InlineToolbar'
import { createExtensions } from '@/editor/extensions'
import { api } from '@/lib/api'

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
  /** 脏标记上报。提到外层是因为「离开」的触发点在导航、列表、命令面板 */
  onDirtyChange?: (dirty: boolean) => void
  /** 注册「立即保存」的入口，供「保存并离开」调用 */
  registerSave?: (save: (() => Promise<boolean>) | null) => void
  /** 标题由面板编辑，保存正文时要带上它 */
  title: string
  /** 「就这段提问」：把选中的话带进对话 */
  onAskAboutSelection?: (passage: string) => void
}

export function NoteEditor({
  document: doc,
  onDirtyChange,
  registerSave,
  title,
  onAskAboutSelection,
}: Props) {
  const { styles } = useStyles()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')

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

  const save = useMutation({
    mutationFn: (body: string) => api.documents.update(doc.id, { title, body }),
    onSuccess: (updated) => {
      dirtyRef.current = false
      setSaveState('saved')
      onDirtyChange?.(false)
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.setQueryData(['document', updated.id], updated)
    },
    onError: (error: unknown) => {
      setSaveState('error')
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  /**
   * 编辑器实例。
   *
   * `deps` 传空数组：正文变化（保存回写、查询刷新）**不重建**实例，
   * 否则每次自动保存都会丢光标。切换文档由外层 `key={doc.id}` 处理。
   *
   * 回调里直接用 `save` 与 `title` 就行——`useEditor` 内部把回调包了一层、
   * 从 `options.current` 读，所以它们永远是最新的，不需要 ref 承接。
   */
  const editor = useEditor(
    {
      extensions: createExtensions(),
      content: initialBody,
      contentType: 'markdown',
      onUpdate: ({ editor: instance }) => {
        dirtyRef.current = true
        onDirtyChange?.(true)
        setSaveState('saving')

        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          save.mutate(instance.getMarkdown())
        }, SAVE_DEBOUNCE_MS)
      },
    },
    [],
  )

  /**
   * 把「立即保存」注册到外层，供「保存并离开」使用。
   *
   * 返回的 promise 要反映**真实结果**：外层靠它决定放不放行。
   * 保存失败返回 false，用户留在原地——放行的话他会以为存上了，
   * 实际丢了，比不拦截更糟（`docs/PRD.md` §5.9）。
   */
  useEffect(() => {
    if (!registerSave || !editor) return

    registerSave(async () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      try {
        await api.documents.update(doc.id, { title, body: editor.getMarkdown() })
        dirtyRef.current = false
        setSaveState('saved')
        onDirtyChange?.(false)
        void queryClient.invalidateQueries({ queryKey: ['documents'] })
        return true
      } catch (error) {
        setSaveState('error')
        message.error(error instanceof Error ? error.message : '保存失败')
        return false
      }
    })

    return () => registerSave(null)
  }, [registerSave, editor, doc.id, title, queryClient, message, onDirtyChange])

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
      <div className={styles.saveRow}>
        <SaveIndicator
          state={saveState}
          onRetry={() => save.mutate(editor?.getMarkdown() ?? initialBody)}
        />
      </div>

      <InlineToolbar
        editor={editor}
        onAskAboutSelection={(passage) => onAskAboutSelection?.(passage)}
      />

      {/* EditorContent 负责把编辑器挂进 React 树，并在卸载时清理 */}
      <EditorContent editor={editor} className={styles.body} />
    </div>
  )
}

/** 保存状态指示器。失败时点击可重试——不能只把失败画出来却不给动作 */
function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const { styles } = useIndicatorStyles(state)
  const label: Record<SaveState, string> = {
    idle: '',
    saving: '正在保存…',
    saved: '已保存',
    error: '保存失败 · 点此重试',
  }

  if (state === 'idle') return null

  return (
    <Typography.Text
      type={state === 'error' ? 'danger' : 'secondary'}
      className={styles.indicator}
      onClick={state === 'error' ? onRetry : undefined}
    >
      {label[state]}
    </Typography.Text>
  )
}
