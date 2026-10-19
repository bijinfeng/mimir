/**
 * html 原件的编辑器（源码编辑 + 所见即所得预览）。
 *
 * ## 它借了上游什么，自己写了什么（D-055）
 *
 * | 借 vendored | 自己写 |
 * |---|---|
 * | CodeMirror 的装配（`source/`：HTML 语法、折叠、快捷键、查找高亮） | 编排：源码与预览谁先、什么时候重载 |
 * | 结构映射（`document/parse-map.ts`：元素 ↔ 源码偏移） | 预览的**加载方式**（上游走 Electron 自定义协议，这里没有） |
 * | 补丁校验与应用（`document/patch.ts`：偏移不重叠、按逆序应用） | 点选 → 工具的联动（上游的 StylePanel/Ribbon 是办公壳，我们用统一外壳） |
 * | 注入脚本（`preview/inspector.js`：在预览里点选元素并回传） | — |
 *
 * 上游那个 app 是 25924 行，其中 Ribbon（585 行）、AI 面板（1749+927 行）、
 * StylePanel（373 行）都是**办公壳**——mimir 用自己的统一外壳（D-054），
 * 所以那些不 vendor。真正与「编辑 HTML」有关的只有 2.6K 行。
 *
 * ## 预览怎么加载（这一处与上游不同，必须说明）
 *
 * 上游是 Electron 应用：主进程注册 `html-preview://` 协议，把**渲染进程**推
 * 过去的文本回给 frame（`preview-protocol.ts` + `html-main.ts`）。浏览器里
 * 没有那条路，也不该有——回调一个服务端端点等于每次编辑都要往服务器跑一趟。
 *
 * 这里用 `srcdoc` 直接喂 HTML：**同源**（不是 opaque origin），但沙箱属性里
 * 不给 `allow-same-origin`，于是它拿不到 cookie/localStorage，脚本仍在
 * opaque origin 里跑。代价与上游一致：**为了能渲染依赖 CDN 的页面，脚本与
 * 网络必须放行**（否则大量真实 HTML 打开就是一片空白）。
 *
 * ## 工具条接的是哪些命令（每一条都指到真实现）
 *
 * | 控件 | 命令 |
 * |---|---|
 * | 撤销 / 重做 | `SourceEditorHandle.undo()` / `redo()`，可用性由 `canUndo()` / `canRedo()` 喂 |
 * | 视图（源码 / 分栏 / 预览） | 两个栏位加 `hidden`——**不是条件渲染**，理由见 `view` 的说明 |
 * | 设备（桌面 / 平板 / 手机） | 预览宿主层的 `data-device`，宽度写在 editors.css 里 |
 * | 预览缩放 | 预览宿主层的 `zoom` + `--html-preview-zoom`（与上游 `PreviewFrame` 同一处，50–200、步长 10） |
 * | 查找和替换 | `SourceEditorHandle.findTarget()` → `FindReplaceBar`（**零适配**，形状与 `FindTarget` 一致） |
 * | 元素路径（面包屑） | `ancestorsOf(map, sid)` + `map.bySid`；点一段就把预览滚到那个元素、源码选中它 |
 * | 定位到源码里的元素 / 保存到库 | 原有动作 |
 *
 * ## 元素编辑
 *
 * 预览选中的 sid 同时用于元素定位与编辑。手动元素菜单和 Agent 的 apply_ops
 * 共用 document/ops.ts 编译器及当前源码版本，失败时整批不落地。
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  EditorShell,
  FindReplaceBar,
  useFindHotkey,
  ToolbarButton,
  ToolbarMenu,
  ToolbarLabel,
  ToolbarNumberField,
  ToolbarToggleGroup,
  type FindReplaceAdapter,
} from '../shell/EditorShell.js'
import {
  ChevronRightIcon,
  CodeIcon,
  DeviceDesktopIcon,
  DevicePhoneIcon,
  DeviceTabletIcon,
  EyeIcon,
  FindIcon,
  RedoIcon,
  SaveIcon,
  SplitViewIcon,
  UndoIcon,
} from '../shell/icons.js'
import type { FindOptions } from '../shims/ui.js'
import { CompactToolbar } from './CompactToolbar.js'
import { HtmlElementMenu } from './HtmlElementMenu.js'
import { HtmlWritingPreview, useHtmlWriting } from './HtmlWritingPreview.js'
import { HtmlPresentation } from './HtmlPresentation.js'
import { downloadHtml, openHtmlPresentation } from './html-output.js'
import { HtmlInsertMenu } from './HtmlInsertMenu.js'
import { HtmlAgentPrompt, type HtmlPromptRequest } from './HtmlAgentPrompt.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import {
  SourceEditor,
  type SourceEditorHandle,
} from '../../vendor/apps/html/src/renderer/source/SourceEditor.js'
import {
  ancestorsOf,
  buildParseMap,
  childrenOf,
  elementCovering,
  type ParseMap,
} from '../../vendor/apps/html/src/renderer/document/parse-map.js'
import {
  insertOp,
  insertPresetHtml,
} from '../../vendor/apps/html/src/renderer/document/insert-presets.js'
import { compileOps } from '../../vendor/apps/html/src/renderer/document/ops.js'
import { applyPatches as applyHtmlPatches } from '../../vendor/apps/html/src/renderer/document/patch.js'
import { instrumentForPreview } from '../../vendor/apps/html/src/renderer/preview/instrument.js'
import { moveTarget } from '../../vendor/apps/html/src/renderer/document/move-target.js'
import {
  CropDialog,
  CutoutDialog,
  type ImageDialogLabels,
} from '../../vendor/packages/ui/src/image-dialogs.js'
import {
  HtmlAgentHandle,
  type HtmlAgentDocument,
  type HtmlAgentHooks,
  type HtmlAgentResult,
} from '../agent/html-agent.js'
// `?raw` 由打包器提供：注入脚本要**原样**塞进预览（它是字符串，不是模块）
import inspectorSource from '../../vendor/apps/html/src/renderer/preview/inspector.js?raw'
import '../shell/shell.css'
import './editors.css'
import './compact-toolbar.css'
import './html-inspector.css'
import '../../vendor/packages/ui/src/image-dialogs.css'

/** 源码文件的 BOM 与换行风格 —— 保存时要原样还回去 */
interface Envelope {
  bom: boolean
  eol: '\n' | '\r\n'
  trailingNewline: boolean
}

/**
 * 拆出「正文 + 文件级风格」。
 *
 * 与上游 `document/envelope.ts` 同一条思路（那个文件没进闭包——它只被
 * App.tsx 用，而 App.tsx 是办公壳）。函数很短，抄一份比 vendor 整个文件清楚。
 *
 * **为什么要保留风格**：编辑一个 CRLF 的 Windows 页面，保存后整篇变成 LF，
 * git diff 会显示「全文件都改了」——而用户只改了一个字。BOM 同理。
 */
function parseEnvelope(raw: string): { text: string; envelope: Envelope } {
  const bom = raw.startsWith('\uFEFF')
  let body = bom ? raw.slice(1) : raw
  const crlf = (body.match(/\r\n/g) ?? []).length
  const lf = (body.match(/(?<!\r)\n/g) ?? []).length
  const eol: Envelope['eol'] = crlf > lf ? '\r\n' : '\n'
  body = body.replace(/\r\n?/g, '\n')
  const trailingNewline = body.endsWith('\n')
  if (trailingNewline) body = body.slice(0, -1)
  return { text: body, envelope: { bom, eol, trailingNewline } }
}

function serializeEnvelope(text: string, envelope: Envelope): string {
  let out = envelope.eol === '\n' ? text : text.replace(/\n/g, envelope.eol)
  if (envelope.trailingNewline) out += envelope.eol
  return envelope.bom ? '\uFEFF' + out : out
}

