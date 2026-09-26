/**
 * pptx 的幻灯片编辑器（渲染 + 改文字）。
 *
 * ## 只有这一个组件（原 `PptxPreview` 已被它取代）
 *
 * 只读预览与编辑渲染的是**同一份模型**（`pptx-render.ts` 的 `renderSlide`）。
 * 分开两个组件的话，只读那个不加载 archive（保存要用），界面会变成
 * 「预览看一遍、想改一个字要切到另一个模式」——而 pptx 的原件层本来
 * 就是给人看和改的地方。
 *
 * ## 渲染是 SVG，不是 canvas
 *
 * 上游的 `render-tree.ts` 顶部写着「Konva is just a thin adapter」——保真逻辑
 * （坐标、换行、继承）全在纯数据层，换适配器是它的设计允许的。
 * **为什么换**：canvas 里的文字选不中、搜不到、读屏读不到，而对着幻灯片
 * 复制一句话是很自然的动作。SVG 的 `<text>` 三者都有。
 *
 * ## 编辑的粒度是**段落**
 *
 * 实测（真实 pptx）：一个段落里通常只有**一个 run**，文本是整段。所以
 * 「编辑一个文本框」在界面层就是「每段一个输入框」，模型层由 vendored 的
 * `applyEditParagraphs` 做映射（未被编辑的字号/字体/颜色/项目符号从原 run
 * 继承）。
 *
 * **本版不做 run 级格式**（加粗/字号/颜色）。上游那条路要走 `pptx-ops` 的
 * ops 层 + `setElementFont` / `applyParagraphFormat`，而它们在 `index.ts`
 * 里、依赖整条写路径。这里先把「改文字」做对——它是最常用的编辑，而且
 * 它已经是**补丁式**的（改一行字不会重排整篇 XML，见 `pptx-save.ts`）。
 *
 * ## 编辑面板在**下面**，不在右边
 *
 * 改之前它在右侧固定 300px。两个问题：横向空间是幻灯片最需要的（16:9 的
 * 版面越宽越好看得清），而右侧面板把它压窄；而且「选中元素 → 改它的字」
 * 是一个自上而下的动作，面板在右下角反而离眼睛更远。挪到底部之后与
 * Office 的「备注/格式」区一致，也给画布留出了完整宽度。
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { editableElements, openPptxForEdit, textOfElement } from '../pptx.js'
import { renderSlide, type PptxRenderable, type RenderedSlide } from '../pptx-render.js'
import {
  EditorShell,
  EditorState,
  ToolbarButton,
  ToolbarLabel,
  ToolbarSpacer,
  ToolbarTabs,
} from '../shell/EditorShell.js'
import { ChevronLeftIcon, ChevronRightIcon, SaveIcon } from '../shell/icons.js'
import { statusText, useParsed, useSource } from './use-source.js'
import { OFFICE_MIME, type EditorProps } from './types.js'
import '../shell/shell.css'
import './editors.css'

/**
 * 画布宽度（px）。渲染器按这个宽度算缩放，所以它决定文字大小与换行位置。
 * 960 是「宽屏下不缩得太小、窄屏下还能看」的折中。
 */
const FIT_WIDTH_PX = 960

