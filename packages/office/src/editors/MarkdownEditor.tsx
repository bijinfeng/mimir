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
 * ## 三条刻意的边界
 *
 * 这个组件**不拥有**下面这些东西，它们由宿主注入：
 *
 * | 什么 | 为什么留在宿主 |
 * |---|---|
 * | `extensions`（方言） | markdown 方言是 mimir 的核心格式，`drift.test.ts` 守着它的往返幂等性。包不该定义产品的正文格式 |
 * | `contentClassName`（排版） | 正文排版与**只读视图共用同一个类**（`MarkdownBody` 用同一份 Markdown 渲染），挪进包就会分成两份 |
 * | `onUploadImage`（插图） | 上传要打宿主的 `/api/documents/files`，而那个客户端在 `apps/web`。包不 import 宿主 |
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
 * 内容**的动作，没有选区就没有意义（`InlineToolbar`）。
 *
 * ## 保存是防抖的，但状态始终可见
 *
 * 文字类产品最让人失去信任的是丢内容（`docs/PRD.md` §5.9）。所以：输入后
 * 900ms 防抖保存，状态行实时显示「正在保存… / 已保存 / 保存失败」，
 * 失败时点状态行重试。有未保存内容时切换文档由宿主的守卫拦截
 * ——`onSaveHandle` 就是交给它的那把「立即保存」。
 *
 * ## 每个按钮都接一条**真的存在**的命令
 *
 * 这是本文件最要紧的一条纪律（`shell/editor-commands.ts` 顶部那段）：
 * Tiptap 的 `chain()` 是惰性的，调一个不存在的命令**不报错**，只是什么都不
 * 做、`run()` 照样返回 true。所以每个按钮都：先用 `hasMark` / `hasNode` /
 * `hasCommand` 或 `can().*` 判断，判断不通过就 `disabled` + `disabledReason`。
 *
 * 状态（按钮亮不亮）与能力（按钮能不能点）**来自同一个订阅**：`toolbarStateOf`
 * 一个字符串里既有一批状态 token（`bold`、`style:h2`）也有一批能力 token
 * （`undo`、`sink`、`delRow`）。分开算的话 `can().undo()` 这类历史栈状态会
 * 停在打开文档那一刻——敲了几个字之后撤销按钮还是灰的。
 *
 * ## 段落样式为什么是九个取值，而正文规范只到 h3
 *
 * `docs/DESIGN.md` §4.3 给 h1-h3 定了字号（28 / 20 / 16），说的是**排版**；
 * 「能不能写 h4」是另一个问题——markdown 本来就允许六级标题，`@tiptap/starter-kit`
 * 的 heading 默认 `levels: [1..6]`，而只读视图里 h4-h6 按浏览器默认渲染。
 * 少给三级会让用户在别处写好的笔记导入后**选不中已有的 h4**（下拉显示「混合」，
 * 改一下就掉级）。取舍记在 `docs/DECISIONS.md` 的 D-059。
 */

import type { Editor, Extensions } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import {
  EditorShell,
  ToolbarButton,
  ToolbarDivider,
  ToolbarFileButton,
  ToolbarGroup,
  ToolbarLabel,
  ToolbarMenu,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarSpacer,
  ToolbarTextButton,
  ToolbarTextField,
  useToolbarState,
  type ToolbarMenuItem,
  type ToolbarSelectOption,
} from '../shell/EditorShell.js'
import { InlineToolbar, type RewriteActionName } from './InlineToolbar.js'
import {
  BoldIcon,
  BulletListIcon,
  ClearFormatIcon,
  CloseIcon,
  CodeIcon,
  HorizontalRuleIcon,
  ImageIcon,
  IndentIcon,
  ItalicIcon,
  LinkIcon,
  OrderedListIcon,
  OutdentIcon,
  RedoIcon,
  SaveIcon,
  SpellCheckIcon,
  StrikeIcon,
  TableIcon,
  TaskListIcon,
  UnderlineIcon,
  UndoIcon,
} from '../shell/icons.js'
import {
  hasCommand,
  hasMark,
  hasNode,
  runCommand,
  toggleMarkByName,
} from '../shell/editor-commands.js'
import {
  PARAGRAPH_STYLES,
  applyLink,
  applyParagraphStyle,
  canInsertTable,
  codeLanguageOptions,
  currentCodeLanguage,
  currentColumnAlign,
  currentLinkHref,
  listItemNameFromState,
  nodeNameOfStyle,
  removeLink,
  setCodeLanguage,
  setColumnAlign,
  styleFromToolbarState,
  taskListToggleBlockedReason,
  toolbarHas,
  toolbarStateOf,
  toggleWholeTaskList,
  type ColumnAlign,
  type ParagraphStyle,
} from './markdown-format.js'
import '../shell/shell.css'
import './editors.css'
// 类型入口（`contentType: 'markdown'` 与 `getMarkdown()` 来自它）。
// 运行时由宿主的扩展列表提供——见 markdown-dialect.ts 里的两条要求
import './markdown-dialect.js'

