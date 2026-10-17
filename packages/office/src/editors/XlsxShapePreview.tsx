import { useId, type CSSProperties } from 'react'
import { presetPath, presetPolygon } from '../../vendor/packages/pptx-render/src/preset-geometry.js'
import type { Fill, TextRun } from '../../vendor/packages/pptx-engine/src/types.js'
import type { XlsxVisual } from '../xlsx-visuals.js'
import { xlsxShapePreview } from './xlsx-shape-gallery.js'
import './xlsx-shape-preview.css'

const color = (value: string | undefined, fallback = 'none') =>
  value && /^(?:#[\da-f]{6}(?:[\da-f]{2})?|none)$/i.test(value) ? value : fallback
const dash: Record<string, string> = {
  dash: '4 3',
  dot: '1 3',
  dashDot: '4 3 1 3',
  lgDash: '8 3',
  lgDashDot: '8 3 1 3',
  lgDashDotDot: '8 3 1 3 1 3',
  sysDash: '3 1',
  sysDot: '1 1',
  sysDashDot: '3 1 1 1',
  sysDashDotDot: '3 1 1 1 1 1',
}
// Native read-model sequences have immutable source order and no editor-local state.
// Source ordinals distinguish identical adjacent runs/gradient stops without content-key collisions.
function sourceItems<T>(items: readonly T[]) {
  return items.map((value, ordinal) => ({ value, sourceKey: `native-${ordinal}` }))
}
function Paint({
  fill,
  id,
  width,
  height,
}: {
  fill?: Fill
  id: string
  width: number
  height: number
}) {
  if (fill?.type !== 'gradient' || fill.path || fill.stops.length > 64) return null
  const rad = ((fill.angle ?? 0) * Math.PI) / 10800000
  // scaled gradients follow the box diagonal; unscaled angles remain in physical coordinates.
  const dx = Math.cos(rad),
    dy = Math.sin(rad),
    length = Math.abs(width * dx) + Math.abs(height * dy),
    x = fill.scaled ? dx / 2 : (dx * length) / width / 2,
    y = fill.scaled ? dy / 2 : (dy * length) / height / 2
  return (
    <linearGradient id={id} x1={0.5 - x} y1={0.5 - y} x2={0.5 + x} y2={0.5 + y}>
      {sourceItems(fill.stops).map(({ value: stop, sourceKey }) => (
        <stop
          key={sourceKey}
          offset={Math.max(0, Math.min(1, stop.pos))}
          stopColor={color(stop.color)}
        />
      ))}
    </linearGradient>
  )
}
const paint = (fill: Fill | undefined, id: string, fallback: string) =>
  fill?.type === 'none'
    ? 'none'
    : fill?.type === 'solid'
      ? color(fill.color)
      : fill?.type === 'gradient' && !fill.path && fill.stops.length <= 64
        ? `url(#${id})`
        : fallback
function runStyle(run: TextRun, scale = 1): CSSProperties {
  return {
    fontFamily: run.fontFamily,
    fontSize:
      run.fontSize && Number.isFinite(run.fontSize)
        ? (Math.min(400, Math.max(1, run.fontSize)) * scale * 4) / 3
        : undefined,
    fontWeight: run.bold ? 700 : 400,
    fontStyle: run.italic ? 'italic' : 'normal',
    textDecoration:
      [run.underline && 'underline', run.strike && 'line-through'].filter(Boolean).join(' ') ||
      undefined,
    color: color(run.color, '#000000'),
    backgroundColor: color(run.highlight, 'transparent'),
    letterSpacing:
      run.letterSpacing !== undefined
        ? (Math.max(-20, Math.min(100, run.letterSpacing)) * 4) / 3
        : undefined,
    verticalAlign: run.baseline ? (run.baseline > 0 ? 'super' : 'sub') : undefined,
    textTransform: run.cap === 'all' ? 'uppercase' : undefined,
  }
}
/** Native geometry/paint are read-only. The containing button keeps the original grid anchor/identity. */
export function XlsxShapePreview({
  visual,
  width,
  height,
}: {
  visual: XlsxVisual
  width: number
  height: number
}) {
  const id = useId().replaceAll(':', ''),
    model = visual.shapePreview?.element,
    transform = model?.transform,
    rotation = ((((transform?.rot ?? 0) / 60000) % 360) + 360) % 360,
    frame = transform?.offset,
    nativeFrame = rotation && frame && frame.cx > 0 && frame.cy > 0,
    swap =
      !nativeFrame && ((rotation >= 45 && rotation < 135) || (rotation >= 225 && rotation < 315)),
    w = nativeFrame ? frame.cx / 9525 : swap ? height : width,
    h = nativeFrame ? frame.cy / 9525 : swap ? width : height
  let path = model?.customGeometry
  const custom = Boolean(path)
  if (!path && !model?.noGeometry) {
    const kind = model?.presetGeometry ?? visual.shapeType,
      polygon = presetPolygon(kind, w, h, model?.adjust),
      preset = presetPath(kind, w, h, model?.adjust)
    path = polygon
      ? {
          path:
            polygon.reduce((d, n, i) => d + (i % 2 ? ` ${n}` : `${i ? ' L' : 'M'} ${n}`), '') +
            ' Z',
        }
      : (preset ?? xlsxShapePreview(kind, w, h) ?? undefined)
    if (kind === 'roundRect' && model?.adjust?.adj !== undefined) {
      const r = (Math.min(w, h) * Math.min(50000, Math.max(0, model.adjust.adj))) / 100000
      path = {
        path: `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`,
      }
    }
  }
  if (visual.shapePreview?.unsupported || (!path && !model?.noGeometry))
    return (
      <span className="mimir-xlsx-shape-limited">
        <span>形状预览有限</span>
        <span>{visual.text || visual.name}</span>
      </span>
    )
  const fill = model?.fill,
    stroke = model?.stroke,
    fillPaint = paint(
      fill,
      `${id}-fill`,
      model ? 'none' : color(visual.fillColor ? `#${visual.fillColor}` : '#4472C4'),
    ),
    strokePaint = paint(stroke?.fill, `${id}-stroke`, model ? 'none' : fillPaint),
    paragraphs = model?.text?.paragraphs,
    rich =
      paragraphs?.map((p) => p.runs.map((r) => r.text).join('')).join('\n') === (visual.text ?? ''),
    insets = model?.text?.insets
  const pathProps = {
    stroke: strokePaint,
    strokeWidth: stroke ? Math.max(0, Math.min(100, stroke.width / 9525)) : 1,
    strokeDasharray: dash[stroke?.dash ?? ''],
    strokeLinecap: stroke?.cap === 'flat' ? ('butt' as const) : stroke?.cap,
    strokeLinejoin: stroke?.join,
    vectorEffect: 'non-scaling-stroke' as const,
  }
  return (
    <span
      className="mimir-xlsx-native-shape"
      style={{
        width: w,
        height: h,
        left: (width - w) / 2,
        top: (height - h) / 2,
        transform: `rotate(${rotation}deg) scale(${transform?.flipH ? -1 : 1}, ${transform?.flipV ? -1 : 1})`,
      }}
    >
      <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <Paint fill={fill} id={`${id}-fill`} width={w} height={h} />
          <Paint fill={stroke?.fill} id={`${id}-stroke`} width={w} height={h} />
        </defs>
        <g transform={custom ? `scale(${w}, ${h})` : undefined}>
          {path?.path && <path d={path.path} fill={fillPaint} {...pathProps} />}
          {path?.fillPath && <path d={path.fillPath} fill={fillPaint} stroke="none" />}
          {path?.strokePath && <path d={path.strokePath} fill="none" {...pathProps} />}
        </g>
      </svg>
      <span
        className="mimir-xlsx-native-shape__text"
        style={{
          padding: insets
            ? `${insets.t / 9525}px ${insets.r / 9525}px ${insets.b / 9525}px ${insets.l / 9525}px`
            : undefined,
          justifyContent:
            model?.text?.anchor === 'bottom'
              ? 'flex-end'
              : model?.text?.anchor === 'middle'
                ? 'center'
                : 'flex-start',
          whiteSpace: model?.text?.wrap === false ? 'pre' : 'pre-wrap',
          writingMode:
            model?.text?.vert === 'eaVert' || model?.text?.vert === 'vert'
              ? 'vertical-rl'
              : undefined,
        }}
      >
        {rich ? (
          sourceItems(paragraphs ?? []).map(({ value: p, sourceKey }) => (
            <span
              key={sourceKey}
              className="mimir-xlsx-native-shape__paragraph"
              style={{
                textAlign: p.align,
                direction: p.rtl ? 'rtl' : undefined,
                marginTop: ((p.spaceBefore ?? 0) * 4) / 3,
                marginBottom: ((p.spaceAfter ?? 0) * 4) / 3,
                marginLeft: (p.marL ?? 0) / 9525,
                marginRight: (p.marR ?? 0) / 9525,
                textIndent: (p.indent ?? 0) / 9525,
                lineHeight: p.lineExact
                  ? `${(p.lineExact * 4) / 3}px`
                  : p.lineHeight
                    ? p.lineHeight / 100
                    : undefined,
              }}
            >
              {p.bullet?.type === 'char' && <span aria-hidden="true">{p.bullet.char ?? '•'} </span>}
              {sourceItems(p.runs).map(({ value: run, sourceKey: runKey }) => (
                <span
                  key={runKey}
                  style={runStyle(run, Math.max(0.01, Math.min(1, model?.text?.fontScale ?? 1)))}
                >
                  {run.text}
                </span>
              ))}
              {!p.runs.some((r) => r.text) && <br />}
            </span>
          ))
        ) : (
          <span className="mimir-xlsx-native-shape__paragraph">{visual.text}</span>
        )}
      </span>
    </span>
  )
}
