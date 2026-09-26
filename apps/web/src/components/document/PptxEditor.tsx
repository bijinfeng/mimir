import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Empty, Input, Segmented, Skeleton, Space, Tag, Typography } from 'antd'
import { createStyles } from 'antd-style'
import {
  editableElements,
  openPptxForEdit,
  renderSlide,
  textOfElement,
  type PptxEditSession,
  type RenderedSlide,
} from '@mimir/office'
import { api } from '@/lib/api'

/**
 * pptx 的**只读预览 + 文字编辑**。
 *
 * ## 为什么只有这一个组件（原 `PptxPreview` 已被它取代）
 *
 * 只读预览与编辑渲染的是**同一份模型**（`pptx-render.ts` 的 `renderSlide`）。
 * 分开两个组件的话，只读那个不加载 `archive`（保存要用），界面就会变成
 * 「预览看一遍、想改一个字要切到另一个模式」——而 pptx 的原件层本来就
 * 是给人看和改的地方。所以编辑版把预览包含在内：没选中元素时它就是一个
 * 预览，选中后就地编辑。
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
 * ## 保存走已有的替换原件端点
 *
 * 与 docx 编辑器同一条路（`PUT /api/documents/:id/file`）：服务端重算正文
 * 与哈希，所以编辑完立刻可检索。**不需要新端点**。
 */
