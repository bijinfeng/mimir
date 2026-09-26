/**
 * markdown 笔记的编辑器（原 `apps/web` 的 `NoteEditor`）。
 *
 * ## 为什么它在 office 包里
 *
 * 四种编辑器（docx / xlsx / pptx / markdown）的**外壳必须长得一样**——
 * 这是 D-054 的全部理由。而「一样」只能由同一份实现保证：各写一份的话漂移
 * 是必然的，且只在用户眼里看得出来。所以外壳、工具条、状态行都在这里，
 * 与另外三种共用同一套原语。
 *
 * ## 两条刻意的边界
 *
 * 这个组件**不拥有**两样东西，它们由宿主注入：
 *
 * | 什么 | 为什么留在宿主 |
 * |---|---|
 * | `extensions`（方言） | markdown 方言是 mimir 的核心格式，`drift.test.ts` 守着它的往返幂等性。包不该定义产品的正文格式 |
 * | `contentClassName`（排版） | 正文排版与**只读视图共用同一个类**（`MarkdownBody` 用同一份 Markdown 渲染），挪进包就会分成两份 |
 *
 * 于是包负责「壳」，宿主负责「内容是什么样」。这与 docx 那条边界同构：
 * 包负责壳，宿主负责 io。
 *
 * ## 工具条为什么常驻顶栏（原本是跟随选区的气泡菜单）
 *
 * 气泡菜单适合「写完再调格式」。而办公软件的习惯是**顶栏常驻**：格式是
 * 边写边调的，而且要能一眼看到光标处当前的格式状态（这段是标题还是正文？
 * 现在开着加粗吗）。用气泡的话每次都要先选中才看得到工具——而「我现在在
 * 什么格式里」这个问题在输入前就存在了。
 *
 * AI 那两个动作（改写/翻译）与「就这段提问」仍然跟选区走——它们是**对选中
 * 内容**的动作，没有选区就没有意义。宿主通过 `selectionToolbar` 注入。
 *
 * ## 保存是防抖的，但状态始终可见
 *
 * 文字类产品最让人失去信任的是丢内容（`docs/PRD.md` §5.9）。所以：输入后
 * 900ms 防抖保存，状态行实时显示「正在保存… / 已保存 / 保存失败」，
 * 失败时点状态行重试。有未保存内容时切换文档由宿主的守卫拦截
 * ——`onSaveHandle` 就是交给它的那把「立即保存」。
 */

import type { Editor, Extensions } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import {
  EditorShell,
  ToolbarButton,
  ToolbarDivider,
  ToolbarLabel,
  ToolbarSpacer,
} from '../shell/EditorShell.js'
import { InlineToolbar } from './InlineToolbar.js'
import {
  BoldIcon,
  BulletListIcon,
  ItalicIcon,
  OrderedListIcon,
  SaveIcon,
  StrikeIcon,
  UnderlineIcon,
} from '../shell/icons.js'
import {
  hasCommand,
  hasMark,
  hasNode,
  runCommand,
  toggleMarkByName,
} from '../shell/editor-commands.js'
import '../shell/shell.css'
import './editors.css'
// 类型入口（`contentType: 'markdown'` 与 `getMarkdown()` 来自它）。
// 运行时由宿主的扩展列表提供——见 markdown-dialect.ts 里的两条要求
import './markdown-dialect.js'

/** 防抖窗口。连续敲字期间不发请求 */
const SAVE_DEBOUNCE_MS = 900

/**
 * 工具条按钮的「当前是否生效」判据表。
 *
 * 放在模块级而不是组件里：它不捕获任何东西，每次渲染重建一份是白白的开销，
 * 而 lint 也会（正确地）指出这一点。顺序就是按钮顺序。
 */
const MARK_KEYS: readonly (readonly [string, (editor: Editor) => boolean])[] = [
  ['bold', (e) => e.isActive('bold')],
  ['italic', (e) => e.isActive('italic')],
  ['underline', (e) => e.isActive('underline')],
  ['strike', (e) => e.isActive('strike')],
  ['code', (e) => e.isActive('code')],
  ['h1', (e) => e.isActive('heading', { level: 1 })],
  ['h2', (e) => e.isActive('heading', { level: 2 })],
  ['h3', (e) => e.isActive('heading', { level: 3 })],
  ['bullet', (e) => e.isActive('bulletList')],
  ['ordered', (e) => e.isActive('orderedList')],
  ['quote', (e) => e.isActive('blockquote')],
  ['codeBlock', (e) => e.isActive('codeBlock')],
]

