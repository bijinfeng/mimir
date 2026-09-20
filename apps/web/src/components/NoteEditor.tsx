import type { DocumentDetail } from '@mimir/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Editor } from '@tiptap/core'
import { App, Input, Space, Tag, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { createExtensions } from '@/editor/extensions'
import { api } from '@/lib/api'

/**
 * 笔记编辑器。
 *
 * 三条设计来自原型阶段定下的规则（见 docs/PRD.md §5.9）：
 *  1. 保存状态必须始终可见。文字类产品最让人失去信任的是丢内容。
 *  2. 保存是防抖的，但不能让用户猜「存上了没有」。
 *  3. 有未保存内容时切换文档要拦截。
 *
 * 用命令式的 Editor 而不是 @tiptap/react 的 useEditor：需要精确控制
 * 「内容变更 → 防抖 → 保存 → 状态回写」这条链。外层用 key={document.id}
 * 保证切换文档时整个组件重建。
 *
 * **关于 React Compiler**：本组件不抑制任何 React 规则。
 * 编译器会跳过「抑制了 React 规则」的组件——而抑制规则通常意味着代码
 * 违反了 Rules of React，编译器无法保证优化后行为一致。所以下面用 ref
 * 承接「每次渲染都会变、但只在挂载时用一次」的值，而不是靠 eslint-disable
 * 关掉依赖检查。这样既符合规则，也避免保存回写导致编辑器实例重建（会丢光标）。
 */

const SAVE_DEBOUNCE_MS = 900

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  document: DocumentDetail
  /** 必须传稳定的引用（useCallback 或模块级函数），否则会导致编辑器实例重建 */
  onSaved?: () => void
}

export function NoteEditor({ document: doc, onSaved }: Props) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const mountRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)

  /**
   * 初始值的快照，只在挂载时取一次。
   *
   * 编辑器实例自己维护内容，之后 doc.body 的变化都是保存回写造成的，
   * 不该重建实例。把它放进 effect 依赖会每次保存都重建并丢掉光标位置；
   * 靠 eslint-disable 排除它又会让 React Compiler 跳过整个组件。
   * 用 ref 快照是同时满足两者的做法。
   */
  const initialBodyRef = useRef(doc.body)

  const [title, setTitle] = useState(doc.title)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  /**
   * 让编辑器的 onUpdate 闭包读到最新标题，而不必重建实例。
   *
   * 必须声明在使用它的 effect **之前**：React Compiler 会做不可变性校验，
   * 声明在后面的 ref 会被判成「先使用后定义」而跳过整个组件的优化。
   * 这不报错，只是静默不优化——很难发现。
   */
  const titleRef = useRef(title)
  useEffect(() => {
    titleRef.current = title
  })

  const save = useMutation({
    mutationFn: (input: { title: string; body: string }) => api.documents.update(doc.id, input),
    onSuccess: (updated) => {
      dirtyRef.current = false
      setSaveState('saved')
      onSaved?.()
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.setQueryData(['document', updated.id], updated)
    },
    onError: (error: unknown) => {
      setSaveState('error')
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  /**
   * 把「保存」这条链放进 ref，让建立编辑器的 effect 不必依赖它。
   *
   * 每次渲染后同步一次，effect 里通过 ref 调用，读到的永远是最新的实现。
   * 这是 React 官方认可的「脱离依赖数组」写法：ref 同步本身不产生副作用。
   */
  const persistRef = useRef<(input: { title: string; body: string }) => void>(() => {})

  useEffect(() => {
    persistRef.current = (input) => {
      setSaveState('saving')
      save.mutate(input)
    }
  })

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const editor = new Editor({
      element: mount,
      extensions: createExtensions(),
      content: initialBodyRef.current,
      contentType: 'markdown',
      onUpdate: ({ editor: instance }) => {
        dirtyRef.current = true
        setSaveState('saving')
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          persistRef.current({ title: titleRef.current, body: instance.getMarkdown() })
        }, SAVE_DEBOUNCE_MS)
      },
    })

    editorRef.current = editor
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      editor.destroy()
      editorRef.current = null
    }
  }, [])

  /** 离开页面时的兜底提示。有未保存内容才触发浏览器的原生确认框。 */
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const handleTitleChange = (next: string) => {
    setTitle(next)
    dirtyRef.current = true
    setSaveState('saving')
    persistRef.current({ title: next, body: editorRef.current?.getMarkdown() ?? doc.body })
  }

  const handleRetry = () => {
    persistRef.current({ title, body: editorRef.current?.getMarkdown() ?? doc.body })
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 40px 160px' }}>
      <Space size={8} wrap style={{ marginBottom: 10 }}>
        <Tag bordered={false} color={doc.kind === 'note' ? 'green' : 'blue'}>
          {doc.kind === 'note' ? '笔记' : '资料'}
        </Tag>
        {doc.status === 'inbox' && (
          <Tag bordered={false} color="orange">
            待整理
          </Tag>
        )}
        {doc.tags.map((tag) => (
          <Tag key={tag} bordered={false}>
            {tag}
          </Tag>
        ))}
        <SaveIndicator state={saveState} onRetry={handleRetry} />
      </Space>

      <Input
        variant="borderless"
        value={title}
        onChange={(event) => handleTitleChange(event.target.value)}
        style={{ fontSize: 28, fontWeight: 700, padding: 0, marginBottom: 8 }}
        placeholder="标题"
      />

      <Typography.Text
        type="secondary"
        style={{ fontSize: 12, display: 'block', marginBottom: 20 }}
      >
        {doc.path ?? doc.url ?? '（尚无快照）'}
      </Typography.Text>

      <div className="note-body" ref={mountRef} />
    </div>
  )
}

/** 保存状态指示器。失败时点击可重试——不能只把失败画出来却不给动作。 */
function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const label: Record<SaveState, string> = {
    idle: '',
    saving: '正在保存…',
    saved: '已保存',
    error: '保存失败 · 点此重试',
  }
  const color: Record<SaveState, string | undefined> = {
    idle: undefined,
    saving: '#8b939c',
    saved: '#137333',
    error: '#c5221f',
  }

  if (state === 'idle') return null

  return (
    <Typography.Text
      type={state === 'error' ? 'danger' : 'secondary'}
      style={{
        fontSize: 12,
        color: color[state],
        cursor: state === 'error' ? 'pointer' : 'default',
      }}
      onClick={state === 'error' ? onRetry : undefined}
    >
      {label[state]}
    </Typography.Text>
  )
}
