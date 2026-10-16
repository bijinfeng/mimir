import { presetPath, presetPolygon } from '../../vendor/packages/pptx-render/src/preset-geometry.js'
import type { XlsxSheet } from '../xlsx.js'
import type { XlsxVisual } from '../xlsx-visuals.js'
export function xlsxVisualBox(sheet: XlsxSheet, visual: XlsxVisual) {
  const a = visual.anchor
  const x = (col: number, off: number) =>
    34 +
    Array.from({ length: Math.min(col, 200) }, (_, c) =>
      sheet.columns.find((item) => item.col === c),
    ).reduce((n, item) => n + (item?.hidden ? 0 : (item?.width ?? 64)), 0) +
    off / 9525
  const y = (row: number, off: number) =>
    24 +
    Array.from({ length: Math.min(row, 1000) }, (_, r) =>
      sheet.rows.find((item) => item.number === r + 1),
    ).reduce((n, item) => n + (item?.hidden ? 0 : (item?.height ?? 20)), 0) +
    off / 9525
  const left = x(a.fromColumn, a.fromColumnOffset),
    top = y(a.fromRow, a.fromRowOffset)
  return {
    left,
    top,
    width: Math.max(24, x(a.toColumn, a.toColumnOffset) - left),
    height: Math.max(24, y(a.toRow, a.toRowOffset) - top),
  }
}
export function XlsxObjectLayer({
  sheet,
  selectedId,
  onSelect,
}: {
  sheet: XlsxSheet
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="mimir-xlsx-objects" aria-label="工作表对象">
      {(sheet.visuals ?? []).map((v) => (
        <button
          type="button"
          key={v.id}
          className={`mimir-xlsx-object${selectedId === v.id ? ' mimir-xlsx-object--selected' : ''}`}
          aria-label={`选择${v.kind === 'chart' ? '图表' : v.kind === 'image' ? '图片' : '形状'}：${v.name}`}
          aria-pressed={selectedId === v.id}
          onClick={() => onSelect(v.id)}
          style={xlsxVisualBox(sheet, v)}
        >
          {v.kind === 'chart' && v.svg ? (
            <span
              className="mimir-xlsx-object__chart"
              dangerouslySetInnerHTML={{ __html: v.svg }}
            />
          ) : v.kind === 'image' && v.image ? (
            <img src={v.image} alt={v.name} draggable={false} />
          ) : v.kind === 'shape' ? (
            <XlsxShape
              visual={v}
              width={xlsxVisualBox(sheet, v).width}
              height={xlsxVisualBox(sheet, v).height}
            />
          ) : (
            <span>{v.name}（暂不支持预览）</span>
          )}
        </button>
      ))}
    </div>
  )
}

function XlsxShape({
  visual,
  width,
  height,
}: {
  visual: XlsxVisual
  width: number
  height: number
}) {
  const path = presetPath(visual.shapeType, width, height),
    polygon = presetPolygon(visual.shapeType, width, height)
  const fill = visual.fillColor ? '#' + visual.fillColor : '#4472C4'
  return (
    <span className="mimir-xlsx-object__shape">
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
        {path ? (
          <>
            {path.path && <path d={path.path} fill={fill} stroke={fill} />}
            {path.fillPath && <path d={path.fillPath} fill={fill} />}
            {path.strokePath && <path d={path.strokePath} fill="none" stroke={fill} />}
          </>
        ) : polygon ? (
          <polygon
            points={Array.from(
              { length: polygon.length / 2 },
              (_, i) => `${polygon[i * 2]},${polygon[i * 2 + 1]}`,
            ).join(' ')}
            fill={fill}
          />
        ) : visual.shapeType === 'ellipse' ? (
          <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill={fill} />
        ) : (
          <rect
            width={width}
            height={height}
            rx={visual.shapeType === 'roundRect' ? Math.min(width, height) * 0.15 : 0}
            fill={fill}
          />
        )}
      </svg>
      <span>{visual.text}</span>
    </span>
  )
}