/** 防抖窗口。连续敲字期间不发请求 */
const SAVE_DEBOUNCE_MS = 900

/** 段落样式下拉的文案。九个取值，照上游 GenOffice 的 Ribbon（`Ribbon.tsx:58-69`） */
const STYLE_LABEL: Record<ParagraphStyle, string> = {
  paragraph: '正文',
  h1: '标题 1',
  h2: '标题 2',
  h3: '标题 3',
  h4: '标题 4',
  h5: '标题 5',
  h6: '标题 6',
  blockquote: '引用',
  codeBlock: '代码块',
}

/**
 * 该样式在这个方言里可用吗。
 *
 * 不可用的那一项**不出现在下拉里**（而不是灰着占位）：段落样式是个单选，
 * 一个永远选不中的选项只会让人以为自己操作错了。
 */
function styleAvailable(editor: Editor, style: ParagraphStyle): boolean {
  const node = nodeNameOfStyle(style)
  if (!hasNode(editor, node)) return false
  if (node !== 'heading') return true
  // 标题的层级是配置项（StarterKit 默认 1-6）。方言关掉某几级时不能选
  const extension = editor.extensionManager.extensions.find((item) => item.name === 'heading')
  const levels = (extension?.options as { levels?: readonly number[] } | undefined)?.levels
  return levels === undefined || levels.includes(Number(style.slice(1)))
}

/** 工具条的表格操作项：能力 token 与它调的命令一一对应 */
const TABLE_ITEMS: readonly {
  key: string
  token: string
  label: string
  command: string
}[] = [
  { key: 'rowBefore', token: 'rowBefore', label: '上方插入行', command: 'addRowBefore' },
  { key: 'rowAfter', token: 'rowAfter', label: '下方插入行', command: 'addRowAfter' },
  { key: 'colBefore', token: 'colBefore', label: '左侧插入列', command: 'addColumnBefore' },
  { key: 'colAfter', token: 'colAfter', label: '右侧插入列', command: 'addColumnAfter' },
  { key: 'delRow', token: 'delRow', label: '删除本行', command: 'deleteRow' },
  { key: 'delCol', token: 'delCol', label: '删除本列', command: 'deleteColumn' },
  { key: 'delTable', token: 'delTable', label: '删除表格', command: 'deleteTable' },
]

/** 列对齐的三档 */
const ALIGN_ITEMS: readonly { value: ColumnAlign; label: string }[] = [
  { value: 'left', label: '本列左对齐' },
  { value: 'center', label: '本列居中' },
  { value: 'right', label: '本列右对齐' },
]

