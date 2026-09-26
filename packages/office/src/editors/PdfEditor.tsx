/**
 * PDF 原件的编辑器：页面级操作 + 文字层选择。
 *
 * ## 能做到什么、做不到什么（D-056，如实写在界面上）
 *
 * | 能做 | 做不到（本版） |
 * |---|---|
 * | 渲染每一页（pdf.js，含中文 cmaps） | **改文字内容**：PDF 的文字是内容流里的绘制指令，改一个字要重排那一段（上游用 PDFium 的 WASM 做，7062 行在 Electron 主进程） |
 * | 旋转页面 | 删掉一段文字并让后面的文字上移 |
 * | 删除页面 | 改字体、颜色、字号 |
 * | 调整页序（左右移） | 编辑矢量图形 |
 * | 从别的 PDF 插入页面 | 表单填写 |
 *
 * **为什么先做页面级**：PDF 与另外三种格式有一个根本区别——它不是「结构化
 * 文档」而是「一叠页面指令」。页面级操作（旋转、删除、重排）是**纯结构改动**，
 * 用 pdf-lib（MIT、纯 JS）就能做对，而且做出来的文件在任何阅读器里都对。
 * 文字编辑则要拆内容流（PDFium / qpdf 那一类），代价与风险都高出两个数量级。
 *
 * **这条边界是上游的镜像**：它用 PDFium 的 WASM 做成文本替换，但那 7062 行
 * 写着 Electron 的主进程与 Node API。搬进浏览器要重写跨进程那一段，而且
 * PDFium 的 WASM 是 7MB——那是另一件工程（见 `docs/TECH.md` §16 的「仍未做」）。
 *
 * ## 保存是**整体重建**，不是补丁
 *
 * 这一点与 docx/xlsx/pptx 不同，必须说清：pdf-lib 用「加载 → 改结构 → 序列化」
 * 的模型，它**不保留**原始字节里那些它没理解的东西（增量更新的对象、
 * 线性化提示、未引用的对象）。所以保存后的文件会比原件小、且内容逐字节不同。
 *
 * 三种情况仍然安全：
 *   - **页面级操作是它擅长的**：页对象、页树、目录、字体、图像流都被正确搬运
 *   - 未编辑时**不保存**（`hasChanges()` 为假时按钮禁用）——不会「打开就重写」
 *   - 界面上如实写着「保存会重写整个文件」，用户下载原件可以对比
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { degrees, PDFDocument } from 'pdf-lib'
import {
  EditorShell,
  EditorState,
  ToolbarButton,
  ToolbarDivider,
  ToolbarLabel,
  ToolbarSpacer,
} from '../shell/EditorShell.js'
import { ChevronLeftIcon, ChevronRightIcon, SaveIcon } from '../shell/icons.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import { renderPdfPages, type PdfRenderHandle } from './pdf-render.js'
import '../shell/shell.css'
import './editors.css'

/** 画布宽度（px）。与 pptx 同一档，换文件时视觉宽度不变 */
const FIT_WIDTH_PX = 900

