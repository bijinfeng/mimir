import { useLayoutEffect, useRef, useState } from 'react'
import { XlsxShapePreview } from './XlsxShapePreview.js'
import {
  measureXlsxGrid,
  sameXlsxGridMetrics,
  xlsxVisualBox,
  type XlsxGridMetrics,
} from './xlsx-object-layout.js'
import type { XlsxSheet } from '../xlsx.js'
import './xlsx-shape-gallery.css'
export { xlsxVisualBox } from './xlsx-object-layout.js'
export function XlsxObjectLayer({
  sheet,
  selectedId,
  onSelect,
}: {
  sheet: XlsxSheet
  selectedId: string
  onSelect: (id: string) => void
}) {
  const layer = useRef<HTMLDivElement>(null),
    [layout, setLayout] = useState<{ sheet: XlsxSheet; metrics: XlsxGridMetrics | null } | null>(
      null,
    )
  useLayoutEffect(() => {
    if (!sheet.visuals?.length) return
    const stage = layer.current?.parentElement,
      table = stage?.querySelector<HTMLTableElement>(':scope > table.mimir-xlsx')
    if (!stage || !table) return
    const measure = () => {
      const metrics = measureXlsxGrid(stage, table, sheet)
      setLayout((before) =>
        before?.sheet === sheet && sameXlsxGridMetrics(before.metrics, metrics)
          ? before
          : { sheet, metrics },
      )
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(table)
    for (const row of table.rows) observer?.observe(row)
    for (const column of table.querySelectorAll('col')) observer?.observe(column)
    const zoomObserver = new MutationObserver(measure)
    zoomObserver.observe(stage, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      zoomObserver.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [sheet])
  const metrics = layout?.sheet === sheet ? layout.metrics : null
  return (
    <div ref={layer} className="mimir-xlsx-objects" aria-label="工作表对象">
      {(sheet.visuals ?? []).map((v) => {
        const box = xlsxVisualBox(sheet, v, metrics)
        if (box.width <= 0 || box.height <= 0) return null
        return (
          <button
            type="button"
            key={v.id}
            className={`mimir-xlsx-object${selectedId === v.id ? ' mimir-xlsx-object--selected' : ''}`}
            aria-label={`选择${v.kind === 'chart' ? '图表' : v.kind === 'image' ? '图片' : '形状'}：${v.name}`}
            aria-pressed={selectedId === v.id}
            onClick={() => onSelect(v.id)}
            style={box}
          >
            {v.kind === 'chart' && v.svg ? (
              <span
                className="mimir-xlsx-object__chart"
                dangerouslySetInnerHTML={{ __html: v.svg }}
              />
            ) : v.kind === 'image' && v.image ? (
              <img src={v.image} alt={v.name} draggable={false} />
            ) : v.kind === 'shape' ? (
              <XlsxShapePreview visual={v} width={box.width} height={box.height} />
            ) : (
              <span>{v.name}（暂不支持预览）</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