export interface MarkdownImageUpload {
  /** 插入正文的地址（宿主的 `api.documents.sourceUrl(id)`） */
  url: string
  /** 替代文字。用原文件名：图加载不出来时 alt 是唯一还能读的东西 */
  name: string
}

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
  /**
   * 内联改写（M1-D）。宿主注入——包不碰网络，理由见 `InlineToolbar` 的头注释。
   * 没有它时四个动作按钮保留但禁用（tooltip 说明原因）。
   */
  onRewrite?: (text: string, action: RewriteActionName) => Promise<string | null>
  /** 正在改写：按钮转 loading */
  rewriting?: boolean
  /**
   * 「插入图片」：把文件交给宿主的资料库，拿回一个能插进正文的地址。
   *
   * **上传会在资料库里多一条 `file` 文档**——这是产品决定，不是副作用
   * （`apps/server/src/services/upload.ts`；`api.documents.upload` 同样这条路）。
   * 代价是「插一张图 = 多一条资料」，换来的是正文里只留一个地址、原件存得住、
   * 也能被单独搜到。
   *
   * 不给这个回调时那个按钮**不渲染**：在正文里嵌 base64 的「替代实现」会让
   * 笔记膨胀十倍，而且没有任何东西在守它。
   */
  onUploadImage?: (file: File) => Promise<MarkdownImageUpload>
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
  onRewrite,
  rewriting,
  onUploadImage,
  flush = false,
}: MarkdownEditorProps) {
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  /** 插图这类**工具条动作**的失败。与保存失败分开：两者的处置完全不同 */
  const [actionError, setActionError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  /**
   * 拼写检查。
   *
   * 浏览器的默认值是**开**（contenteditable 不写 `spellcheck` 时按开启处理），
   * 所以这里的初始值也是开——按钮显示的状态必须与真实行为一致。点了之后写死
   * 一个显式的 `spellcheck="false"`：这个属性没有「回到默认」的取值。
   */
  const [spellCheck, setSpellCheck] = useState(true)
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
      /**
       * `spellcheck` 从第一帧就写死成显式值，而不是留给浏览器默认：不写的
       * 时候属性是 `null`，而按钮要显示「开 / 关」——两处说法迟早不一致。
       *
       * 它同时**必须在 options 里**（不能只在事件里 `setOptions`）：换文档会
       * 重建实例，那个新实例只认这里的值。
       */
      editorProps: { attributes: { spellcheck: String(spellCheck) } },
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

  /**
   * 插图：**先把文件存进资料库，再把地址写进正文**。
   *
   * 顺序不能反：正文里的地址必须指向一个已经存在的文档，否则存下去的是一个
   * 404 的图片，而且只有刷新页面之后才看得出来。失败时**什么都不插**，
   * 并把原因写到状态行——留一个半插入的图片比不插更糟。
   */
  const insertImage = async (file: File) => {
    if (onUploadImage === undefined || editor === null) return
    setActionError(null)
    try {
      const uploaded = await onUploadImage(file)
      if (!runCommand(editor, 'setImage', { src: uploaded.url, alt: uploaded.name })) {
        setActionError('这个方言没有图片节点，插图没有生效')
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      setActionError(`插图失败：${reason}（图片没有插入）`)
    }
  }

  /**
   * 拼写检查：**立即**改到 DOM 上（`setOptions` → `view.setProps`，实测属性
   * 真的落到 `contenteditable` 元素上）。值同时已经在 `useEditor` 的 options
   * 里，所以换文档重建实例也不会丢。
   */
  const toggleSpellCheck = () => {
    const next = !spellCheck
    setSpellCheck(next)
    editor?.setOptions({ editorProps: { attributes: { spellcheck: String(next) } } })
  }

  /**
   * 状态行：保存失败优先，其次是工具条动作的失败。
   *
   * 两种失败都是**「说明 + 一个动作」**，所以走 `ToolbarTextButton`（下划线文字，
   * 不是方框按钮）：它长在状态那句话里，画成 24px 的方框会让这一行看起来像
   * 第二条工具条。原来这两处是裸 `<button className="me-status-action">`
   * ——D-064 要消掉的原生控件，且尺寸不跟 antd 的 small 档走。
   *
   * `danger` 给 `true`：与 pdf 那条「导入失败」的提示同一档（危险色），
   * 而字色由 `.me-text-btn--danger` 钉在宿主校准过的 `--me-danger` 上。
   */
  const statusMessage =
    state === 'error' ? (
      <ToolbarTextButton
        label={`保存失败：${error} · 点此重试`}
        danger
        onClick={() => void saveNowRef.current()}
      />
    ) : actionError !== null ? (
      <ToolbarTextButton
        label={`${actionError} · 点此关闭`}
        danger
        onClick={() => setActionError(null)}
      />
    ) : (
      <ToolbarLabel>
        {state === 'saving' ? '正在保存…' : state === 'saved' ? '已保存' : '未改动'}
      </ToolbarLabel>
    )

  return (
    <EditorShell
      flush={flush}
      toolbar={
        <>
          <MarkdownToolbar
            editor={editor}
            spellCheck={spellCheck}
            onToggleSpellCheck={toggleSpellCheck}
            onPickImage={onUploadImage === undefined ? undefined : (file) => void insertImage(file)}
          />
          <ToolbarSpacer />
          <ToolbarButton
            label={state === 'saving' ? '正在保存…' : '立即保存'}
            primary
            disabled={!dirty || state === 'saving'}
            disabledReason="没有未保存的改动"
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
          {statusMessage}
          <CharCount editor={editor} />
        </>
      }
    >
      {/*
        选区工具条。**只在给了回调且编辑器就绪时挂**——没有消费者时挂一个
        浮层是白白的实例；`editor` 还没就绪时 BubbleMenu 会拿到 null。
      */}
      {editor && onAskAboutSelection ? (
        <InlineToolbar
          editor={editor}
          onAskAboutSelection={onAskAboutSelection}
          {...(onRewrite ? { onRewrite } : {})}
          {...(rewriting === undefined ? {} : { rewriting })}
        />
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

export interface MarkdownToolbarProps {
  editor: Editor | null
  spellCheck: boolean
  onToggleSpellCheck: () => void
  /** 「插入图片」：不给就不渲染那个按钮（没有上传通道时它没有能做的事） */
  onPickImage?: ((file: File) => void) | undefined
}

/**
 * 格式工具条。
 *
 * ## 为什么用 `useToolbarState` 而不是直接读 `editor.isActive`
 *
 * **Tiptap v3 的 `useEditor` 默认不在事务上重渲染**（`shouldRerenderOnTransaction`
 * 默认 false，这是为了性能）。所以在渲染期直接读 `isActive` 会**停在旧值**：
 * 把光标移进一段加粗文字，加粗按钮不会亮起来。它不报错，只是按钮状态永远是
 * 打开文档那一刻的——正是这个仓库最在意的那类「静默出错」。
 *
 * `useToolbarState` 订阅编辑器状态，只在选中的那部分变化时重渲染。
 * 把它放在工具条组件里（而不是外层编辑器组件）是有意的：只有工具条需要
 * 跟着光标走，正文区不需要。
 */
export function MarkdownToolbar({
  editor,
  spellCheck,
  onToggleSpellCheck,
  onPickImage,
}: MarkdownToolbarProps) {
  const state = useToolbarState(editor, toolbarStateOf)

  if (!editor) return null

  const on = (token: string): boolean => toolbarHas(state, token)
  const style = styleFromToolbarState(state)
  const listItem = listItemNameFromState(state)

  const styleOptions: ToolbarSelectOption<ParagraphStyle>[] = PARAGRAPH_STYLES.filter((item) =>
    styleAvailable(editor, item),
  ).map((item) => ({ value: item, label: STYLE_LABEL[item] }))

  const languages = codeLanguageOptions(editor)
  const language = currentCodeLanguage(editor)
  const tableInsertable = canInsertTable(editor)
  /** 嵌套列表上整张转换没有可靠的做法，禁用并说明（见 `taskListToggleBlockedReason`） */
  const taskBlockedReason = taskListToggleBlockedReason(editor)

  /** 缩进两个按钮的禁用原因。判据是 token，不是在渲染期另算一次 `can()` */
  const outdentReason =
    listItem === null ? '光标不在列表里' : '这一项已经在最外层（上面没有同级项）'
  const indentReason = listItem === null ? '光标不在列表里' : '上面没有同级项，无法再往里缩进'

  /*
   * 工具条上的**分隔线**。
   *
   * 这条工具条有八到十个组，而 `.mimir-editor__bar` 与 `.me-group` 的 `gap`
   * 都是 2px——不画线的话**组与组的间隔与组内按钮的间隔一样**，整条读成一个
   * 没有结构的图标带（实测：组与组之间 7 个间隔全是 2px，栏内一条竖线都没有）。
   * 同壳的另外五种格式都画了（docx 5 条、xlsx 3、pptx 2、html 3、pdf 3），
   * 只有笔记这条漏了——而 DESIGN §8.4.1 要求六种格式「长得一样不靠约定」。
   *
   * **只画在真正的组边界**（而且只在**前一组确实渲染了**时才画）：工具条是
   * `flex-wrap` 的，分隔线只是一个兄弟 flex 项，画在每两个按钮之间的话它会
   * 在换行时落到行末或行首，看起来像没画对（`ToolbarDivider` 的说明）。
   * 所以这里跟着前一个组的条件走，不产生「两条相邻」或「行首一条」。
   */
  return (
    <>
      {hasCommand(editor, 'undo') && (
        <ToolbarGroup label="撤销与重做">
          <ToolbarButton
            label="撤销 (Ctrl+Z)"
            disabled={!on('undo')}
            disabledReason="没有可撤销的改动"
            onClick={() => runCommand(editor, 'undo')}
          >
            <UndoIcon />
          </ToolbarButton>
          <ToolbarButton
            label="重做 (Ctrl+Shift+Z)"
            disabled={!on('redo')}
            disabledReason="没有可重做的改动"
            onClick={() => runCommand(editor, 'redo')}
          >
            <RedoIcon />
          </ToolbarButton>
        </ToolbarGroup>
      )}

      {/* 历史 | 样式：只有前一组真的渲染了才画（见上面「分隔线」那段） */}
      {hasCommand(editor, 'undo') && <ToolbarDivider />}

      {/*
        段落样式用一个下拉而不是一排按钮（原先 h1/h2/h3 三个按钮 + 引用 +
        代码块五个）。九个取值排成按钮会占掉大半条工具条，而按钮只有布尔态——
        「现在这段是什么」得由谁亮着来表达，五个按钮就有五种可能写错。
      */}
      {styleOptions.length > 0 && (
        <ToolbarGroup label="段落样式">
          <ToolbarSelect
            label="段落样式"
            value={style}
            fallbackLabel="混合"
            options={styleOptions}
            onChange={(next) => applyParagraphStyle(editor, next)}
          />
        </ToolbarGroup>
      )}

      {/* 样式 | 行内格式。**与上一条互补**：两个前置组各自带一条自己的尾线，
          于是四种组合下都恰好只有「前面已经落了一个组」的那几条——样式缺席时
          上一条补位、历史缺席时这一条补位，两者都缺席时一条也不画（行首不会
          凭空多一条竖线） */}
      {styleOptions.length > 0 && <ToolbarDivider />}

      <ToolbarGroup label="行内格式">
        <ToolbarButton
          label="加粗 (Ctrl+B)"
          active={on('bold')}
          disabled={!hasMark(editor, 'bold')}
          disabledReason="这个方言没有加粗标记（bold）"
          onClick={() => toggleMarkByName(editor, 'bold')}
        >
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton
          label="倾斜 (Ctrl+I)"
          active={on('italic')}
          disabled={!hasMark(editor, 'italic')}
          disabledReason="这个方言没有斜体标记（italic）"
          onClick={() => toggleMarkByName(editor, 'italic')}
        >
          <ItalicIcon />
        </ToolbarButton>
        {/*
          下划线**不是 GFM**。`@tiptap/markdown` 把它序列化成 `++文字++`
          （实测：给两个字加下划线 → `++一段++文字`），别的 markdown 工具
          多半不认。保留它是因为 Tiptap 的 StarterKit 自带，但 label 里说清楚
          ——一个序列化出去别人认不出的标记，用的人有权知道。
        */}
        <ToolbarButton
          label="下划线 (Ctrl+U)：存成 ++文字++，不是 GFM"
          active={on('underline')}
          disabled={!hasMark(editor, 'underline')}
          disabledReason="这个方言没有下划线标记（underline）"
          onClick={() => toggleMarkByName(editor, 'underline')}
        >
          <UnderlineIcon />
        </ToolbarButton>
        <ToolbarButton
          label="删除线"
          active={on('strike')}
          disabled={!hasMark(editor, 'strike')}
          disabledReason="这个方言没有删除线标记（strike）"
          onClick={() => toggleMarkByName(editor, 'strike')}
        >
          <StrikeIcon />
        </ToolbarButton>
        <ToolbarButton
          label="行内代码"
          active={on('code')}
          disabled={!hasMark(editor, 'code')}
          disabledReason="这个方言没有行内代码标记（code）"
          onClick={() => toggleMarkByName(editor, 'code')}
        >
          <CodeIcon />
        </ToolbarButton>
        {/*
          清除格式 = `unsetAllMarks`（core 命令）。它只清「可清除」的标记——
          `@tiptap/core` 支持扩展声明 `clearable: false` 来豁免
          （`index.d.ts:411` 与 `index.js:5474` 的 `nonClearableMarks`），
          而我们的方言里没有任何一个 mark 这么做，所以它是全清的。
          空选区上这个命令直接返回 true 而什么都不改（实测），所以可用判据是
          「选中范围内确实有标记」——否则按钮亮着、点了没反应。
        */}
        <ToolbarButton
          label="清除格式"
          disabled={!on('clear')}
          disabledReason="先选中带格式的文字"
          onClick={() => runCommand(editor, 'unsetAllMarks')}
        >
          <ClearFormatIcon />
        </ToolbarButton>
      </ToolbarGroup>

      {/* 行内格式 | 链接。这一条无条件：行内格式永远在，所以它前面一定有东西 */}
      <ToolbarDivider />

      {hasMark(editor, 'link') && (
        <ToolbarGroup label="链接">
          <LinkMenu editor={editor} linked={on('link')} emptySelection={on('emptySelection')} />
        </ToolbarGroup>
      )}

      {/* 链接 | 列表：链接缺席时上一条正好是「行内格式 | 列表」，不会连出两条 */}
      {hasMark(editor, 'link') && <ToolbarDivider />}

      <ToolbarGroup label="列表">
        {hasNode(editor, 'bulletList') && (
          <ToolbarButton
            label="项目符号列表"
            active={on('bullet')}
            onClick={() => runCommand(editor, 'toggleBulletList')}
          >
            <BulletListIcon />
          </ToolbarButton>
        )}
        {hasNode(editor, 'orderedList') && (
          <ToolbarButton
            label="编号列表"
            active={on('ordered')}
            onClick={() => runCommand(editor, 'toggleOrderedList')}
          >
            <OrderedListIcon />
          </ToolbarButton>
        )}
        {/*
          任务列表：`toggleTaskList` 的作用域是**光标那一项**，所以先把整张列表
          铺开再 toggle（同一条链、一个事务）。嵌套列表上没有任何一条上游命令能
          整张转换，所以如实禁用并说明原因——见 `taskListBlockedReason`。
        */}
        {hasNode(editor, 'taskList') && (
          <ToolbarButton
            label="任务列表"
            active={on('task')}
            disabled={taskBlockedReason !== null}
            disabledReason={taskBlockedReason ?? undefined}
            onClick={() => toggleWholeTaskList(editor)}
          >
            <TaskListIcon />
          </ToolbarButton>
        )}
      </ToolbarGroup>

      {/*
        缩进只对列表项有意义，而且**任务列表与普通列表是两种节点**
        （`taskItem` / `listItem`）——用错节点名的命令返回 false 且不报错，
        正是「点了没反应」。节点名从状态 token 里拿（`item:taskItem`）。
      */}
      <ToolbarGroup label="缩进">
        <ToolbarButton
          label="减少缩进"
          disabled={!on('outdent')}
          disabledReason={outdentReason}
          onClick={() => runCommand(editor, 'liftListItem', listItem ?? 'listItem')}
        >
          <OutdentIcon />
        </ToolbarButton>
        <ToolbarButton
          label="增加缩进"
          disabled={!on('indent')}
          disabledReason={indentReason}
          onClick={() => runCommand(editor, 'sinkListItem', listItem ?? 'listItem')}
        >
          <IndentIcon />
        </ToolbarButton>
      </ToolbarGroup>

      {/* 缩进 | 插入 */}
      <ToolbarDivider />

      <ToolbarGroup label="插入">
        {hasNode(editor, 'table') &&
          (tableInsertable ? (
            <InsertTableMenu editor={editor} />
          ) : (
            <ToolbarButton
              label="插入表格"
              disabled
              disabledReason="先把光标放在一段正文里"
              onClick={() => {}}
            >
              <TableIcon />
            </ToolbarButton>
          ))}
        {hasNode(editor, 'image') && onPickImage !== undefined && (
          <ToolbarFileButton label="插入图片" accept="image/*" onPick={onPickImage}>
            <ImageIcon />
          </ToolbarFileButton>
        )}
        {hasNode(editor, 'horizontalRule') && (
          <ToolbarButton label="分隔线" onClick={() => runCommand(editor, 'setHorizontalRule')}>
            <HorizontalRuleIcon />
          </ToolbarButton>
        )}
      </ToolbarGroup>

      {/* 表格操作只在表格里出现——不在表格里时这一整组没有作用对象 */}
      {hasNode(editor, 'table') && on('table') && (
        <ToolbarGroup label="表格">
          <TableMenu editor={editor} state={state} />
        </ToolbarGroup>
      )}

      {hasNode(editor, 'codeBlock') && on('codeBlock') && languages.length > 0 && (
        <ToolbarGroup label="代码块语言">
          <CodeLanguageSelect editor={editor} languages={languages} language={language} />
        </ToolbarGroup>
      )}

      <ToolbarGroup label="校对">
        <ToolbarButton
          label={spellCheck ? '关闭拼写检查' : '打开拼写检查'}
          active={spellCheck}
          onClick={onToggleSpellCheck}
        >
          <SpellCheckIcon />
        </ToolbarButton>
      </ToolbarGroup>
    </>
  )
}

/**
 * 链接：一个展开面板（地址输入框 + 应用 + 移除）加一个「移除」的快捷按钮
 * （光标已经在链接里时才有意义）。
 *
 * ## 为什么不是一个 `window.prompt`
 *
 * 它是阻塞式对话框、样式由浏览器定，而且**在 Electron 里被禁用**
 * （D-046 的载体）——那正是「点了没反应」。
 *
 * ## 两条「点了没反应」的坑都在 `applyLink` 里处理
 *
 *  1. **空选区上 `setLink` 返回 true 却不改文档**（实测：只是把 `link` 放进
 *     storedMarks，接着敲的字会变成链接）——那不是「给选中的文字加链接」。
 *     所以空选区且不在链接里时，面板里的「应用」按钮禁用并说明原因
 *  2. 光标在链接里时直接 `setLink` 只改半条（`extendMarkRange` 才圈住整条）
 *
 * 空选区、又不在链接里时触发按钮仍是**可展开**的（面板里有说明），不是
 * 灰着——一个灰按钮说不出「你先选中几个字」这句话。
 */
function LinkMenu({
  editor,
  linked,
  emptySelection,
}: {
  editor: Editor
  linked: boolean
  emptySelection: boolean
}) {
  const blocked = emptySelection && !linked
  return (
    <>
      <ToolbarMenu
        label="链接"
        icon={<LinkIcon />}
        renderPanel={(close) => <LinkPanel editor={editor} close={close} blocked={blocked} />}
      />
      {linked && (
        <ToolbarButton label="移除链接" onClick={() => removeLink(editor)}>
          <CloseIcon />
        </ToolbarButton>
      )}
    </>
  )
}

/**
 * 链接面板。**挂载一次 = 打开一次**，所以初值在 `useState` 的惰性初始化里
 * 直接读当前链接：不需要「打开时同步一次」的 effect。
 *
 * `blocked` 由工具条从状态串里算好传进来——`editor.state.selection` 在这个
 * 组件里读一次是**渲染期读编辑器状态**，那正是「停在旧值」那条坑的来源。
 */
function LinkPanel({
  editor,
  close,
  blocked,
}: {
  editor: Editor
  close: () => void
  blocked: boolean
}) {
  const [href, setHref] = useState(() => currentLinkHref(editor) ?? '')
  const insideLink = currentLinkHref(editor) !== null

  const apply = () => {
    const value = href.trim()
    if (value === '') {
      removeLink(editor)
    } else {
      applyLink(editor, value)
    }
    close()
  }

  return (
    <div className="me-link">
      <ToolbarTextField
        label="链接地址"
        value={href}
        placeholder="https://…"
        onChange={setHref}
        onSubmit={apply}
        onCancel={close}
      />
      <div className="me-link__row">
        <ToolbarButton
          label="应用链接（回车）"
          disabled={blocked || href.trim() === ''}
          disabledReason={blocked ? '先选中要加链接的文字' : '先填地址'}
          onClick={apply}
        >
          应用
        </ToolbarButton>
        <ToolbarButton
          label="移除链接"
          disabled={!insideLink}
          disabledReason="光标不在链接里"
          onClick={() => {
            removeLink(editor)
            close()
          }}
        >
          移除
        </ToolbarButton>
      </div>
    </div>
  )
}

/** 插入表格：行列数在面板里填 */
function InsertTableMenu({ editor }: { editor: Editor }) {
  return (
    <ToolbarMenu
      label="插入表格"
      icon={<TableIcon />}
      renderPanel={(close) => <InsertTablePanel editor={editor} close={close} />}
    />
  )
}

function InsertTablePanel({ editor, close }: { editor: Editor; close: () => void }) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const insert = () => {
    if (!runCommand(editor, 'insertTable', { rows, cols, withHeaderRow: true })) return
    close()
  }
  return (
    <div className="me-insert">
      <div className="me-insert__row">
        <ToolbarNumberField
          label="行数"
          value={rows}
          min={1}
          max={50}
          onCommit={setRows}
          suffix="行"
        />
        <ToolbarNumberField
          label="列数"
          value={cols}
          min={1}
          max={12}
          onCommit={setCols}
          suffix="列"
        />
      </div>
      {/*
        `withHeaderRow` 不给开关，固定 true：markdown 的表格**必须有**表头行
        ——列对齐就写在表头下面那条分隔行上（`@tiptap/extension-table` 的
        序列化器按列取第一个非空 align），没有表头行的表格往返一次会多出一行
        空表头（实测：3 行 → 4 行）。
      */}
      <ToolbarButton label={`插入 ${rows}×${cols} 表格（带表头行）`} primary onClick={insert}>
        插入表格
      </ToolbarButton>
      <ToolbarLabel>markdown 表格必须有表头行</ToolbarLabel>
    </div>
  )
}

/**
 * 表格操作。
 *
 * 可用性来自 `toolbarStateOf` 里那批 `can().addRowAfter()` token——它们是
 * **命令真的能跑**的判据，而不是「光标在表格里」（在表格里也不一定能删列：
 * 只剩一列时 `deleteColumn` 会把整张表拆掉，prosemirror 于是返回 false）。
 */
function TableMenu({ editor, state }: { editor: Editor; state: string }) {
  const align = currentColumnAlign(editor)

  const items: ToolbarMenuItem[] = TABLE_ITEMS.map((item) => ({
    key: item.key,
    label: item.label,
    disabled: !toolbarHas(state, item.token),
    disabledReason: '这里用不了这个操作',
    onSelect: () => runCommand(editor, item.command),
  }))

  items.push({ key: 'sep1', label: '', separator: true })

  for (const option of ALIGN_ITEMS) {
    items.push({
      key: `align:${option.value}`,
      label: option.label,
      active: align === option.value,
      disabled: align === option.value,
      disabledReason: '本列已经是这个对齐',
      onSelect: () => setColumnAlign(editor, option.value),
    })
  }

  items.push({ key: 'sep2', label: '', separator: true })

  /*
    `toggleHeaderRow` 的语义是 prosemirror-tables 定的：把**第一行**在
    「表头格 / 正文格」之间来回切，**不插入行**（`dist/index.js` 的
    `setCellAttr`/`toggleHeader` 一族；实测 `<th>` → `<td>`、行数不变、
    再切一次复原）。所以文案写「表头」而不是「插入表头行」。
  */
  items.push({
    key: 'header',
    label: '第一行设为表头（或取消）',
    disabled: !toolbarHas(state, 'header'),
    disabledReason: '这里用不了这个操作',
    onSelect: () => runCommand(editor, 'toggleHeaderRow'),
  })

  return <ToolbarMenu label="表格" text="表格" icon={<TableIcon />} items={items} />
}

/** 代码块语言。候选表从方言自己的 lowlight 实例读（见 `markdown-format.ts`） */
function CodeLanguageSelect({
  editor,
  languages,
  language,
}: {
  editor: Editor
  languages: string[]
  language: string | null
}) {
  const options: ToolbarSelectOption<string>[] = [
    { value: '', label: '自动识别' },
    ...languages.map((name) => ({ value: name, label: name })),
  ]
  return (
    <ToolbarSelect
      label="代码块语言"
      value={language ?? ''}
      options={options}
      onChange={(next) => setCodeLanguage(editor, next === '' ? null : next)}
    />
  )
}