export function PptxEditor({ documentId }: { documentId: string }) {
  const { styles } = useStyles()
  const { message, modal } = App.useApp()
  const [session, setSession] = useState<PptxEditSession | null>(null)
  const [status, setStatus] = useState('读取原件…')
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [saving, setSaving] = useState(false)
  /** 选中的元素 id（选中后才能编辑它的文字） */
  const [selected, setSelected] = useState<string | null>(null)
  /**
   * 段落输入框的稳定 key。
   *
   * ## 为什么不用下标，也不用内容
   *
   *   - **下标**：React 的规则禁止（`no-array-index-key`），而且这里确实有
   *     代价——段落增删后 React 会复用错位的输入框状态
   *   - **内容**：每敲一个字 key 就变 → React 卸载重建 textarea →
   *     **光标跳走**，用户立刻能感觉到
   *
   * 所以给每段造一个**在编辑期间稳定**的 id：选中元素时（`selectElement`）
   * 按当时的段数生成，之后同一元素内增删段落时按下标复用。
   */
  const [paragraphKeys, setParagraphKeys] = useState<string[]>([])
  /** 画布容器：SVG 里注入 `data-element-id` 后用它做事件代理 */
  const canvasRef = useRef<HTMLDivElement>(null)

  /**
   * 渲染用的**不可变快照**（见 `PptxEditSession.view()` 的说明）。
   *
   * 编辑是就地改模型的，所以不能拿 `slides()` 当依赖（引用不变，重算不触发）。
   * 快照的身份会随改动变化：没改动是同一个对象，改动后是新对象——于是
   * `useMemo` 的依赖是诚实的，不需要外面数版本号。
   */
  const [view, setView] = useState(() => session?.view() ?? null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(api.documents.sourceUrl(documentId), { credentials: 'include' })
        if (!res.ok) throw new Error(`读取原件失败：HTTP ${res.status}`)
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (cancelled) return
        setStatus(`已读取 ${bytes.length} 字节，解析中…`)
        const opened = await openPptxForEdit(bytes)
        if (cancelled) return
        setSession(opened)
        setView(opened.view())
        setStatus(`${opened.slides().length} 页`)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [documentId])

  /**
   * 渲染当前页。
   *
   * `renderSlide` 是纯计算（无 DOM），所以放 `useMemo` 里没问题。
   * 依赖 `modelVersion` 而不是 `session`——理由见上面 `modelVersion` 的说明。
   */
  const rendered = useMemo<RenderedSlide | null>(() => {
    if (!view) return null
    return renderSlide(view, active, { fitWidthPx: FIT_WIDTH_PX })
  }, [view, active])

  /** 全部页的页数（切页控件用；不渲染全部，只要长度） */
  const slideCount = view?.slides().length ?? 0

  /** 当前页可编辑的元素 */
  const editable = useMemo(() => {
    const slide = view?.slides()[active]
    return slide ? editableElements(slide) : []
  }, [view, active])

  /** 选中的元素现在有哪些段落 */
  const paragraphs = useMemo(() => {
    const el = editable.find((e) => e.id === selected)
    if (!el) return null
    return textOfElement(el)?.paragraphs.map((p) => p.runs.map((r) => r.text).join('')) ?? null
  }, [editable, selected])

  /**
   * 画布上的点击 → 选中元素。
   *
   * 用**事件代理**而不是给每个元素绑：SVG 是 `dangerouslySetInnerHTML` 注入的
   * 字符串，每次编辑后整体换掉，逐个绑会全部失效。代理挂在容器上，
   * 由 `closest('[data-element-id]')` 找最近的元素——渲染器给每个节点写了
   * 这个属性（见 `pptx-svg.ts`）。
   */
  const onClickCanvas = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as Element | null
      const hit = target?.closest('[data-element-id]')
      const id = hit?.getAttribute('data-element-id') ?? null
      setSelected(id)
      /**
       * 段落的稳定 key 在这里生成（而不是在 effect 里跟着段落数变）：
       * 点选是一个**动作**，动作里改 state 是正常的数据流；用 effect 同步
       * 派生 state 反而会多一次渲染，并且要处理「该不该重置」的边界。
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
    const next = paragraphs.map((text, i) =>
      i === index ? { runs: [{ text: value }], srcPara: i } : { runs: [{ text }], srcPara: i },
    )
    if (!session.setText(active, selected, next)) {
      message.error('这个元素改不了文字（可能不是文本框或形状）')
      return
    }
    setView(session.view())
  }

  const save = async () => {
    if (!session) return
    setSaving(true)
    try {
      const bytes = await session.save()
      const file = new File([bytes as BlobPart], 'edited.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      })
      await api.documents.replaceSource(documentId, file)
      /**
       * **保存成功后必须 commit**：把新 XML 烧回元素锚点。不做的话第二次
       * 编辑会拿旧锚点拼字节，第一次的改动被静默回滚（保存本身还是成功）。
       */
      session.commit()
      setView(session.view())
      message.success(`已保存（${bytes.length} 字节）`)
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const close = () => {
    if (!session?.hasChanges()) {
      window.history.back()
      return
    }
    modal.confirm({
      title: '有未保存的改动',
      content: '离开会丢掉这些改动。',
      okText: '丢掉并离开',
      cancelText: '留下',
      onOk: () => window.history.back(),
    })
  }

  if (error) {
    return (
      <Empty
        className={styles.state}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<Typography.Text type="danger">{error}</Typography.Text>}
      />
    )
  }
  if (!session || !rendered) {
    return (
      <div className={styles.state}>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    )
  }

  const dirty = session.hasChanges()

  return (
    <div className={styles.wrap}>
      <Space className={styles.bar} size={8} wrap>
        <span className={styles.status}>{status}</span>
        <Button
          size="small"
          type="primary"
          loading={saving}
          disabled={!dirty}
          onClick={() => void save()}
        >
          {dirty ? '保存到库' : '没有改动'}
        </Button>
        <Button size="small" onClick={close}>
          返回库
        </Button>
        {dirty && <Tag color="processing">未保存</Tag>}
      </Space>

      {slideCount > 1 && (
        <Segmented
          className={styles.pager}
          size="small"
          value={active}
          onChange={(value) => {
            setActive(Number(value))
            // 换页要清掉选中：那个元素不在这一页了
            setSelected(null)
          }}
          options={Array.from({ length: slideCount }, (_, i) => ({ label: `${i + 1}`, value: i }))}
        />
      )}

      <div className={styles.body}>
        <div
          ref={canvasRef}
          className={styles.canvas}
          onClick={onClickCanvas}
          /*
            注入渲染好的 SVG。**为什么用 dangerouslySetInnerHTML 而不是 React
            元素**：渲染器是纯函数（绘制列表 → 字符串），产物要能脱离 React
            单独用（存成 .svg、在测试里比对字符串、将来做导出）。重写成 React
            组件会让那几处各写一份。字符串来自我们自己的渲染器、内容是转义过的
            XML（`pptx-svg.ts` 有转义与可解析性测试），不是用户可控的 HTML。
            **点选靠 data-element-id 属性**——渲染器给每个元素节点写了它
            （`pptx-svg.ts`），这里用事件代理取。
          */
          dangerouslySetInnerHTML={{ __html: rendered.svg }}
        />

        <aside className={styles.panel}>
          {selected && paragraphs ? (
            <>
              <div className={styles.panelTitle}>编辑这一段的文字</div>
              {paragraphs.map((text, index) => (
                <Input.TextArea
                  key={paragraphKeys[index] ?? `pending-${index}`}
                  className={styles.para}
                  autoSize={{ minRows: 1, maxRows: 6 }}
                  value={text}
                  onChange={(event) => setParagraph(index, event.target.value)}
                  placeholder={`第 ${index + 1} 段`}
                />
              ))}
              <div className={styles.hint}>
                只改文字；字号、字体、颜色与项目符号沿用原来的。段落数据按「一行一段」输入。
              </div>
            </>
          ) : (
            <>
              <div className={styles.panelTitle}>选一个文本框</div>
              <div className={styles.hint}>
                点画布上的文字框或形状来编辑它。
                {editable.length === 0 && '这一页没有可编辑的文字。'}
              </div>
            </>
          )}
        </aside>
      </div>

      <div className={styles.note}>
        只读渲染 + 文字编辑：字体用系统里装的，版面可能与原件略有差别。
        本版只支持改文字（含增删行），改颜色/字号/位置请下载原件改后重传。
      </div>
    </div>
  )
}