export function PptxEditor({ documentId, io, onDirtyChange, flush = false }: EditorProps) {
  const source = useSource(io, documentId)
  const parsed = useParsed(source.bytes, openPptxForEdit)
  const session = parsed.value
  const [active, setActive] = useState(0)
  /** 选中的元素 id（选中后才能编辑它的文字） */
  const [selected, setSelected] = useState<string | null>(null)
  /** 有改动还没保存（保存后清掉） */
  const [dirty, setDirty] = useState(false)
  /** 画布容器：SVG 里注入 `data-element-id` 后用它做事件代理 */
  const canvasRef = useRef<HTMLDivElement>(null)

  /**
   * 渲染用的**不可变快照**（见 `PptxEditSession.view()` 的说明）。
   *
   * 编辑是就地改模型的，所以不能拿 `slides()` 当依赖（引用不变，重算不触发）。
   * 快照的身份随改动变化：**没改动时 `view()` 返回同一个对象**，改动后是新
   * 对象——于是 `useMemo` 的依赖是诚实的，不需要外面数版本号。
   *
   * `edited` 只是给「改过之后的快照」一个落脚处，同样绑着「哪一份字节」，
   * 所以换文件时它自然作废。没改过时直接用 `session.view()`（同一个对象，
   * 不会让下游重算）。
   */
  const [edited, setEdited] = useState<{ source: Uint8Array; view: PptxRenderable } | null>(null)
  const view = edited?.source === source.bytes ? edited.view : (session?.view() ?? null)

  /**
   * 段落输入框的稳定 key。
   *
   * **不用下标**（React 规则禁止，而且段落增删后会复用错位的输入框状态），
   * **也不用内容**（每敲一个字 key 就变 → React 卸载重建 textarea → 光标跳走）。
   * 所以给每段造一个**在编辑期间稳定**的 id：选中元素时按当时的段数生成。
   */
  const [paragraphKeys, setParagraphKeys] = useState<string[]>([])

  /** 当前页的可编辑元素 */
  const editable = useMemo(() => {
    const slide = view?.slides()[active]
    return slide ? editableElements(slide) : []
  }, [view, active])

  const rendered = useMemo<RenderedSlide | null>(() => {
    if (!view) return null
    return renderSlide(view, active, { fitWidthPx: FIT_WIDTH_PX })
  }, [view, active])

  const slideCount = view?.slides().length ?? 0

  /** 选中的元素现在有哪些段落（每段把它的 run 拼起来——界面按段落编辑） */
  const paragraphs = useMemo(() => {
    const el = editable.find((e) => e.id === selected)
    if (!el) return null
    const text = textOfElement(el)
    return text?.paragraphs.map((p) => p.runs.map((r) => r.text).join('')) ?? null
  }, [editable, selected])

  /**
   * 画布上的点击 → 选中元素。
   *
   * 用**事件代理**而不是给每个元素绑：SVG 是 `dangerouslySetInnerHTML` 注入的
   * 字符串，每次编辑后整体换掉，逐个绑会全部失效。代理挂在容器上，由
   * `closest('[data-element-id]')` 找最近的元素——渲染器给每个节点写了这个属性。
   */
  const onClickCanvas = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as Element | null
      const hit = target?.closest('[data-element-id]')
      const id = hit?.getAttribute('data-element-id') ?? null
      setSelected(id)
      /**
       * 段落的稳定 key 在这里生成（而不是在 effect 里跟着段落数变）：点选是
       * 一个**动作**，动作里改 state 是正常的数据流；用 effect 同步派生 state
       * 反而会多一次渲染，并且要处理「该不该重置」的边界。
       */
      const slide = view?.slides()[active]
      const el = slide ? editableElements(slide).find((e) => e.id === id) : undefined
      const count = el ? (textOfElement(el)?.paragraphs.length ?? 0) : 0
      setParagraphKeys(Array.from({ length: count }, () => crypto.randomUUID()))
    },
    [view, active],
  )

  /**
   * 改一段文字。
   *
   * `srcPara` 把这段指回**原始段落**——`applyEditParagraphs` 靠它继承那一段
   * 未被编辑的属性（项目符号、行距、run 的字号与字体）。不给的话按位置匹配，
   * 段落增删时就会串味。
   */
  const setParagraph = (index: number, value: string) => {
    if (!session || !selected || !paragraphs) return
    const next = paragraphs.map((text, i) => ({
      runs: [{ text: i === index ? value : text }],
      srcPara: i,
    }))
    if (!session.setText(active, selected, next)) return
    setEdited({ source: source.bytes!, view: session.view() })
    if (!dirty) {
      setDirty(true)
      onDirtyChange?.(true)
    }
  }

  const save = async () => {
    if (!session) return
    const bytes = await session.save()
    const ok = await source.save(bytes, { name: 'slides.pptx', mime: OFFICE_MIME.pptx })
    if (!ok) return
    /**
     * **保存成功后必须 commit**：把新 XML 烧回元素锚点。不做的话第二次编辑
     * 会拿旧锚点拼字节，第一次的改动被静默回滚（保存本身还是成功）。
     */
    session.commit()
    // commit 之后模型与刚写出的字节对齐了，取一份新快照（同时丢掉 edited）
    setEdited({ source: source.bytes!, view: session.view() })
    setDirty(false)
    onDirtyChange?.(false)
  }

  const goTo = (index: number) => {
    setActive(index)
    // 换页要清掉选中：那个元素不在这一页了
    setSelected(null)
    setParagraphKeys([])
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

  if (parsed.error !== null) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>解析失败</ToolbarLabel>}>
        <EditorState tone="error">解析失败：{parsed.error}</EditorState>
      </EditorShell>
    )
  }

  if (!session || !rendered) {
    return (
      <EditorShell flush={flush} status={<ToolbarLabel>读取中…</ToolbarLabel>}>
        <EditorState>正在解析幻灯片…</EditorState>
      </EditorShell>
    )
  }

  const status = statusText({
    handle: source,
    dirty,
    idle: `第 ${active + 1} / ${slideCount} 页`,
  })

  return (
    <EditorShell
      flush={flush}
      toolbar={
        <>
          <ToolbarButton label="上一页" disabled={active === 0} onClick={() => goTo(active - 1)}>
            <ChevronLeftIcon />
          </ToolbarButton>
          <ToolbarButton
            label="下一页"
            disabled={active >= slideCount - 1}
            onClick={() => goTo(active + 1)}
          >
            <ChevronRightIcon />
          </ToolbarButton>
          {slideCount > 1 && (
            <ToolbarTabs
              label="幻灯片"
              value={active}
              onChange={goTo}
              items={Array.from({ length: slideCount }, (_, i) => ({
                value: i,
                label: `${i + 1}`,
              }))}
            />
          )}
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
        selected && paragraphs ? (
          <div className="mimir-paras">
            <div className="mimir-paras__head">
              <ToolbarLabel>编辑这一段文字（每行一段）</ToolbarLabel>
              <ToolbarSpacer />
              <ToolbarLabel>字号、字体、颜色与项目符号沿用原来的；改颜色请下载原件</ToolbarLabel>
            </div>
            <div className="mimir-paras__list">
              {paragraphs.map((text, index) => (
                <textarea
                  key={paragraphKeys[index] ?? `pending-${index}`}
                  className="mimir-paras__item"
                  rows={1}
                  value={text}
                  aria-label={`第 ${index + 1} 段`}
                  placeholder={`第 ${index + 1} 段`}
                  onChange={(event) => setParagraph(index, event.target.value)}
                />
              ))}
            </div>
          </div>
        ) : (
          <ToolbarLabel>
            点画布上的文字框或形状来改它的字
            {editable.length === 0 && '——这一页没有可编辑的文字'}
          </ToolbarLabel>
        )
      }
      status={
        <>
          <ToolbarLabel>{status}</ToolbarLabel>
          <ToolbarLabel>
            字体用系统里装的，版面可能与原件略有差别；动画、SmartArt 与 OLE 不显示
          </ToolbarLabel>
        </>
      }
    >
      <div className="me-scroll mimir-pptx-stage">
        <div
          ref={canvasRef}
          className="mimir-pptx-slide"
          onClick={onClickCanvas}
          /*
            注入渲染好的 SVG。**为什么用 dangerouslySetInnerHTML 而不是 React
            元素**：渲染器是纯函数（绘制列表 → 字符串），产物要能脱离 React
            单独用（存成 .svg、在测试里比对字符串、将来做导出）。重写成 React
            组件会让那几处各写一份。字符串来自我们自己的渲染器、内容是转义过的
            XML（`pptx-svg.ts` 有转义与可解析性测试），不是用户可控的 HTML。
            **点选靠 data-element-id 属性**——渲染器给每个元素节点写了它。
          */
          dangerouslySetInnerHTML={{ __html: rendered.svg }}
        />
      </div>
    </EditorShell>
  )
}
