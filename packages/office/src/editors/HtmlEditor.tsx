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
 * ## 点选是「只读的检视」，不是完整的样式编辑
 *
 * 上游的 StylePanel 能改颜色/字号/边距（它调 `ops.ts` 生成补丁）。本版只做
 * **点选 → 高亮 → 显示这是哪个元素 → 顺着元素路径上下走**：样式编辑要接
 * `document/ops.ts`（514 行的操作编译器）与整个面板，那是下一步。所以状态行
 * 如实写着「点元素可以定位到源码」，而不是画一个看着能改却改不了的面板。
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  EditorShell,
  FindReplaceBar,
  useFindHotkey,
  ToolbarButton,
  ToolbarDivider,
  ToolbarLabel,
  ToolbarNumberField,
  ToolbarSpacer,
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
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import {
  SourceEditor,
  type SourceEditorHandle,
} from '../../vendor/apps/html/src/renderer/source/SourceEditor.js'
import {
  ancestorsOf,
  buildParseMap,
  type ParseMap,
} from '../../vendor/apps/html/src/renderer/document/parse-map.js'
import { instrumentForPreview } from '../../vendor/apps/html/src/renderer/preview/instrument.js'
// `?raw` 由打包器提供：注入脚本要**原样**塞进预览（它是字符串，不是模块）
import inspectorSource from '../../vendor/apps/html/src/renderer/preview/inspector.js?raw'
import '../shell/shell.css'
import './editors.css'

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

/**
 * 缩放吸附：夹到 `[50, 200]` 并取到 10 的倍数。
 *
 * `ToolbarNumberField` 没有 `step`（它的契约是「夹到 `[min,max]`、空值与非
 * 数字都不提交」），所以步长在这里做。上游那一档也是 10 一档。
 */
function normalizeZoom(value: number): number {
  return Math.min(200, Math.max(50, Math.round(value / 10) * 10))
}