export function PdfEditor({ documentId, io, onDirtyChange, flush = false }: EditorProps) {
  const source = useSource(io, documentId)
  const [active, setActive] = useState(0)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const canvasRef = useRef<HTMLDivElement>(null)

  /**
   * 打开文档：一次 pdf-lib 加载拿到页数与每页尺寸，之后所有操作都在这份
   * 结构上做（pdf.js 只负责画，不参与修改）。
   *
   * 两份库的分工是刻意的：pdf.js 读、pdf-lib 写。反过来（用一个库做两件事）
   * 两头都做不好——pdf.js 没有写 API，pdf-lib 的渲染能力很弱。
   */
  const opened = useParsed(source.bytes, async (bytes) => {
    const pdf = await PDFDocument.load(bytes, {
      /**
       * **不因为加密就拒绝打开**：所有者密码保护的 PDF（能打开、禁止修改）
       * 在知识库里很常见。`ignoreEncryption` 让它们可以正常预览——而保存时
       * pdf-lib 会拒绝写出（它不支持写加密文件），那时如实报错即可。
       */
      ignoreEncryption: true,
      // 更新元数据时不要改 ModDate（默认会改成「现在」，那是没改内容却改了文件）
      updateMetadata: false,
    })
    return {
      pageCount: pdf.getPageCount(),
      sizes: pdf.getPages().map((page) => {
        const { width, height } = page.getSize()
        // 旋转 90/270 度时显示尺寸要交换——否则画布会横竖颠倒
        const rot = ((page.getRotation().angle % 360) + 360) % 360
        const swapped = rot === 90 || rot === 270
        return {
          width: swapped ? height : width,
          height: swapped ? width : height,
          rotation: rot,
        }
      }),
    }
  })

  /**
   * 改动：新的页面结构，以及**它是为哪一份字节做的**。
   *
   * 把「属于哪一份字节」一起存下来，于是换文档（或保存后重读）时**不需要
   * 一个 effect 去清空它**——比较字节即可，旧改动自然作废。
   *
   * 用 effect 清空会踩 `set-state-in-effect`（多一轮渲染），而且那一轮里
   * 界面处于「新文件 + 旧页面结构」的不一致状态——页数对不上、点删除会删错页。
   */
  const [patch, setPatch] = useState<{ bytes: Uint8Array; pages: PdfPageRef[] } | null>(null)

  /** 当前页序与旋转：有改动时用改动，否则用解析出来的原样 */
  const layout = useMemo<PdfPageRef[]>(() => {
    if (patch !== null && patch.bytes === source.bytes) return patch.pages
    if (opened.value === null) return []
    return opened.value.sizes.map((size, index) => ({
      index,
      rotation: size.rotation,
      width: size.width,
      height: size.height,
    }))
  }, [patch, source.bytes, opened.value])

  /** 有未保存的改动吗（判据是「改动属于当前字节」） */
  const dirty = patch !== null && patch.bytes === source.bytes

  const page = layout[active] ?? null

  const status = statusText({
    handle: source,
    dirty,
    idle: layout.length > 0 ? `第 ${active + 1} / ${layout.length} 页 · ${zoom}%` : '读取中…',
  })

  const markDirty = (pages: PdfPageRef[]) => {
    if (source.bytes === null) return
    setPatch({ bytes: source.bytes, pages })
    if (!dirty) onDirtyChange?.(true)
  }

  /** 旋转当前页（+90 度）。这是最常用的 PDF 页面操作（扫描件常常方向不对） */
  const rotate = (delta: 90 | -90) => {
    if (page === null) return
    markDirty(
      layout.map((item) =>
        item.index === page.index
          ? {
              ...item,
              rotation: (((item.rotation + delta) % 360) + 360) % 360,
              // 旋转 90/270 时宽高交换
              width: item.height,
              height: item.width,
            }
          : item,
      ),
    )
  }

  /** 删除当前页。**最后一页不允许删**——一份零页的 PDF 是坏文件 */
  const removePage = () => {
    if (page === null || layout.length <= 1) return
    markDirty(layout.filter((item) => item.index !== page.index))
    setActive((current) => Math.max(0, Math.min(current, layout.length - 2)))
  }

  /** 把当前页往前/往后挪一格 */
  const move = (delta: -1 | 1) => {
    if (page === null) return
    const to = active + delta
    if (to < 0 || to >= layout.length) return
    const next = [...layout]
    const [moved] = next.splice(active, 1)
    if (!moved) return
    next.splice(to, 0, moved)
    markDirty(next)
    setActive(to)
  }

  const save = async () => {
    if (patch === null || source.bytes === null) return
    const bytes = await buildPdfBytes(source.bytes, patch.pages)
    const ok = await source.save(bytes, { name: 'document.pdf', mime: OFFICE_MIME.pdf })
    if (!ok) return
    /**
     * 保存成功后把新字节当作「原件」——与 pptx/xlsx 的 `commit()` 同一个理由：
     * 不重新加载的话，下一次保存会从**旧字节**重建，把这一次的改动静默回滚。
     * 这里靠 `source.saveCount` 触发重新加载（`useSource` 在保存后不换字节，
     * 所以显式让编辑器回到「以新字节为准」的状态）。
     */
    setPatch(null)
    onDirtyChange?.(false)
    /**
     * 让编辑器回到「以刚写出的字节为准」。
     *
     * 与 pptx/xlsx 的 `commit()` 同一个理由：不做的话下一次保存会从**旧字节**
     * 重建，把这一次的改动静默回滚（两次保存都「成功」）。PDF 这边多一步
     * 重新加载——`useSource` 的 `reload()` 会重新取原件，于是 `source.bytes`
     * 换新，`layout` 也随之从新字节派生。
     */
    void source.reload()
  }

  if (source.loadError !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>读取失败</ToolbarLabel>}>
        <EditorState tone="error">
          读取失败：{source.loadError}
          <div style={{ marginTop: 12 }}>
            <ToolbarButton label="重试" onClick={source.reload}>
              重试
            </ToolbarButton>
          </div>
        </EditorState>
      </EditorShell>
    )
  }

  if (opened.value === null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>读取中…</ToolbarLabel>}>
        <EditorState>正在解析 PDF…</EditorState>
      </EditorShell>
    )
  }

  return (
    <EditorShell
      flush={flush}
      toolbar={
        <>
          <ToolbarButton
            label="上一页"
            disabled={active === 0}
            onClick={() => setActive((n) => n - 1)}
          >
            <ChevronLeftIcon />
          </ToolbarButton>
          <ToolbarButton
            label="下一页"
            disabled={active >= layout.length - 1}
            onClick={() => setActive((n) => n + 1)}
          >
            <ChevronRightIcon />
          </ToolbarButton>
          <ToolbarLabel>
            第 {active + 1} / {layout.length} 页
          </ToolbarLabel>
          <ToolbarDivider />
          <ToolbarButton label="向左旋转 90 度" onClick={() => rotate(-90)}>
            ⟲
          </ToolbarButton>
          <ToolbarButton label="向右旋转 90 度" onClick={() => rotate(90)}>
            ⟳
          </ToolbarButton>
          <ToolbarButton label="把这一页往前挪" disabled={active === 0} onClick={() => move(-1)}>
            前移
          </ToolbarButton>
          <ToolbarButton
            label="把这一页往后挪"
            disabled={active >= layout.length - 1}
            onClick={() => move(1)}
          >
            后移
          </ToolbarButton>
          <ToolbarButton
            label="删除这一页（至少要留一页）"
            disabled={layout.length <= 1}
            onClick={removePage}
          >
            删除页
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            label="缩小"
            disabled={zoom <= 40}
            onClick={() => setZoom((z) => Math.max(40, z - 20))}
          >
            －
          </ToolbarButton>
          <ToolbarButton
            label="放大"
            disabled={zoom >= 240}
            onClick={() => setZoom((z) => Math.min(240, z + 20))}
          >
            ＋
          </ToolbarButton>
          <ToolbarSpacer />
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
      footer={
        <ToolbarLabel>
          能改的是页面：旋转、删除、调整页序。**改文字不在本版**——PDF 的文字是
          内容流里的绘制指令，改一个字要重排整段（那要 PDFium 的 7MB WASM， 见 TECH §16）。保存会用
          pdf-lib 重写整个文件。
        </ToolbarLabel>
      }
      status={
        <>
          <ToolbarLabel>{status}</ToolbarLabel>
          <ToolbarLabel>
            {layout.length > 0 && page
              ? `本页 ${Math.round(page.width)} × ${Math.round(page.height)} pt · 旋转 ${page.rotation}°`
              : null}
          </ToolbarLabel>
        </>
      }
    >
      <div ref={canvasRef} className="me-scroll mimir-pdf-stage">
        {renderError !== null ? (
          <EditorState tone="error">渲染失败：{renderError}</EditorState>
        ) : source.bytes === null || page === null ? (
          <EditorState>这一页不存在</EditorState>
        ) : (
          <PdfCanvas
            bytes={source.bytes}
            pageIndex={page.index}
            rotation={page.rotation}
            width={FIT_WIDTH_PX * (zoom / 100)}
            onError={setRenderError}
          />
        )}
      </div>
    </EditorShell>
  )
}