/** 画布宽度（px）。与预览同一档，换文件时视觉宽度不变 */
const FIT_WIDTH_PX = 960

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    display: flex;
    flex-direction: column;
    min-height: 0;
  `,
  bar: css`
    margin-bottom: 10px;
  `,
  status: css`
    font-family: ${token.fontFamilyCode};
    font-size: ${token.fontSizeSM}px;
    color: ${token.colorTextTertiary};
  `,
  pager: css`
    align-self: flex-start;
    margin-bottom: 10px;
    flex-wrap: wrap;
  `,
  /* 画布 + 右侧编辑面板：面板固定宽，画布占剩下的 */
  body: css`
    display: flex;
    gap: 12px;
    align-items: flex-start;
    min-height: 0;

    @media (max-width: 1000px) {
      flex-direction: column;
    }
  `,
  canvas: css`
    flex: 1;
    min-width: 0;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    overflow: hidden;
    background: #ffffff;
    /* 可点的元素给个手势提示——选中是编辑的入口 */
    [data-element-id] {
      cursor: pointer;
    }

    svg {
      display: block;
      width: 100%;
      height: auto;
    }
  `,
  panel: css`
    width: 300px;
    flex-shrink: 0;
    padding: 10px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;

    @media (max-width: 1000px) {
      width: 100%;
    }
  `,
  panelTitle: css`
    margin-bottom: 8px;
    font-size: ${token.fontSizeSM}px;
    font-weight: 600;
    color: ${token.colorTextSecondary};
  `,
  para: css`
    margin-bottom: 6px;
  `,
  hint: css`
    font-size: ${token.fontSizeSM}px;
    color: ${token.colorTextTertiary};
    line-height: 1.6;
  `,
  state: css`
    padding: 40px 0;
  `,
  note: css`
    margin-top: 8px;
    font-size: ${token.fontSizeSM}px;
    color: ${token.colorTextTertiary};
  `,
}))