export interface MarkdownEditorProps {
  /** 换它必须重置编辑器实例——宿主用 `key` 或这个比较 */
  documentId: string
  /** 方言（Tiptap 扩展集合）。由宿主注入，见文件顶部 */
  extensions: Extensions
  /** 初始正文（markdown）。**只读一次**：之后编辑器自己维护内容 */
  initialContent: string
  /** 正文排版类。与只读视图共用同一个（宿主注入） */
  contentClassName?: string
  /** 保存。抛出的 Error 的 message 会显示在状态行上 */
  onSave: (markdown: string) => Promise<void>
  /** 有没有未保存的改动（宿主用它武装离开前的拦截） */
  onDirtyChange?: (dirty: boolean) => void
  /**
   * 把「立即保存」交给宿主，供「保存并离开」调用。卸载时传 null。
   *
   * 返回值必须反映**真实结果**：拦截框靠它决定放不放行——放行了而实际
   * 没存上，比不拦截更糟（`docs/PRD.md` §5.9）。
   */
  onSaveHandle?: (save: (() => Promise<boolean>) | null) => void
  /**
   * 「就这段提问」：把选中的话交给宿主带进对话。
   *
   * **是一个回调而不是一个渲染函数**（虽然它一度是）。理由见
   * `InlineToolbar` 的说明：传一个返回 JSX 的函数进来，宿主每次渲染都会
   * 新建一个组件类型，React 于是卸载重建浮层，而且 lint 会（正确地）报
   * `no-unstable-nested-components`。回调则没有这个问题，编辑器实例也不用外泄。
   */
  onAskAboutSelection?: (passage: string) => void
  /** 贴边模式：编辑器已经在面板里，不要再套一层外框 */
  flush?: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function MarkdownEditor({
  documentId,
  extensions,
  initialContent,
  contentClassName,
  onSave,
  onDirtyChange,
  onSaveHandle,
  onAskAboutSelection,
  flush = false,
}: MarkdownEditorProps) {
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 给 `beforeunload` 用：那个监听器只注册一次，需要读过期值 */
  const dirtyRef = useRef(false)

  /**
   * 初始正文的**快照**，跟着文档走。
   *
   * 编辑器实例自己维护内容，之后传进来的变化都是保存回写的回声，不该灌回
   * 编辑器（会让光标跳走）。但**换文档时必须换成新文档的正文**——所以快照
   * 记住它是哪一份文档的，文档变了就在渲染期同步换掉：这是 React 官方的
   * 「props 变化时调整 state」模式（在渲染期比较、而不是用 effect 同步），
   * 于是不会先闪一帧旧内容。
   *
   * 用 state 而不是 ref：这个值要在**渲染期**喂给 `useEditor`，而渲染期读
   * ref 会让 React Compiler 拒绝优化这个组件（`apps/web/AGENTS.md` 记过）。
   */
  const [snapshot, setSnapshot] = useState({ doc: documentId, body: initialContent })
  if (snapshot.doc !== documentId) setSnapshot({ doc: documentId, body: initialContent })

  /**
   * 最新的保存函数。理由与 docx 那边的 `ioRef` 相同：`onSave` 是宿主每次
   * 渲染新建的闭包，不能进依赖数组（会让实例反复重建、丢光标），但也不能
   * 用「抑制规则」绕开（铁律 1：编译器会静默跳过整个组件）。
   */
  const onSaveRef = useRef(onSave)
  useEffect(() => {
    onSaveRef.current = onSave
  })

  const editor = useEditor(
    {
      extensions,
      content: snapshot.body,
      contentType: 'markdown',
      editable: true,
      onUpdate: () => {
        dirtyRef.current = true
        setDirty(true)
        onDirtyChange?.(true)
        setState('saving')
        setError(null)

        // 防抖：连续敲字期间不发请求。到点后走与「重试」同一条路径，
        // 于是状态与脏标记的处理只有一处，不会两边不一致
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => void saveNowRef.current(), SAVE_DEBOUNCE_MS)
      },
    },
    /**
     * 依赖快照：**换文档时重建实例**（新文档要有新内容），而保存回写、
     * 查询刷新都不会变它——那些时候只 `setOptions`，光标不丢。
     */
    [snapshot],
  )