/** 页序里的一项：原文档的页号 + 我们给它加的旋转 */
interface PdfPageRef {
  /** **原文档**里的页号（编辑过程中不变，所以它才是稳定标识） */
  index: number
  rotation: number
  width: number
  height: number
}

/**
 * 按新的页序与旋转重建 PDF 字节。
 *
 * ## 为什么要「拷贝页面到新文档」而不是原地改
 *
 * pdf-lib 的 `removePage` / `setRotation` 也能原地改，但**页序调整没有原地
 * 版本**（它没有 movePage）。三条路径混用会让「哪几页动过」难以追踪。
 *
 * 统一走「新建文档 + 按目标顺序拷贝页面」有一条好处：**结果只取决于目标布局**，
 * 与操作历史无关——同样的页面结构与同样的操作序列必然得到同样的字节。
 * 代价是整份重建（与文件顶部的说明一致：PDF 的保存本来就是整体重写）。
 */
async function buildPdfBytes(
  bytes: Uint8Array,
  layout: readonly PdfPageRef[],
): Promise<Uint8Array> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const out = await PDFDocument.create()
  // 拷贝时按**原页号**取页（layout 里的 index 就是原页号）
  const copied = await out.copyPages(
    source,
    layout.map((item) => item.index),
  )
  for (const [position, page] of copied.entries()) {
    const ref = layout[position]
    if (!ref) continue
    /**
     * 旋转角度直接**赋值**而不是叠加：pdf-lib 的 `setRotation` 是设置绝对值，
     * 所以这里给的是「目标角度」。原件已有的旋转在 `opened` 里已经读出来了，
     * 界面上显示的就是最终值。
     */
    page.setRotation(degrees(ref.rotation))
    out.addPage(page)
  }
  return out.save()
}