function imageDataUrl(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.type))
    return Promise.reject(new Error('请选择 PNG、JPEG、WebP、GIF 或 SVG 图片。'))
  if (file.size > 5 * 1024 * 1024)
    return Promise.reject(new Error('图片超过 5 MB，无法嵌入 HTML 原件。'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('error', () => reject(new Error('读取图片失败。')))
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/'))
        resolve(reader.result)
      else reject(new Error('图片内容无效。'))
    })
    reader.readAsDataURL(file)
  })
}

async function loadPictureDataUrl(src: string): Promise<string> {
  if (/^data:image\//i.test(src)) {
    if (src.length > 7 * 1024 * 1024) throw new Error('图片超过 5 MB，无法进行像素编辑。')
    return src
  }
  if (!/^https?:\/\//i.test(src))
    throw new Error('当前图片使用相对资源地址；请先选择本地图片或替换为可访问的 URL。')
  let response: Response
  try {
    response = await fetch(src, { credentials: 'omit', mode: 'cors' })
  } catch {
    throw new Error('图片资源无法跨域读取；请先选择本地图片。')
  }
  if (!response.ok) throw new Error(`读取图片失败（HTTP ${response.status}）。`)
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
  if (!mime.startsWith('image/')) throw new Error('图片资源的类型无效。')
  const blob = await response.blob()
  return imageDataUrl(new File([blob], 'picture', { type: mime }))
}

const PICTURE_LABELS: ImageDialogLabels = {
  cancel: '取消',
  apply: '应用',
  applying: '处理中…',
  loading: '图片加载中…',
  loadFailed: '图片加载失败',
  processFailed: '像素处理失败',
  cutoutTitle: '去除图片背景',
  tolerance: '容差',
  cutoutHint: (removedPct) => `已预览移除约 ${removedPct}% 的像素`,
  cropTitle: '裁切图片',
  cropHint: '拖动边缘或角点调整保留区域。',
}

function imageSrcAt(document: HtmlAgentDocument, sid: number): string | null {
  const entry = document.map.bySid.get(sid)
  if (entry?.tag !== 'img') return null
  const startTag = document.text.slice(entry.startTag[0], entry.startTag[1])
  return (
    new DOMParser()
      .parseFromString(startTag, 'text/html')
      .querySelector('img')
      ?.getAttribute('src') ?? null
  )
}

/**
 * 预览的三种排法。
 *
 * | 值 | 界面 | 什么时候用 |
 * |---|---|---|
 * | `source` | 只有源码 | 改样式表、找一处结构（预览不参与） |
 * | `split` | 源码在左、预览在右 | 默认。HTML 的源码与它渲染出来的样子差了十万八千里，只看源码等于用记事本打开网页 |
 * | `preview` | 只有预览 | 只看效果（点选、定位都还在） |
 */
type HtmlView = 'source' | 'split' | 'preview'

/** 预览的设备档位。桌面档铺满预览栏，另外两档有固定宽度（写在 editors.css） */
type HtmlDevice = 'desktop' | 'tablet' | 'phone'

/**
 * 预览里选中的元素。
 *
 * **整条 `ElementFingerprint` 都留着，不只留 sid**：元素路径（面包屑）的最后
 * 一段要用 `tag` 与 `className`，而这两个只出现在 `gx:select` 的载荷里——
 * `ParseMap` 的元素只有标签名，没有 class。上一版只存 sid，于是路径上既看不出
 * 这是 `div` 还是 `section`，也看不出是哪个 class 的那一个。
 */
interface SelectedElement {
  sid: number
  tag: string
  /** 原样的 `class` 属性（可能是好几个类名），没有时是空串 */
  className: string
  computed?: {
    fontWeight?: string
    fontStyle?: string
    fontSize?: string
    color?: string
    textAlign?: string
    background?: string
    width?: string
    height?: string
    transform?: string
    objectFit?: string
    image?: { src?: string; alt?: string; naturalWidth?: number; naturalHeight?: number }
  }
}

/** 元素路径（面包屑）里的一段 */
interface TrailItem {
  sid: number
  tag: string
  className: string
  /** 显示与读屏都用它（`section.hero` 这种） */
  label: string
}

/**
 * 路径上显示的名字：标签名 + **第一个** class。
 *
 * 只取第一个：`class="a b c"` 全写上去会占掉半条工具条，而面包屑是「认路」
 * 用的，不是把属性列全的地方。没有 class 时就只有标签名。
 */
function elementLabel(tag: string, className: string): string {
  const first = className.trim().split(/\s+/)[0] ?? ''
  return first === '' ? tag : `${tag}.${first}`
}

/** Read an opening tag without mistaking text inside another quoted attribute for `style`. */
function hasInlineStyle(startTag: string): boolean {
  const tagName = /^<[^\s/>]+/.exec(startTag)
  if (!tagName) return false
  const attributes = /(\s+)([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/gy
  attributes.lastIndex = tagName[0].length
  let match: RegExpExecArray | null
  while ((match = attributes.exec(startTag))) {
    if (match[2]?.toLowerCase() === 'style') return true
  }
  return false
}

/**
 * 缩放吸附：夹到 `[50, 200]` 并取到 10 的倍数。
 *
 * `ToolbarNumberField` 没有 `step`（它的契约是「夹到 `[min,max]`、空值与非
 * 数字都不提交」），所以步长在这里做。上游那一档也是 10 一档。
 */
function normalizeZoom(value: number): number {
  return Math.min(200, Math.max(50, Math.round(value / 10) * 10))
}

export interface HtmlAgentServices {
  planPage: NonNullable<HtmlAgentHooks['planPage']>
  writeDocument: NonNullable<HtmlAgentHooks['writeDocument']>
}

export function HtmlEditor({
  documentId,
  io,
  onDirtyChange,
  onAgentHandleChange,
  agentServices,
  onAiPreset,
  flush = false,
}: EditorProps & {
  onAgentHandleChange?: (handle: HtmlAgentHandle | null) => void
  agentServices?: HtmlAgentServices
  onAiPreset?: ((instruction: string) => void) | undefined
}) {
  const source = useSource(io, documentId)
  const [elementInspectorDocument, setElementInspectorDocument] = useState<string | null>(null)
  const elementInspectorTrigger = useRef<HTMLButtonElement | null>(null)
  const [dirty, setDirty] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const closePresentation = useCallback(() => setPresenting(false), [])
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  /** 预览里选中的元素（源码侧高亮、元素路径都由它驱动） */
  const [selected, setSelected] = useState<SelectedElement | null>(null)
  const [promptRequest, setPromptRequest] = useState<HtmlPromptRequest | null>(null)
  const [pictureDialog, setPictureDialog] = useState<{
    kind: 'crop' | 'cutout'
    sid: number
    version: number
    src: string
    image: string
  } | null>(null)
  const [pictureError, setPictureError] = useState<string | null>(null)
  const promptSerialRef = useRef(0)
  const promptRequestRef = useRef<HtmlPromptRequest | null>(null)
  /**
   * 视图、设备、缩放。
   *
   * **换视图不是「卸载另一栏」**：源码编辑器一旦卸载，CodeMirror 的实例与
   * 编辑历史一起没了，而重新挂载时 `SourceEditor` 只吃 `initialText`
   * ——那是**刚打开文件时**的文本（`initial` 不随编辑前进）。于是「切到预览
   * 再切回来」会看到旧内容，接着敲键就把中间改的东西覆盖掉。所以两个栏位
   * **始终挂着**，只用 `hidden` 决定谁在布局里——文件是真身，视图只是它的一
   * 种呈现。这条不写下来，下一次「顺手改成条件渲染」就会静默丢内容。
   */
  const [view, setView] = useState<HtmlView>('split')
  const [device, setDevice] = useState<HtmlDevice>('desktop')
  const [zoom, setZoom] = useState(100)
  /**
   * 撤销/重做的可用性。
   *
   * **必须存进 state**：`canUndo()` 是命令式的（要 CodeMirror 的 view），而渲染
   * 期读 ref 会被 React Compiler 判违规（`react(refs)`——整个组件静默不再优化）。
   * 于是在**编辑器回调与事件里**取一次，再喂给按钮的 `disabled`。
   */
  const [history, setHistory] = useState({ canUndo: false, canRedo: false })
  /** 查找替换栏的显隐、查询串与两个开关（栏本身是受控的） */
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findOptions, setFindOptions] = useState<FindOptions>({
    matchCase: false,
    wholeWord: false,
  })
  /**
   * 查找/替换的适配器。
   *
   * `findTarget()` 返回的对象在编辑器存活期间是**同一个**（`cmFindTarget` 把
   * 状态放在闭包与 CodeMirror 的 StateField 里），所以打开栏时取一次就够。
   */
  const [findAdapter, setFindAdapter] = useState<FindReplaceAdapter | null>(null)
  /**
   * 预览渲染好了吗（`gx:ready` 握手）。
   *
   * **沙箱里没有 `allow-same-origin`，所以父页读不到 frame 的 DOM**
   * （`contentDocument` 是 null——opaque origin）。这不是缺陷，是那条属性的
   * 代价：给了它，被编辑的页面就能碰宿主的 cookie 与 localStorage。
   *
   * 于是「预览到底出来了没有」只能靠 frame 主动报——检视脚本挂载时会发
   * `gx:ready`。没有这条握手的话，预览白屏与预览正在加载在界面上完全一样。
   */
  const [previewReadyVersion, setPreviewReadyVersion] = useState<number | null>(null)
  /** 预览页面的标题（来自 `gx:ready`），用来在状态行确认渲染的是哪一份 */
  const [previewTitle, setPreviewTitle] = useState<string | null>(null)
  const editorRef = useRef<SourceEditorHandle>(null)
  const findFocusPending = useRef(false)
  useEffect(() => {
    if (findOpen || !findFocusPending.current) return
    findFocusPending.current = false
    editorRef.current?.focus()
  }, [findOpen])
  const agentRef = useRef<HtmlAgentHandle | null>(null)
  const selectedSidRef = useRef<number | null>(null)
  const textSelectionRef = useRef<{
    sid: number
    index: number
    start: number
    end: number
  } | null>(null)
  const onAgentHandleChangeRef = useRef(onAgentHandleChange)
  const onDirtyChangeRef = useRef(onDirtyChange)
  const agentServicesRef = useRef(agentServices)
  const { draft: writingDraft, writeDocument: writeDraft } = useHtmlWriting(
    agentServicesRef,
    agentRef,
  )
  const writeDocument = useCallback<NonNullable<HtmlAgentHooks['writeDocument']>>(
    (input) => {
      setView((current) => (current === 'source' ? 'split' : current))
      return writeDraft(input)
    },
    [writeDraft],
  )
  useEffect(() => {
    onAgentHandleChangeRef.current = onAgentHandleChange
    onDirtyChangeRef.current = onDirtyChange
    agentServicesRef.current = agentServices
  })
  /**
   * 预览 frame。**父页碰不到它的 DOM**（opaque origin），只能 postMessage：
   * 点面包屑时要让预览也选中那一个元素，走的就是这条路（`gx:select`，
   * 检视脚本在 `inspector.js` 的消息分支里处理）。
   */
  const frameRef = useRef<HTMLIFrameElement>(null)

  /**
   * 解码 + 拆信封。**只依赖字节**：换文件（或重试读到新字节）才重跑，
   * 而编辑过程中的文本变化不会回灌编辑器（会丢光标）。
   */
  const decoded = useParsed(source.bytes, async (bytes) => {
    const raw = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(bytes)
    return parseEnvelope(raw)
  })

  /**
   * 文档状态：文本 + 它的结构映射。
   *
   * ## 为什么要带 `previous` 重建（sid 的稳定性）
   *
   * `buildParseMap` 的第三个参数让它给**未变动的元素**沿用原来的 `sid`，
   * 只给新元素分配新号。不传的话每次敲键都重排一遍编号，于是「预览里选中
   * 第 7 个元素 → 定位到源码」会在下一次编辑后指向别的元素——一个点错位置
   * 的跳转，比不能跳更糟。
   *
   * ## 为什么不由 `text` 单独派生
   *
   * 只依赖 `text` 的话拿不到「上一份 map」（它是随文本一起演进的）。而把
   * 上一份放在 ref 里、在渲染期读出来——那是 React Compiler 明令禁止的
   * （`react(refs)`，会让整个组件不再被优化）。
   *
   * 所以**文本与映射存在同一个 state 里**，在 `onChange`（一个事件）里一起
   * 前进：React 的数据流只允许在事件或 effect 里改 state，而这里正好是事件。
   */
  const [edited, setEdited] = useState<EditedDoc | null>(null)
  const [cssPreview, setCssPreview] = useState<{
    text: string
    version: number
    sid: number
  } | null>(null)
  const previewCss = useCallback((sid: number, styles: Record<string, string> | null) => {
    if (!styles) return setCssPreview(null)
    const handle = agentRef.current
    if (!handle || sid !== selectedSidRef.current) return
    const current = handle.getDocument()
    const compiled = compileOps(current.text, current.map, [{ op: 'set_style', sid, styles }])
    if (compiled.errors.length) return
    setCssPreview({
      text: applyHtmlPatches(current.text, compiled.patches),
      version: current.version,
      sid,
    })
  }, [])

  /** 首次载入（还没编辑过）时的文档——纯派生，不碰 ref */
  const initial = useMemo<EditedDoc | null>(() => {
    if (decoded.value === null) return null
    return { text: decoded.value.text, map: buildParseMap(decoded.value.text, 1, null), version: 1 }
  }, [decoded.value])

  const doc = edited ?? initial
  const previewReady = doc !== null && previewReadyVersion === doc.version

  /**
   * 预览用的 HTML。
   *
   * `instrumentForPreview` 给每个元素加上 `data-sid` 并把检视脚本注入
   * `<body>` 之前——**保存的文本永远不含这两样**（那个函数只作用于预览副本）。
   */
  const previewHtml = useMemo(() => {
    if (doc === null) return null
    if (writingDraft?.version === doc.version) return writingDraft.html
    if (cssPreview && cssPreview.version === doc.version && cssPreview.sid === selected?.sid) {
      return instrumentForPreview(
        cssPreview.text,
        buildParseMap(cssPreview.text, doc.version, doc.map),
        inspectorSource,
      )
    }
    return instrumentForPreview(doc.text, doc.map, inspectorSource)
  }, [doc, cssPreview, selected?.sid, writingDraft])

  /**
   * 选中的元素**在当前的映射里**还活着吗。
   *
   * 编辑会把元素删掉（或换掉），而选中状态还停在旧 sid 上。**在渲染期派生
   * 而不是在 effect 里清 state**：派生没有中间态，也不会踩
   * `set-state-in-effect` 的级联渲染。sid 稳定（见 `edited`）所以常见的编辑
   * 不会让选中掉下来，只有元素真的没了才掉——那是诚实的。
   */
  const activeSelected = useMemo<SelectedElement | null>(() => {
    if (selected === null || doc === null) return null
    return doc.map.bySid.has(selected.sid) ? selected : null
  }, [selected, doc])

  const selectedHasInlineStyle = useMemo(() => {
    if (!activeSelected || !doc) return false
    const entry = doc.map.bySid.get(activeSelected.sid)
    return entry ? hasInlineStyle(doc.text.slice(entry.startTag[0], entry.startTag[1])) : false
  }, [activeSelected, doc])

  /**
   * 元素路径：从根到选中元素。
   *
   * 祖先来自 `ancestorsOf`（映射里的 `parentSid` 链，自带防环），最后一段用
   * `gx:select` 带回来的 `tag`/`className`。
   */
  const trail = useMemo<TrailItem[]>(() => {
    if (activeSelected === null || doc === null) return []
    const chain = ancestorsOf(doc.map, activeSelected.sid).map((entry) => ({
      sid: entry.sid,
      tag: entry.tag,
      className: '',
      label: entry.tag,
    }))
    return [
      ...chain,
      {
        sid: activeSelected.sid,
        tag: activeSelected.tag,
        className: activeSelected.className,
        label: elementLabel(activeSelected.tag, activeSelected.className),
      },
    ]
  }, [activeSelected, doc])

  /** CodeMirror 历史由事件同步到按钮状态，渲染期不读取命令式句柄。 */
  const syncHistory = useCallback(() => {
    const handle = editorRef.current
    const next = {
      canUndo: handle?.canUndo() ?? false,
      canRedo: handle?.canRedo() ?? false,
    }
    setHistory((prev) =>
      prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next,
    )
  }, [])

  /**
   * 预览 frame 发回来的消息（点选）。
   *
   * 预览的直接编辑、拖拽和快捷键通过同一 HtmlOp 句柄回写源码。
   */
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as {
        type?: string
        version?: number
        title?: string
        element?: {
          sid?: number
          tag?: string
          className?: string
          computed?: SelectedElement['computed']
        } | null
        sid?: number
        textNodeIndex?: number
        start?: number
        end?: number
        newText?: string
        html?: string
        command?: string
        delta?: number
        computed?: SelectedElement['computed']
        styles?: Record<string, string | null>
        position?: 'before' | 'after'
        ref_sid?: number
      } | null
      if (!data || typeof data.type !== 'string') return
      // The upstream inspector stamps every message with the parse-map version.
      // srcdoc reloads can deliver a late edit from the previous page instance.
      if (data.version !== agentRef.current?.getVersion()) return

      if (data.type === 'gx:ready') {
        setPreviewReadyVersion(data.version ?? null)
        setPreviewTitle(data.title ?? null)
        if (selectedSidRef.current !== null)
          frameRef.current?.contentWindow?.postMessage(
            { type: 'gx:select', sid: selectedSidRef.current },
            '*',
          )
        return
      }
      if (data.type === 'gx:rect') {
        if (typeof data.sid === 'number' && data.sid === selectedSidRef.current && data.computed)
          setSelected((current) =>
            current !== null && current.sid === data.sid
              ? { ...current, computed: data.computed }
              : current,
          )
        return
      }
      if (data.type === 'gx:select') {
        textSelectionRef.current = null
        /**
         * 选中的元素。**`sid` 在 `element` 里**（`ElementFingerprint`），
         * 而 `element: null` 表示点到了空白处——那时要清掉选中，否则
         * 「点了别处但高亮还停在原处」。
         *
         * 脚本对**动态生成**的元素（源码里没有对应位置的）也会给出
         * `element: null`（它用 `dynamic: true` 标出来）。那种元素在源码里
         * 没有偏移可定位，所以清掉选中是诚实的：点它跳不过去。
         */
        const element = data.element
        setSelected(
          element !== null && element !== undefined && typeof element.sid === 'number'
            ? {
                sid: element.sid,
                tag: element.tag ?? '',
                className: element.className ?? '',
                computed: element.computed,
              }
            : null,
        )
        selectedSidRef.current = typeof element?.sid === 'number' ? element.sid : null
        return
      }
      if (data.type === 'gx:textSelect') {
        if (
          Number.isSafeInteger(data.sid) &&
          Number.isSafeInteger(data.textNodeIndex) &&
          Number.isSafeInteger(data.start) &&
          Number.isSafeInteger(data.end) &&
          (data.end ?? 0) > (data.start ?? 0)
        ) {
          textSelectionRef.current = {
            sid: data.sid!,
            index: data.textNodeIndex!,
            start: data.start!,
            end: data.end!,
          }
        }
        return
      }
      const handle = agentRef.current
      if (data.type === 'gx:textEditCommit' && handle) {
        if (
          Number.isSafeInteger(data.sid) &&
          Number.isSafeInteger(data.textNodeIndex) &&
          typeof data.newText === 'string'
        )
          handle.applyOps(
            [
              {
                op: 'set_text_node',
                sid: data.sid!,
                index: data.textNodeIndex!,
                text: data.newText,
              },
            ],
            { highlight: false },
          )
        return
      }
      if (data.type === 'gx:htmlEditCommit' && handle) {
        if (Number.isSafeInteger(data.sid) && typeof data.html === 'string')
          handle.applyOps([{ op: 'set_inner_html', sid: data.sid!, html: data.html }], {
            highlight: false,
          })
        return
      }
      if (data.type === 'gx:resize' && handle) {
        if (Number.isSafeInteger(data.sid) && data.sid === selectedSidRef.current && data.styles)
          handle.applyOps([{ op: 'set_style', sid: data.sid, styles: data.styles }], {
            highlight: false,
          })
        return
      }
      if (data.type === 'gx:moveTo' && handle) {
        if (
          Number.isSafeInteger(data.sid) &&
          Number.isSafeInteger(data.ref_sid) &&
          (data.position === 'before' || data.position === 'after')
        )
          handle.applyOps(
            [{ op: 'move', sid: data.sid!, ref_sid: data.ref_sid!, position: data.position }],
            { highlight: false },
          )
        return
      }
      if (data.type === 'gx:zoom' && typeof data.delta === 'number') {
        setZoom((current) => normalizeZoom(current - data.delta! * 0.6))
        return
      }
      if (data.type === 'gx:keyCommand' && handle) {
        const command = data.command
        if (command === 'undo' || command === 'redo') {
          editorRef.current?.[command]()
          syncHistory()
          return
        }
        if (command === 'zoomReset') {
          setZoom(100)
          return
        }
        if (command === 'zoomIn' || command === 'zoomOut') {
          setZoom((current) => normalizeZoom(current + (command === 'zoomIn' ? 10 : -10)))
          return
        }
        if (command === 'escape') {
          setSelected(null)
          selectedSidRef.current = null
          textSelectionRef.current = null
          return
        }
        const sid = selectedSidRef.current
        const current = handle.getDocument()
        const entry = sid === null ? undefined : current.map.bySid.get(sid)
        if (!entry || sid === null) return
        if (command === 'delete') {
          handle.applyOps([{ op: 'remove', sid }], { highlight: false })
          setSelected(null)
          selectedSidRef.current = null
          return
        }
        if (command === 'moveUp' || command === 'moveDown') {
          const target = moveTarget(current.map, sid, command === 'moveUp' ? -1 : 1)
          if (target) handle.applyOps([{ op: 'move', sid, ...target }], { highlight: false })
          return
        }
        if (command === 'bold' || command === 'italic') {
          const selection = textSelectionRef.current
          if (selection?.sid === sid)
            handle.applyOps(
              [
                {
                  op: 'wrap_text',
                  sid,
                  index: selection.index,
                  start: selection.start,
                  end: selection.end,
                  tag: command === 'bold' ? 'strong' : 'em',
                },
              ],
              { highlight: false },
            )
          textSelectionRef.current = null
          return
        }
        let target: number | null = null
        if (command === 'parent') target = entry.parentSid
        if (command === 'child') target = childrenOf(current.map, sid)[0]?.sid ?? null
        if ((command === 'next' || command === 'prev') && entry.parentSid !== null) {
          const siblings = childrenOf(current.map, entry.parentSid)
          const index = siblings.findIndex((item) => item.sid === sid)
          target = siblings[index + (command === 'next' ? 1 : -1)]?.sid ?? null
        }
        if (target !== null) {
          const next = current.map.bySid.get(target)
          if (next && next.tag !== 'html' && next.tag !== 'body') {
            selectedSidRef.current = target
            setSelected({ sid: target, tag: next.tag, className: '' })
            frameRef.current?.contentWindow?.postMessage({ type: 'gx:select', sid: target }, '*')
          }
        }
      }
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [syncHistory])

  useEffect(() => {
    if (initial === null) return
    let active = true
    const publishPrompt = (request: HtmlPromptRequest, signal?: AbortSignal) => {
      let settled = false
      const finish = () => {
        if (settled) return false
        settled = true
        signal?.removeEventListener('abort', cancel)
        if (promptRequestRef.current === request) {
          promptRequestRef.current = null
          setPromptRequest((current) => (current?.id === request.id ? null : current))
        }
        return true
      }
      if (request.kind === 'questions') {
        const resolve = request.resolve
        request.resolve = (answer) => {
          if (finish()) resolve(answer)
        }
      } else {
        const resolve = request.resolve
        request.resolve = (brief) => {
          if (finish()) resolve(brief)
        }
      }
      const cancel = () => {
        if (request.kind === 'questions') request.resolve({ answers: '', cancelled: true })
        else request.resolve(null)
      }
      if (!active || signal?.aborted) {
        cancel()
        return
      }
      const previous = promptRequestRef.current
      if (previous?.kind === 'questions') previous.resolve({ answers: '', cancelled: true })
      else if (previous?.kind === 'brief') previous.resolve(null)
      promptRequestRef.current = request
      setPromptRequest(request)
      signal?.addEventListener('abort', cancel, { once: true })
    }
    const handle = new HtmlAgentHandle(documentId, initial.text, {
      applyPatches: (patches, highlight) => {
        editorRef.current?.applyPatches(patches, highlight)
      },
      replaceDoc: (text, highlight) => {
        editorRef.current?.replaceDoc(text, highlight)
      },
      onDocument: (next: HtmlAgentDocument) => {
        setEdited(next)
        if (selectedSidRef.current !== null && !next.map.bySid.has(selectedSidRef.current)) {
          selectedSidRef.current = null
        }
        setDirty(true)
        onDirtyChangeRef.current?.(true)
        syncHistory()
      },
      getSelectedSid: () => selectedSidRef.current,
      askClarification: (questions, signal) =>
        new Promise((resolve) => {
          const request: HtmlPromptRequest = {
            id: ++promptSerialRef.current,
            kind: 'questions',
            questions,
            resolve,
          }
          publishPrompt(request, signal)
        }),
      confirmBrief: (brief, mode, signal) =>
        new Promise((resolve) => {
          const request: HtmlPromptRequest = {
            id: ++promptSerialRef.current,
            kind: 'brief',
            brief,
            mode,
            resolve,
          }
          publishPrompt(request, signal)
        }),
      planPage: async (input) => {
        if (!agentServicesRef.current) throw new Error('页面规划服务尚未就绪。')
        return agentServicesRef.current.planPage(input)
      },
      writeDocument,
    })
    agentRef.current = handle
    onAgentHandleChangeRef.current?.(handle)
    return () => {
      active = false
      const pending = promptRequestRef.current
      if (pending?.kind === 'questions') pending.resolve({ answers: '', cancelled: true })
      else if (pending?.kind === 'brief') pending.resolve(null)
      agentRef.current = null
      onAgentHandleChangeRef.current?.(null)
    }
  }, [initial, documentId, syncHistory, writeDocument])

  /** 把某个元素在源码里选中（这样「预览点到哪、源码跳到哪」） */
  const revealSid = useCallback(
    (sid: number) => {
      if (doc === null) return
      /** `bySid` 是映射自带的索引——不必线性找一个元素 */
      const entry = doc.map.bySid.get(sid)
      if (!entry) return
      // `endTag` 是可选元组：没有闭合标签的元素（如 <img>）只选它的开始标签
      const end = entry.endTag ? entry.endTag[1] : entry.startTag[1]
      editorRef.current?.revealRange(entry.startTag[0], end, true)
    },
    [doc],
  )

  /**
   * 走元素路径上的某一段：预览选中它、源码选中它。
   *
   * 预览那一半是 postMessage（父页读不到 frame 的 DOM，见 `frameRef`）；
   * 检视脚本对**同一条 `gx:select`** 的处理与用户手点一样，所以两边的高亮
   * 不会出现两种画法。
   */
  const activateTrailItem = (item: TrailItem) => {
    setSelected({ sid: item.sid, tag: item.tag, className: item.className })
    selectedSidRef.current = item.sid
    frameRef.current?.contentWindow?.postMessage({ type: 'gx:select', sid: item.sid }, '*')
    // 源码栏没露出来时不去「选中」——那是看不见的动作，切回来时才看到结果
    if (view !== 'preview') revealSid(item.sid)
  }

  /**
   * 设备与缩放只作用在**预览**上：在只看源码时动它们，就把预览带回来。
   *
   * 不带回来的话那是一次「点了没反应」——这个仓库最不能接受的一类界面
   * （DESIGN §8.4）。带回来至少让动作有可见的结果，而且意图也说得通：
   * 选手机宽度就是想看它渲染出来什么样。
   */
  const revealPreview = () => {
    if (view === 'source') setView('split')
  }

  const closeFind = () => {
    findFocusPending.current = true
    if (view === 'preview') setView('split')
    setFindOpen(false)
  }

  /** 打开/关掉查找栏 */
  const toggleFind = () => {
    if (findOpen) {
      closeFind()
      return
    }
    openFind()
  }

  /**
   * 打开查找栏（**不切换**）。
   *
   * 与 toggle 分开是因为 Ctrl+F 的语义是「显示查找」——已经开着时再按
   * 应当是聚焦而不是把它关掉（否则快捷键会在连按时一闪一闪）。
   */
  const openFind = () => {
    /**
     * 适配器在**事件里**从 ref 取（渲染期读 ref 会被编译器判违规，而
     * `findTarget()` 要 CodeMirror 的 view）。取到 null 时栏仍然打开：那是
     * 它契约里的「还没有可查的内容」，按钮会如实禁用，不是一条装死的栏。
     */
    setFindAdapter(editorRef.current?.findTarget() ?? null)
    /**
     * 高亮画在**源码**上。只看预览时打开查找，匹配数会跳但没有一处高亮可见
     * ——把源码栏带回来，而不是让人对着「3 / 12」猜画在哪。
     */
    if (view === 'preview') setView('split')
    setFindOpen(true)
  }

  /** Ctrl+F（工具条按钮上没写这个快捷键，但它是同类编辑器的通行约定） */
  useFindHotkey(openFind)

  const save = async () => {
    if (decoded.value === null || doc === null) return
    const savedVersion = agentRef.current?.getVersion() ?? doc.version
    const bytes = new TextEncoder().encode(serializeEnvelope(doc.text, decoded.value.envelope))
    const ok = await source.save(bytes, { name: 'page.html', mime: OFFICE_MIME.html })
    if (!ok) return
    // A save may finish after another manual or Agent edit. That newer canvas is still dirty.
    if ((agentRef.current?.getVersion() ?? doc.version) !== savedVersion) return
    setDirty(false)
    onDirtyChange?.(false)
  }

  const openPictureDialog = async (kind: 'crop' | 'cutout'): Promise<HtmlAgentResult> => {
    const handle = agentRef.current
    const sid = selectedSidRef.current
    if (!handle || sid === null)
      return { ok: false, changed: false, version: 0, error: '没有选中的图片。' }
    const current = handle.getDocument()
    const src = imageSrcAt(current, sid)
    if (!src)
      return {
        ok: false,
        changed: false,
        version: current.version,
        error: '图片没有可读取的来源。',
      }
    try {
      const image = await loadPictureDataUrl(src)
      if (
        agentRef.current !== handle ||
        handle.getVersion() !== current.version ||
        selectedSidRef.current !== sid ||
        imageSrcAt(handle.getDocument(), sid) !== src
      )
        return {
          ok: false,
          changed: false,
          version: handle.getVersion(),
          error: '图片或文档已变化，请重新选择。',
        }
      setPictureError(null)
      setPictureDialog({ kind, sid, version: current.version, src, image })
      return { ok: true, changed: false, version: current.version, summary: '图片编辑已打开。' }
    } catch (cause) {
      return {
        ok: false,
        changed: false,
        version: handle.getVersion(),
        error: cause instanceof Error ? cause.message : String(cause),
      }
    }
  }

  const applyPicturePng = (png: string) => {
    const dialog = pictureDialog
    const handle = agentRef.current
    if (!dialog || !handle) return
    if (png.length > 7 * 1024 * 1024) {
      setPictureError('处理后的 PNG 超过 5 MB，原件没有修改。')
      return
    }
    if (
      handle.getVersion() !== dialog.version ||
      selectedSidRef.current !== dialog.sid ||
      imageSrcAt(handle.getDocument(), dialog.sid) !== dialog.src
    ) {
      setPictureError('图片或文档已变化，处理结果没有应用。')
      return
    }
    const result = handle.applyOps(
      [{ op: 'set_attr', sid: dialog.sid, name: 'src', value: `data:image/png;base64,${png}` }],
      { expectedVersion: dialog.version, summary: '图片像素已更新。', highlight: false },
    )
    if (!result.ok) {
      setPictureError(result.error ?? '图片修改失败。')
      return
    }
    setPictureDialog(null)
    setPictureError(null)
  }

  const status = statusText({
    handle: source,
    dirty,
    idle: `第 ${cursor.line} 行 第 ${cursor.col} 列`,
  })

  if (source.loadError !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>读取失败</ToolbarLabel>}>
        <div className="me-state me-state--error">
          读取失败：{source.loadError}
          <div style={{ marginTop: 12 }}>
            <ToolbarButton label="重试" onClick={source.reload}>
              重试
            </ToolbarButton>
          </div>
        </div>
      </EditorShell>
    )
  }

  if (doc === null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>读取中…</ToolbarLabel>}>
        <div className="me-state">正在解析页面…</div>
      </EditorShell>
    )
  }

  /** 「定位到源码」为什么不能点——三个原因各不相同，不能合成一句「不可用」 */
  const revealReason =
    activeSelected === null
      ? '先在预览里点一个元素'
      : !previewReady
        ? '预览还在加载'
        : view === 'preview'
          ? '源码栏没有显示（切到分栏或源码视图）'
          : undefined

  /** 预览的缩放倍数（1 = 100%）。`zoom` 与 CSS 变量要的是同一个数 */
  const zoomScale = zoom / 100

  /**
   * 预览宿主层的行内样式。
   *
   * 缩放要**同时**喂两个地方：`zoom`（把预览画大）与 `--html-preview-zoom`
   * （把宿主的宽度按它的**局部像素**乘回来）——只给前者的话，放大出来的是
   * 「视口被缩窄再拉宽」，不是同一份布局放大。editors.css 上有实测数据。
   *
   * 类型写成交叉类型是因为 React 的 `CSSProperties` 里没有 CSS 自定义属性
   * （csstype 不建模它们），而 `style` 会把它原样传下去。**这里不用 `as`
   * 断言**：断言会把「属性名打错」也一起吞掉。
   */
  const previewHostStyle: CSSProperties & { '--html-preview-zoom': string } = {
    zoom: zoomScale,
    '--html-preview-zoom': String(zoomScale),
  }

  return (
    <EditorShell
      flush={flush}
      toolbar={
        <CompactToolbar
          quickAccess={
            <>
              <ToolbarButton
                label={source.saving ? '保存中…' : '保存到库'}
                disabled={!dirty || source.saving}
                disabledReason={source.saving ? '正在保存…' : '没有未保存的改动'}
                onClick={() => void save()}
              >
                <SaveIcon />
              </ToolbarButton>
              <ToolbarButton
                label="撤销 (Ctrl+Z)"
                disabled={!history.canUndo}
                disabledReason="没有可以撤销的改动了"
                onClick={() => {
                  editorRef.current?.undo()
                  syncHistory()
                }}
              >
                <UndoIcon />
              </ToolbarButton>
              <ToolbarButton
                label="重做 (Ctrl+Shift+Z)"
                disabled={!history.canRedo}
                disabledReason="没有可以重做的改动了"
                onClick={() => {
                  editorRef.current?.redo()
                  syncHistory()
                }}
              >
                <RedoIcon />
              </ToolbarButton>
            </>
          }
          tabs={[
            { key: 'home', label: '开始' },
            { key: 'insert', label: '插入' },
            { key: 'view', label: '视图' },
          ]}
          sections={[
            {
              key: 'output',
              label: 'HTML 输出',
              tab: 'view',
              minWidth: 0,
              content: (
                <>
                  <ToolbarButton label="演示页面" onClick={() => setPresenting(true)}>
                    演示
                  </ToolbarButton>
                  <ToolbarButton
                    label="在新窗口演示"
                    onClick={() => {
                      setActionError(null)
                      if (!openHtmlPresentation(agentRef.current?.getDocument().text ?? doc.text))
                        setActionError('演示窗口被浏览器阻止，请允许弹出窗口后重试。')
                    }}
                  >
                    新窗口
                  </ToolbarButton>
                  <ToolbarButton
                    label="导出 HTML"
                    onClick={() => {
                      if (decoded.value)
                        downloadHtml(
                          serializeEnvelope(
                            agentRef.current?.getDocument().text ?? doc.text,
                            decoded.value.envelope,
                          ),
                        )
                    }}
                  >
                    导出 HTML
                  </ToolbarButton>
                </>
              ),
            },
            {
              key: 'ai',
              label: '问 AI',
              tab: 'home',
              minWidth: 0,
              content: (
                <ToolbarMenu
                  label="问 AI"
                  text="问 AI"
                  items={[
                    {
                      key: 'restyle',
                      label: '问 AI：美化页面',
                      onSelect: () =>
                        onAiPreset?.(
                          '美化当前 HTML 页面：保留所有事实和正文，改善视觉层级、排版、间距与响应式布局。先读取当前源码，再应用修改。',
                        ),
                      disabled: !onAiPreset,
                      disabledReason: '当前宿主没有接入 AI 侧栏',
                    },
                    ...['极简', '杂志排版', '科技', '活泼', '深色'].map((theme) => ({
                      key: `theme-${theme}`,
                      label: `问 AI：${theme}主题`,
                      onSelect: () =>
                        onAiPreset?.(
                          `将当前 HTML 页面的视觉主题调整为${theme}风格，统一配色、字体与间距；保留所有正文和事实，先读取当前源码再应用修改。`,
                        ),
                      disabled: !onAiPreset,
                      disabledReason: '当前宿主没有接入 AI 侧栏',
                    })),
                    {
                      key: 'summarize',
                      label: '问 AI：总结页面',
                      onSelect: () =>
                        onAiPreset?.('阅读当前 HTML 页面，概括主要内容与关键结论，在对话中回答。'),
                      disabled: !onAiPreset,
                      disabledReason: '当前宿主没有接入 AI 侧栏',
                    },
                  ]}
                />
              ),
            },
            {
              key: 'view',
              label: '视图',
              tab: 'view',
              minWidth: 0,
              content: (
                <ToolbarToggleGroup
                  label="视图"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'source', label: '只看源码', icon: <CodeIcon /> },
                    { value: 'split', label: '源码与预览分栏', icon: <SplitViewIcon /> },
                    { value: 'preview', label: '只看预览', icon: <EyeIcon /> },
                  ]}
                />
              ),
            },
            {
              key: 'find',
              label: '查找和替换',
              tab: 'home',
              minWidth: 0,
              content: (
                <ToolbarButton label="查找和替换" active={findOpen} onClick={toggleFind}>
                  <FindIcon />
                </ToolbarButton>
              ),
            },
            {
              key: 'preview',
              label: '预览设备与缩放',
              tab: 'view',
              minWidth: 700,
              content: (
                <>
                  <ToolbarToggleGroup
                    label="预览设备"
                    value={device}
                    onChange={(next) => {
                      setDevice(next)
                      revealPreview()
                    }}
                    options={[
                      {
                        value: 'desktop',
                        label: '桌面宽度（铺满预览栏）',
                        icon: <DeviceDesktopIcon />,
                      },
                      { value: 'tablet', label: '平板宽度（768px）', icon: <DeviceTabletIcon /> },
                      { value: 'phone', label: '手机宽度（390px）', icon: <DevicePhoneIcon /> },
                    ]}
                  />
                  <ToolbarNumberField
                    label="预览缩放（%）"
                    value={zoom}
                    min={50}
                    max={200}
                    suffix="%"
                    onCommit={(next) => {
                      setZoom(normalizeZoom(next))
                      revealPreview()
                    }}
                  />
                </>
              ),
            },
            {
              key: 'insert',
              label: '插入元素',
              tab: 'insert',
              minWidth: 780,
              content: (
                <HtmlInsertMenu
                  onInsert={(kind, options) => {
                    const handle = agentRef.current
                    if (!handle)
                      return { ok: false, changed: false, version: 0, error: '编辑器尚未就绪。' }
                    const current = handle.getDocument()
                    const labels = {
                      heading: '新标题',
                      paragraph: '新段落',
                      listItem: '列表项',
                      button: '按钮',
                      sectionTitle: '章节标题',
                      sectionBody: '章节内容',
                      imageAlt: '',
                      tableHeaders: Array.from(
                        { length: options.cols ?? 3 },
                        (_, i) => `列 ${i + 1}`,
                      ),
                      tableCell: '内容',
                    }
                    const html = insertPresetHtml(kind, labels, {
                      imageSrc: options.url,
                      tableBodyRows: Math.max(1, (options.rows ?? 3) - 1),
                    })
                    const selectedEntry =
                      selectedSidRef.current === null
                        ? undefined
                        : current.map.bySid.get(selectedSidRef.current)
                    const op = insertOp(current.map, selectedEntry, html)
                    if (!op)
                      return {
                        ok: false,
                        changed: false,
                        version: current.version,
                        error: '当前页面没有可插入的位置。',
                      }
                    return handle.applyOps([op], {
                      expectedVersion: current.version,
                      summary: '已插入 HTML 元素。',
                      highlight: false,
                    })
                  }}
                />
              ),
            },
            {
              key: 'selection',
              label: activeSelected
                ? `选中 <${elementLabel(activeSelected.tag, activeSelected.className)}>`
                : '元素',
              tab: 'home',
              minWidth: 950,
              content: (
                <>
                  <ToolbarButton
                    label="定位到源码里选中的元素"
                    disabled={revealReason !== undefined}
                    disabledReason={revealReason}
                    onClick={() => {
                      if (activeSelected !== null) revealSid(activeSelected.sid)
                    }}
                  >
                    定位选中元素
                  </ToolbarButton>
                  <ToolbarButton
                    label="清除选中元素的行内样式"
                    disabled={!selectedHasInlineStyle}
                    disabledReason={
                      activeSelected === null ? '先在预览里点一个元素' : '选中元素没有行内样式'
                    }
                    onClick={() => {
                      const handle = agentRef.current
                      const sid = selectedSidRef.current
                      if (!handle || sid === null) return
                      const current = handle.getDocument()
                      const entry = current.map.bySid.get(sid)
                      if (
                        !entry ||
                        !hasInlineStyle(current.text.slice(entry.startTag[0], entry.startTag[1]))
                      )
                        return
                      handle.applyOps([{ op: 'set_attr', sid, name: 'style', value: null }], {
                        expectedVersion: current.version,
                        summary: '已清除元素行内样式。',
                        highlight: false,
                      })
                    }}
                  >
                    清除行内样式
                  </ToolbarButton>
                  <ToolbarButton
                    ref={elementInspectorTrigger}
                    label="元素编辑"
                    active={elementInspectorDocument === documentId}
                    onClick={() => {
                      setElementInspectorDocument((current) =>
                        current === documentId ? null : documentId,
                      )
                    }}
                  >
                    编辑元素
                  </ToolbarButton>
                </>
              ),
            },
          ]}
        />
      }
      /*
        次工具条：查找栏 + 元素路径。**两条都落在这里**（`subbar` 与工具条同包
        在 sticky 容器里，见 shell.css）。

        内容为空时**整个槽位不传**：不留一条空行让人以为这里本来该有东西。
        也**不做「先放一句提示」**——那会永久占掉一行，而提示在状态行上已经有
        了（「点一个元素可以定位到它的源码」）。元素路径与 pptx 的段落面板
        同一种出现方式：有选中才出来。
      */
      subbar={
        findOpen || trail.length > 0 || actionError !== null || writingDraft !== null ? (
          <>
            {writingDraft && (
              <HtmlWritingPreview draft={writingDraft} currentVersion={doc.version} />
            )}
            {actionError && <div role="alert">{actionError}</div>}
            {/*
              查找栏放在前面是有意的：它的宽度是 100%，会自己占掉一整行。
              放后面的话元素路径一打开查找就被挤下去——一行里的东西平移比
              下面多一行更晃眼。
            */}
            {findOpen && (
              <FindReplaceBar
                adapter={findAdapter}
                query={findQuery}
                onQueryChange={setFindQuery}
                options={findOptions}
                onOptionsChange={setFindOptions}
                onClose={closeFind}
              />
            )}
            {/*
              元素路径。**用 `gx:select` 带回来的 tag/className**（映射里只有
              标签名），祖先段只有标签名——那正是我们从映射里知道的全部。

              分隔符是装饰（`aria-hidden`）：读屏用户听到的是那几个可点项，
              不是一串「›」。
            */}
            {trail.length > 0 && (
              <nav className="mimir-html-crumbs" aria-label="元素路径">
                {trail.map((item, index) => (
                  <Fragment key={item.sid}>
                    {index > 0 && (
                      <span className="mimir-html-crumbs__sep" aria-hidden="true">
                        <ChevronRightIcon />
                      </span>
                    )}
                    <ToolbarButton
                      label={`选中 ${item.label}`}
                      // 最后一段就是当前选中的那个元素
                      active={index === trail.length - 1}
                      onClick={() => activateTrailItem(item)}
                    >
                      {item.label}
                    </ToolbarButton>
                  </Fragment>
                ))}
              </nav>
            )}
          </>
        ) : undefined
      }
      status={
        <>
          <ToolbarLabel>{status}</ToolbarLabel>
          <ToolbarLabel>
            {!previewReady
              ? '预览加载中…'
              : activeSelected === null
                ? `预览已就绪${previewTitle ? `（${previewTitle}）` : ''}`
                : `已选中 <${elementLabel(activeSelected.tag, activeSelected.className)}>`}
          </ToolbarLabel>
        </>
      }
    >
      {/*
        左右分栏：源码在左、预览在右。**预览是本格式存在的理由**——HTML 的
        源码与它渲染出来的样子差了十万八千里，只看源码等于用记事本打开网页。
        实际分栏区域不足 800px 时改为上下叠放，见 editors.css。

        两栏都用 `hidden` 控制显隐（**不卸载**）：源码编辑器卸载就会丢掉
        CodeMirror 的实例与编辑历史，重新挂载读的是刚打开文件时的文本——
        那是静默丢内容，理由写在 `view` 的说明里。
      */}
      <div className="mimir-html-workspace">
        <div className="mimir-html-split-container">
          <div className="mimir-html-split">
            <div className="mimir-html-source" hidden={view === 'preview'}>
              <SourceEditor
                ref={editorRef}
                initialText={initial?.text ?? doc.text}
                className="mimir-html-cm"
                onChange={(next) => {
                  /**
                   * 文本与映射一起前进（理由见 `edited` 的说明）。
                   * 用更新函数形式读 `prev`，于是「上一份 map」不必经过 ref。
                   */
                  const agent = agentRef.current
                  if (agent) agent.setManualText(next)
                  else
                    setEdited((prev) => {
                      const base = prev ?? initial
                      const version = (base?.version ?? 0) + 1
                      return {
                        text: next,
                        map: buildParseMap(next, version, base?.map ?? null),
                        version,
                      }
                    })
                  if (!dirty) {
                    setDirty(true)
                    onDirtyChange?.(true)
                  }
                  // 敲键、替换、撤销都会走到这里（撤销也改文档）
                  syncHistory()
                }}
                onCursor={(info) => {
                  setCursor(info)
                  const current = agentRef.current?.getDocument()
                  if (current) {
                    const entry = elementCovering(
                      current.map,
                      info.pos,
                      Math.min(info.pos + 1, current.text.length),
                    )
                    const sid =
                      entry && !['html', 'head', 'body'].includes(entry.tag) ? entry.sid : null
                    if (sid !== selectedSidRef.current) {
                      selectedSidRef.current = sid
                      setSelected(
                        entry && sid !== null ? { sid, tag: entry.tag, className: '' } : null,
                      )
                      frameRef.current?.contentWindow?.postMessage({ type: 'gx:select', sid }, '*')
                    }
                  }
                  // 撤销/重做会改选区，所以这条回调也是刷新撤销栈可用性的时机
                  syncHistory()
                }}
              />
            </div>
            {/*
          预览一侧。宿主层负责**宽度**（设备档位）与**缩放**：上游
          `PreviewFrame` 也把 `zoom` 加在这一层（frame 自己不该知道这些）。
        */}
            <div className="mimir-html-preview-pane" hidden={view === 'source'}>
              <div
                className="mimir-html-preview-host"
                data-device={device}
                style={previewHostStyle}
              >
                <iframe
                  ref={frameRef}
                  className="mimir-html-preview"
                  title="预览"
                  srcDoc={previewHtml ?? ''}
                  /*
                **不给 `allow-same-origin`**：给了它，frame 里的脚本就能碰宿主页的
                cookie 与 localStorage（srcdoc 是同源的），等于让被编辑的页面拿到
                mimir 的登录态。不给的话它在 opaque origin 里跑，拿不到任何东西。
                `allow-scripts` 必须给——真实页面大量依赖 CDN 脚本，禁掉就只剩
                一片空白（与上游同一条判断）。
              */
                  sandbox="allow-scripts allow-forms allow-popups allow-modals"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        </div>
        {promptRequest && (
          <HtmlAgentPrompt
            key={promptRequest.id}
            request={promptRequest}
            onClose={() => {
              if (promptRequestRef.current?.id === promptRequest.id) {
                promptRequestRef.current = null
                setPromptRequest((current) => (current?.id === promptRequest.id ? null : current))
              }
            }}
          />
        )}
        {!promptRequest && elementInspectorDocument === documentId && (
          <HtmlElementMenu
            key={documentId}
            version={doc.version}
            triggerRef={elementInspectorTrigger}
            onClose={() => setElementInspectorDocument(null)}
            targets={doc.map.elements
              .filter(
                (entry) =>
                  entry.sid !== activeSelected?.sid &&
                  !['html', 'head', 'body'].includes(entry.tag) &&
                  !(
                    activeSelected &&
                    ancestorsOf(doc.map, entry.sid).some(
                      (ancestor) => ancestor.sid === activeSelected.sid,
                    )
                  ),
              )
              .map((entry) => ({
                value: String(entry.sid),
                label: `${entry.path} — ${
                  doc.text
                    .slice(entry.inner[0], entry.inner[1])
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 42) || entry.tag
                }`,
              }))}
            onPreviewCss={previewCss}
            sid={activeSelected?.sid ?? null}
            tag={activeSelected?.tag ?? null}
            computed={activeSelected?.computed}
            onDuplicate={() => {
              const handle = agentRef.current
              const sid = selectedSidRef.current
              if (!handle || sid === null) return null
              const current = handle.getDocument()
              const entry = current.map.bySid.get(sid)
              if (!entry) return null
              const html = current.text.slice(entry.range[0], entry.range[1])
              return handle.applyOps(
                [{ op: 'insert_html', sid, position: 'after', html: `\n${html}` }],
                {
                  expectedVersion: current.version,
                  summary: '已复制元素。',
                  highlight: false,
                },
              )
            }}
            onMove={(direction) => {
              const handle = agentRef.current
              const sid = selectedSidRef.current
              if (!handle || sid === null) return null
              const current = handle.getDocument()
              const target = moveTarget(current.map, sid, direction)
              if (!target)
                return {
                  ok: false,
                  changed: false,
                  version: current.version,
                  error: '元素不能继续移动。',
                }
              return handle.applyOps([{ op: 'move', sid, ...target }], {
                expectedVersion: current.version,
                summary: '已移动元素。',
                highlight: false,
              })
            }}
            onPickImage={async (file) => {
              const handle = agentRef.current
              const sid = selectedSidRef.current
              if (!handle || sid === null)
                return { ok: false, changed: false, version: 0, error: '没有选中的图片。' }
              const version = handle.getVersion()
              const entry = handle.getDocument().map.bySid.get(sid)
              if (entry?.tag !== 'img')
                return { ok: false, changed: false, version, error: '选中的元素不是图片。' }
              try {
                const url = await imageDataUrl(file)
                if (agentRef.current !== handle || selectedSidRef.current !== sid)
                  return { ok: false, changed: false, version, error: '图片选择已改变。' }
                return handle.applyOps([{ op: 'set_attr', sid, name: 'src', value: url }], {
                  expectedVersion: version,
                  summary: '图片已嵌入 HTML 原件。',
                  highlight: false,
                })
              } catch (cause) {
                return {
                  ok: false,
                  changed: false,
                  version: handle.getVersion(),
                  error: cause instanceof Error ? cause.message : String(cause),
                }
              }
            }}
            onOpenPicture={openPictureDialog}
            onApply={(ops, expectedVersion) =>
              agentRef.current?.applyOps(ops, { highlight: false, expectedVersion }) ?? {
                ok: false,
                changed: false,
                version: 0,
                error: '编辑器尚未就绪。',
              }
            }
          />
        )}
      </div>
      {presenting && <HtmlPresentation html={doc.text} onClose={closePresentation} />}
      {pictureDialog && (
        <div className="mimir-html-picture-dialog">
          {pictureDialog.kind === 'crop' ? (
            <CropDialog
              labels={PICTURE_LABELS}
              image={pictureDialog.image}
              onApply={applyPicturePng}
              onCancel={() => {
                setPictureDialog(null)
                setPictureError(null)
              }}
            />
          ) : (
            <CutoutDialog
              labels={PICTURE_LABELS}
              image={pictureDialog.image}
              onApply={applyPicturePng}
              onCancel={() => {
                setPictureDialog(null)
                setPictureError(null)
              }}
            />
          )}
          {pictureError && (
            <div className="mimir-html-picture-error" role="alert">
              {pictureError}
            </div>
          )}
        </div>
      )}
    </EditorShell>
  )
}

/** 文档状态：文本、它的结构映射、以及映射的版本号 */
interface EditedDoc {
  text: string
  map: ParseMap
  version: number
}