  /**
   * 立即保存并返回真实结果。三处用它：防抖到点、状态行上的「重试」、
   * 离开时的「保存并离开」。
   */
  const saveNow = async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    try {
      await onSaveRef.current(editor?.getMarkdown() ?? snapshot.body)
      dirtyRef.current = false
      setDirty(false)
      onDirtyChange?.(false)
      setState('saved')
      setError(null)
      return true
    } catch (cause) {
      setState('error')
      setError(cause instanceof Error ? cause.message : String(cause))
      return false
    }
  }

  /** `saveNow` 的最新值。注册 effect 声明在它**之后**（Compiler 的要求） */
  const saveNowRef = useRef(saveNow)
  useEffect(() => {
    saveNowRef.current = saveNow
  })

  /** 把「立即保存」交给宿主，供「保存并离开」用。卸载时撤回 */
  useEffect(() => {
    onSaveHandle?.(() => saveNowRef.current())
    return () => onSaveHandle?.(null)
  }, [onSaveHandle])

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
    <EditorShell
      flush={flush}
      toolbar={
        <>
          <MarkdownToolbar editor={editor} />
          <ToolbarSpacer />
          <ToolbarButton
            label={state === 'saving' ? '正在保存…' : '立即保存'}
            primary
            disabled={!dirty || state === 'saving'}
            onClick={() => void saveNowRef.current()}
          >
            <SaveIcon />
          </ToolbarButton>
        </>
      }
      status={
        <>
          {/*
            保存状态**始终可见**（PRD §5.9）。失败时可点重试——不能只把失败
            画出来却不给动作。空闲时不占位：一条写着「没有改动」的状态行是噪音
          */}
          {state === 'error' ? (
            <button
              type="button"
              className="me-status-action"
              onClick={() => void saveNowRef.current()}
            >
              保存失败：{error} · 点此重试
            </button>
          ) : (
            <ToolbarLabel>
              {state === 'saving' ? '正在保存…' : state === 'saved' ? '已保存' : '未改动'}
            </ToolbarLabel>
          )}
          <CharCount editor={editor} />
        </>
      }
    >
      {/*
        选区工具条。**只在给了回调且编辑器就绪时挂**——没有消费者时挂一个
        浮层是白白的实例；`editor` 还没就绪时 BubbleMenu 会拿到 null。
      */}
      {editor && onAskAboutSelection ? (
        <InlineToolbar editor={editor} onAskAboutSelection={onAskAboutSelection} />
      ) : null}
      <div className="me-scroll mimir-markdown-scroll">
        <div className={contentClassName}>
          {/* EditorContent 负责把编辑器挂进 React 树，并在卸载时清理 */}
          <EditorContent editor={editor} className="mimir-markdown-body" />
        </div>
      </div>
    </EditorShell>
  )
}

/** 字数。单独一个组件：它订阅文档变化，于是只有它跟着敲字重渲染 */
function CharCount({ editor }: { editor: Editor | null }) {
  const chars = useEditorState({
    editor,
    selector: ({ editor: instance }) => instance?.state.doc.textContent.length ?? 0,
  })
  return <ToolbarLabel>{chars ?? 0} 字</ToolbarLabel>
}

/**
 * 格式工具条。
 *
 * ## 为什么用 `useEditorState` 而不是直接读 `editor.isActive`
 *
 * **Tiptap v3 的 `useEditor` 默认不在事务上重渲染**（`shouldRerenderOnTransaction`
 * 默认 false，这是为了性能）。所以在渲染期直接读 `isActive` 会**停在旧值**：
 * 把光标移进一段加粗文字，加粗按钮不会亮起来。它不报错，只是按钮状态永远是
 * 打开文档那一刻的——正是这个仓库最在意的那类「静默出错」。
 *
 * `useEditorState` 订阅编辑器状态，只在选中的那部分变化时重渲染。
 * 把它放在工具条组件里（而不是外层编辑器组件）是有意的：只有工具条需要
 * 跟着光标走，正文区不需要。
 */
