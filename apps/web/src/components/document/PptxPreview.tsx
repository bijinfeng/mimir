import { useEffect, useMemo, useState } from 'react'
import { Empty, Segmented, Skeleton, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { openPptx, renderDeck, type PptxDeck, type RenderedSlide } from '@mimir/office'
import { api } from '@/lib/api'

/**
 * pptx 的**只读预览**（`packages/office/src/pptx.ts` 解析、
 * `pptx-svg.ts` 渲染成 SVG）。
 *
 * ## 为什么画成 SVG 而不是 canvas
 *
 * 上游的渲染适配层是 Konva（canvas 2D）。canvas 里的文字**选不中、搜不到、
 * 读屏读不到**——对着一页幻灯片想复制一句话是很自然的动作。SVG 的 `<text>`
 * 是真实文本节点，选中/搜索/缩放都免费，代价是元素多一些。
 * 保真逻辑（坐标、换行、版式继承）全在上游的 RenderTree 里，两者共用同一份。
 *
 * ## 为什么一次把全部页都渲染出来
 *
 * 一份演示文稿通常几十页，渲染是纯字符串拼接（无 DOM），几十页在毫秒级。
 * 全渲染完的好处是**页码可以随便跳**、缩略图将来也能直接用。若以后遇到
 * 几百页的大文件，改成按需渲染即可（`renderSlide` 是单页入口）。
 *
 * ## 如实标注的四件事
 *
 * 与 docx 的分页视图同一条规矩——**画不出来的不假装**：
 *   - **字体的细微差异**：浏览器用系统里装的字体，字宽与 PowerPoint 有
 *     细微差别，所以一行在哪儿断可能与原件不同。要像素级一致得 vendored
 *     Calibri 等字体（docx 那边有，这里没接）
 *   - **阴影按近似画**（SVG 滤镜），**内阴影不画**——SVG 做不出 OOXML 的
 *     内阴影语义（带缩放/倾斜），少画一层比画一层错的好
 *   - **SmartArt / OLE / 视频**：有预渲染图形的画出来，没有的画占位块
 *   - **动画不播**（只读预览的题中之义）
 */
export function PptxPreview({ documentId }: { documentId: string }) {
  const { styles } = useStyles()
  const [deck, setDeck] = useState<PptxDeck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [slides, setSlides] = useState<RenderedSlide[] | null>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(api.documents.sourceUrl(documentId), { credentials: 'include' })
        if (!res.ok) throw new Error(`读取原件失败：HTTP ${res.status}`)
        const parsed = await openPptx(new Uint8Array(await res.arrayBuffer()))
        if (cancelled) return
        setDeck(parsed)
        // 渲染是纯计算（无 DOM），放在这里一次算完，切页就只是换 index
        setSlides(renderDeck(parsed, { fitWidthPx: FIT_WIDTH_PX }))
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [documentId])

  const hiddenCount = useMemo(() => (slides ?? []).filter((s) => s.hidden).length, [slides])

  if (error) {
    return (
      <Empty
        className={styles.state}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<Typography.Text type="danger">{error}</Typography.Text>}
      />
    )
  }
  if (!deck || !slides) {
    return (
      <div className={styles.state}>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    )
  }

  const current = slides[active] ?? slides[0]
  if (!current) return null

  return (
    <div className={styles.wrap}>
      {/*
        页码页签。幻灯片总是要翻的（一份 30 页的演示文稿不该靠滚动），
        而多页时 Segmented 是最省事的翻法。
      */}
      {slides.length > 1 ? (
        <Segmented
          className={styles.pager}
          size="small"
          value={active}
          onChange={(value) => setActive(Number(value))}
          options={slides.map((s, i) => ({
            // 隐藏页放映时不出现，标出来免得用户对不上原件
            label: s.hidden ? `${i + 1} 隐藏` : `${i + 1}`,
            value: i,
          }))}
        />
      ) : (
        <div className={styles.slideName}>共 1 页</div>
      )}

      <div
        className={styles.canvas}
        /*
          注入渲染好的 SVG。**为什么用 dangerouslySetInnerHTML 而不是 React
          元素**：渲染器是纯函数（绘制列表 → 字符串），产物要能脱离 React
          单独用（存成 .svg 文件、在测试里比对字符串、将来做导出）。重写成
          React 组件会让那三处各写一份。字符串来自我们自己的渲染器、
          内容是转义过的 XML（`pptx-svg.ts` 有转义测试与 XML 可解析性测试），
          不是用户可控的 HTML 片段。
        */
        dangerouslySetInnerHTML={{ __html: current.svg }}
      />

      <div className={styles.note}>
        只读预览：字体用系统里装的，换行位置可能与原件略有差别；阴影为近似效果，内阴影与动画不呈现。
        SmartArt / 嵌入对象有预渲染图形的会画出来，没有的显示为占位块。
        {hiddenCount > 0 && `共 ${hiddenCount} 页是隐藏页（放映时跳过，这里列出来）。`}
        要看原样请下载原件。
      </div>
    </div>
  )
}

/** 画布宽度（px）。与 docx 分页视图的纸宽同一档，换文件时视觉宽度不变 */
const FIT_WIDTH_PX = 960

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    display: flex;
    flex-direction: column;
    min-height: 0;
  `,
  pager: css`
    align-self: flex-start;
    margin-bottom: 10px;
    /* 页数多时换行，不要撑破容器 */
    flex-wrap: wrap;
  `,
  slideName: css`
    margin-bottom: 6px;
    font-size: ${token.fontSizeSM}px;
    color: ${token.colorTextSecondary};
  `,
  /* 幻灯片像一张纸：细边 + 圆角，按容器宽度等比缩放
     （SVG 里的坐标是按 960 宽算的，这里只管显示尺寸） */
  canvas: css`
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    overflow: hidden;
    background: #ffffff;

    svg {
      display: block;
      width: 100%;
      height: auto;
    }
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