export function HtmlEditor({ documentId, io, onDirtyChange, flush = false }: EditorProps) {
  const source = useSource(io, documentId)
  const [dirty, setDirty] = useState(false)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  /** 预览里选中的元素（源码侧高亮、元素路径都由它驱动） */
  const [selected, setSelected] = useState<SelectedElement | null>(null)
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
  const [previewReady, setPreviewReady] = useState(false)
  /** 预览页面的标题（来自 `gx:ready`），用来在状态行确认渲染的是哪一份 */
  const [previewTitle, setPreviewTitle] = useState<string | null>(null)
  const editorRef = useRef<SourceEditorHandle>(null)
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
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
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

  /** 首次载入（还没编辑过）时的文档——纯派生，不碰 ref */
  const initial = useMemo<EditedDoc | null>(() => {
    if (decoded.value === null) return null
    return { text: decoded.value.text, map: buildParseMap(decoded.value.text, 1, null), version: 1 }
  }, [decoded.value])

  const doc = edited ?? initial

  /**
   * 预览用的 HTML。
   *
   * `instrumentForPreview` 给每个元素加上 `data-sid` 并把检视脚本注入
   * `<body>` 之前——**保存的文本永远不含这两样**（那个函数只作用于预览副本）。
   */
  const previewHtml = useMemo(() => {
    if (doc === null) return null
    return instrumentForPreview(doc.text, doc.map, inspectorSource)
  }, [doc])

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

  /**
   * 预览 frame 发回来的消息（点选）。
   *
   * 只处理 `gx:selected`：它给出用户在预览里点的是源码里的哪一段。样式相关
   * 的几条（`computed` / `hover`）本版不用——没有可改样式的界面。
   */
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const data = event.data as {
        type?: string
        title?: string
        element?: { sid?: number; tag?: string; className?: string } | null
      } | null
      if (!data || typeof data.type !== 'string') return

      if (data.type === 'gx:ready') {
        setPreviewReady(true)
        setPreviewTitle(data.title ?? null)
        return
      }
      if (data.type === 'gx:select') {
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
            ? { sid: element.sid, tag: element.tag ?? '', className: element.className ?? '' }
            : null,
        )
      }
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [])

  /**
   * 撤销栈的可用性，从编辑器句柄读一次。
   *
   * **只能在编辑器回调与事件里读 ref**（渲染期读会被 React Compiler 判违规）。
   * 值没变就返回原对象——`setState` 因此 bail out，不会每敲一个字多一轮渲染。
   */
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

  /** 打开/关掉查找栏 */
  const toggleFind = () => {
    if (findOpen) {
      setFindOpen(false)
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
    const bytes = new TextEncoder().encode(serializeEnvelope(doc.text, decoded.value.envelope))
    const ok = await source.save(bytes, { name: 'page.html', mime: OFFICE_MIME.html })
    if (!ok) return
    setDirty(false)
    onDirtyChange?.(false)
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
        <>
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

          <ToolbarDivider />

          {/*
            视图是**互斥**的三种排法，所以走 `ToolbarToggleGroup`：一个 value
            进、一个 value 出。排成一排 `ToolbarButton` 的话「当前是哪一个」
            会退化成三处各自读一次状态，写错一处就是两个同时亮。

            它与下面那组设备之间要有一条分隔线：两组都是**三个图标**，中间
            不画线的话连起来读像「一个六档的互斥组」（实测截图确认过），而
            它们是两件事——一个决定看哪半边，一个决定预览多宽。
          */}
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
          <ToolbarDivider />
          <ToolbarToggleGroup
            label="预览设备"
            value={device}
            onChange={(next) => {
              setDevice(next)
              revealPreview()
            }}
            options={[
              { value: 'desktop', label: '桌面宽度（铺满预览栏）', icon: <DeviceDesktopIcon /> },
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

          <ToolbarDivider />

          <ToolbarButton label="查找和替换" active={findOpen} onClick={toggleFind}>
            <FindIcon />
          </ToolbarButton>
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

          <ToolbarSpacer />

          <ToolbarButton
            label={source.saving ? '保存中…' : '保存到库'}
            primary
            disabled={!dirty || source.saving}
            /*
             * 禁用必须给原因（DESIGN §8.4）。`disabled` 的判据是两件事
             * （没改动 / 正在保存），而它们**各有各的说法**：不区分的话
             * 「保存」灰着时用户只能猜是没改还是正在写。不给这一条时
             * `ToolbarButton` 把 `title` 留在按钮名上（实测
             * `title === aria-label === "保存到库"`），等于什么都没说。
             */
            disabledReason={source.saving ? '正在保存…' : '没有未保存的改动'}
            onClick={() => void save()}
          >
            <SaveIcon />
          </ToolbarButton>
        </>
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
        findOpen || trail.length > 0 ? (
          <>
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
                onClose={() => setFindOpen(false)}
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
                ? `预览已就绪${previewTitle ? `（${previewTitle}）` : ''}· 点一个元素可以定位到它的源码`
                : `已选中 <${elementLabel(activeSelected.tag, activeSelected.className)}>`}
          </ToolbarLabel>
        </>
      }
    >
      {/*
        左右分栏：源码在左、预览在右。**预览是本格式存在的理由**——HTML 的
        源码与它渲染出来的样子差了十万八千里，只看源码等于用记事本打开网页。
        窄屏（<1100px）下改为上下叠放，见 editors.css。

        两栏都用 `hidden` 控制显隐（**不卸载**）：源码编辑器卸载就会丢掉
        CodeMirror 的实例与编辑历史，重新挂载读的是刚打开文件时的文本——
        那是静默丢内容，理由写在 `view` 的说明里。
      */}
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
              setEdited((prev) => {
                const base = prev ?? initial
                const version = (base?.version ?? 0) + 1
                return { text: next, map: buildParseMap(next, version, base?.map ?? null), version }
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
          <div className="mimir-html-preview-host" data-device={device} style={previewHostStyle}>
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
    </EditorShell>
  )
}

/** 文档状态：文本、它的结构映射、以及映射的版本号 */
interface EditedDoc {
  text: string
  map: ParseMap
  version: number
}