function MarkdownToolbar({ editor }: { editor: Editor | null }) {
  /**
   * 一次订阅算完全部按钮的状态。
   *
   * 返回**字符串**而不是对象：默认的相等判断是深比较，字符串比它更省也
   * 更不容易出意外（对象每次新建，万一相等判断被换掉就会每次事务都重渲染）。
   */
  const activeKeys =
    useEditorState({
      editor,
      selector: ({ editor: instance }) => {
        if (!instance) return ''
        return MARK_KEYS.filter(([, isOn]) => isOn(instance))
          .map(([key]) => key)
          .join(' ')
      },
    }) ?? ''

  if (!editor) return null
  if (!editor) return null

  const on = (key: string): boolean => activeKeys.includes(key)

  return (
    <>
      <ToolbarButton
        label="加粗 (Ctrl+B)"
        active={on('bold')}
        disabled={!hasMark(editor, 'bold')}
        onClick={() => toggleMarkByName(editor, 'bold')}
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        label="倾斜 (Ctrl+I)"
        active={on('italic')}
        disabled={!hasMark(editor, 'italic')}
        onClick={() => toggleMarkByName(editor, 'italic')}
      >
        <ItalicIcon />
      </ToolbarButton>
      <ToolbarButton
        label="下划线 (Ctrl+U)"
        active={on('underline')}
        disabled={!hasMark(editor, 'underline')}
        onClick={() => toggleMarkByName(editor, 'underline')}
      >
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton
        label="删除线"
        active={on('strike')}
        disabled={!hasMark(editor, 'strike')}
        onClick={() => toggleMarkByName(editor, 'strike')}
      >
        <StrikeIcon />
      </ToolbarButton>
      <ToolbarButton
        label="行内代码"
        active={on('code')}
        disabled={!hasMark(editor, 'code')}
        onClick={() => toggleMarkByName(editor, 'code')}
      >
        {'</>'}
      </ToolbarButton>

      <ToolbarDivider />

      {/*
        标题：三个按钮而不是一个下拉。下拉要多两次点击（展开 → 选），而切换
        标题层级是写笔记时最常做的一步。三级够用——笔记里出现 h4 比出现
        三级标题罕见得多（`docs/DESIGN.md` 的正文规范也只到 h3）
      */}
      {hasNode(editor, 'heading') ? (
        <>
          <ToolbarButton
            label="一级标题"
            active={on('h1')}
            onClick={() => runCommand(editor, 'toggleHeading', { level: 1 })}
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            label="二级标题"
            active={on('h2')}
            onClick={() => runCommand(editor, 'toggleHeading', { level: 2 })}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            label="三级标题"
            active={on('h3')}
            onClick={() => runCommand(editor, 'toggleHeading', { level: 3 })}
          >
            H3
          </ToolbarButton>
          <ToolbarDivider />
        </>
      ) : null}

      {hasNode(editor, 'bulletList') ? (
        <ToolbarButton
          label="项目符号列表"
          active={on('bullet')}
          onClick={() => runCommand(editor, 'toggleBulletList')}
        >
          <BulletListIcon />
        </ToolbarButton>
      ) : null}
      {hasNode(editor, 'orderedList') ? (
        <ToolbarButton
          label="编号列表"
          active={on('ordered')}
          onClick={() => runCommand(editor, 'toggleOrderedList')}
        >
          <OrderedListIcon />
        </ToolbarButton>
      ) : null}

      <ToolbarDivider />

      {hasNode(editor, 'blockquote') ? (
        <ToolbarButton
          label="引用"
          active={on('quote')}
          onClick={() => runCommand(editor, 'toggleBlockquote')}
        >
          ❝
        </ToolbarButton>
      ) : null}
      {hasNode(editor, 'codeBlock') ? (
        <ToolbarButton
          label="代码块"
          active={on('codeBlock')}
          onClick={() => runCommand(editor, 'setCodeBlock')}
        >
          {'{ }'}
        </ToolbarButton>
      ) : null}
      {hasNode(editor, 'horizontalRule') ? (
        <ToolbarButton label="分隔线" onClick={() => runCommand(editor, 'setHorizontalRule')}>
          ─
        </ToolbarButton>
      ) : null}

      {hasCommand(editor, 'undo') ? (
        <>
          <ToolbarDivider />
          <ToolbarButton label="撤销 (Ctrl+Z)" onClick={() => runCommand(editor, 'undo')}>
            ↶
          </ToolbarButton>
          <ToolbarButton label="重做 (Ctrl+Shift+Z)" onClick={() => runCommand(editor, 'redo')}>
            ↷
          </ToolbarButton>
        </>
      ) : null}
    </>
  )
}