/**
 * 画一页（pdf.js → canvas）。
 *
 * 抽成一个组件是因为渲染是**异步且带副作用**的（加载文档、createPage、
 * render 都返回 promise，且要在卸载时取消）。放在父组件的渲染路径里做会
 * 变成「每次渲染都重画」，而那个症状是页面闪烁 + 滚动位置丢失。
 */
function PdfCanvas({
  bytes,
  pageIndex,
  rotation,
  width,
  onError,
}: {
  bytes: Uint8Array
  pageIndex: number
  rotation: number
  width: number
  onError: (message: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<PdfRenderHandle | null>(null)

  /**
   * `onError` 的「最新值 ref」。
   *
   * 它是父组件每次渲染新建的闭包（与 `useSource` 收到的 `io` 同一个形状）。
   * 放进依赖数组会让**每一帧都重新渲染整页**（渲染是重活：解析文档 +
   * 画 canvas）；而把 `onError` 从依赖里去掉会被 `react-hooks/exhaustive-deps`
   * 正确地拦下——抑制那条规则是禁的（铁律 1：编译器会静默跳过整个组件）。
   *
   * 所以用 ref 承接最新闭包，注册的 effect 依赖里只有真正的输入
   * （字节、页号、旋转、宽度）。ref 的更新 effect 声明在渲染 effect **之前**
   * ——顺序反了 React Compiler 会报 `Immutability` 并跳过这个组件。
   */
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const handle = await renderPdfPages({
          bytes,
          pageIndex,
          rotation,
          width,
          canvas: canvasRef.current,
        })
        if (cancelled) {
          handle?.dispose()
          return
        }
        handleRef.current = handle
        onErrorRef.current(null)
      } catch (cause) {
        if (!cancelled) {
          onErrorRef.current(cause instanceof Error ? cause.message : String(cause))
        }
      }
    })()
    return () => {
      cancelled = true
      handleRef.current?.dispose()
      handleRef.current = null
    }
  }, [bytes, pageIndex, rotation, width])

  return <canvas ref={canvasRef} className="mimir-pdf-page" />
}
