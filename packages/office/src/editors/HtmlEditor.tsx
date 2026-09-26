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
 * ## 点选是「只读的检视」，不是完整的样式编辑
 *
 * 上游的 StylePanel 能改颜色/字号/边距（它调 `ops.ts` 生成补丁）。本版只做
 * **点选 → 高亮 → 显示这是哪个元素**：样式编辑要接 `document/ops.ts`（514 行
 * 的操作编译器）与整个面板，那是下一步。所以状态行如实写着「点元素可以定位
 * 到源码」，而不是画一个看着能改却改不了的面板。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorShell, ToolbarButton, ToolbarLabel, ToolbarSpacer } from '../shell/EditorShell.js'
import { SaveIcon } from '../shell/icons.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import {
  SourceEditor,
  type SourceEditorHandle,
} from '../../vendor/apps/html/src/renderer/source/SourceEditor.js'
import {
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

export function HtmlEditor({ documentId, io, onDirtyChange, flush = false }: EditorProps) {
  const source = useSource(io, documentId)
  const [dirty, setDirty] = useState(false)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  /** 预览里选中的元素（源码侧高亮由它驱动） */
  const [selectedSid, setSelectedSid] = useState<number | null>(null)
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
        element?: { sid?: number } | null
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
        setSelectedSid(typeof data.element?.sid === 'number' ? data.element.sid : null)
      }
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [])

  /** 把选中的元素在源码里选中（这样「预览点到哪、源码跳到哪」） */
  const revealInSource = useCallback(() => {
    if (selectedSid === null || doc === null) return
    /** `bySid` 是映射自带的索引——不必线性找一个元素 */
    const entry = doc.map.bySid.get(selectedSid)
    if (!entry) return
    // `endTag` 是可选元组：没有闭合标签的元素（如 <img>）只选它的开始标签
    const end = entry.endTag ? entry.endTag[1] : entry.startTag[1]
    editorRef.current?.revealRange(entry.startTag[0], end, true)
  }, [selectedSid, doc])

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

  return (
    <EditorShell
      flush={flush}
      toolbar={
        <>
          <ToolbarLabel>源码</ToolbarLabel>
          <ToolbarSpacer />
          <ToolbarButton
            label="定位到源码里选中的元素"
            disabled={selectedSid === null || !previewReady}
            onClick={revealInSource}
          >
            定位选中元素
          </ToolbarButton>
          <ToolbarButton
            label={source.saving ? '保存中…' : '保存到库'}
            primary
            disabled={!dirty || source.saving}
            onClick={() => void save()}
          >
            <SaveIcon />
          </ToolbarButton>
        </>
      }
      status={
        <>
          <ToolbarLabel>{status}</ToolbarLabel>
          <ToolbarLabel>
            {!previewReady
              ? '预览加载中…'
              : selectedSid === null
                ? `预览已就绪${previewTitle ? `（${previewTitle}）` : ''}· 点一个元素可以定位到它的源码`
                : `已选中第 ${selectedSid} 个元素`}
          </ToolbarLabel>
        </>
      }
    >
      {/*
        左右分栏：源码在左、预览在右。**预览是本格式存在的理由**——HTML 的
        源码与它渲染出来的样子差了十万八千里，只看源码等于用记事本打开网页。
        窄屏（<1100px）下改为上下叠放，见 editors.css。
      */}
      <div className="mimir-html-split">
        <div className="mimir-html-source">
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
            }}
            onCursor={(info) => setCursor(info)}
          />
        </div>
        <iframe
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
    </EditorShell>
  )
}

/** 文档状态：文本、它的结构映射、以及映射的版本号 */
interface EditedDoc {
  text: string
  map: ParseMap
  version: number
}
