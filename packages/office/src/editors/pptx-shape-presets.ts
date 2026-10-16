// Gallery order, labels and style colors follow GenOffice 480548fd55f1be3593ee0d8e316a734751d58309.
// Sources: packages/ui/src/shape-gallery.tsx and slides components/ribbon-shared.tsx (Apache-2.0).
import type { SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'
import type { Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import {
  isConnectorPreset,
  isPillPreset,
  presetPath,
  presetPolygon,
} from '../../vendor/packages/pptx-render/src/preset-geometry.js'

export interface PptxShapeDefinition {
  kind: string
  label: string
}
export const PPTX_SHAPE_GROUPS: readonly {
  key: string
  label: string
  shapes: readonly PptxShapeDefinition[]
}[] = [
  {
    key: 'lines',
    label: '线条',
    shapes: [
      { kind: 'line', label: '直线' },
      { kind: 'lineArrow', label: '箭头' },
      { kind: 'lineArrowDouble', label: '双箭头' },
      { kind: 'lineBent', label: '肘形连接符' },
      { kind: 'lineCurved', label: '曲线连接符' },
    ],
  },
  {
    key: 'rects',
    label: '矩形',
    shapes: [
      { kind: 'rect', label: '矩形' },
      { kind: 'roundRect', label: '圆角矩形' },
      { kind: 'snip1Rect', label: '剪去单角的矩形' },
      { kind: 'snip2SameRect', label: '剪去同侧角的矩形' },
      { kind: 'snip2DiagRect', label: '剪去对角的矩形' },
      { kind: 'snipRoundRect', label: '剪去一个圆角的矩形' },
      { kind: 'round1Rect', label: '圆化单角的矩形' },
      { kind: 'round2SameRect', label: '圆化同侧角的矩形' },
      { kind: 'round2DiagRect', label: '圆化对角的矩形' },
    ],
  },
  {
    key: 'basic',
    label: '基本形状',
    shapes: [
      { kind: 'ellipse', label: '椭圆' },
      { kind: 'triangle', label: '三角形' },
      { kind: 'rtTriangle', label: '直角三角形' },
      { kind: 'parallelogram', label: '平行四边形' },
      { kind: 'trapezoid', label: '梯形' },
      { kind: 'diamond', label: '菱形' },
      { kind: 'pentagon', label: '五边形' },
      { kind: 'hexagon', label: '六边形' },
      { kind: 'octagon', label: '八边形' },
      { kind: 'plus', label: '十字形' },
      { kind: 'mathPlus', label: '加号' },
      { kind: 'pie', label: '饼形' },
      { kind: 'chord', label: '弦形' },
      { kind: 'teardrop', label: '泪滴形' },
      { kind: 'frame', label: '框架' },
      { kind: 'halfFrame', label: '半闭框' },
      { kind: 'corner', label: 'L 形' },
      { kind: 'diagStripe', label: '斜纹' },
      { kind: 'donut', label: '圆环' },
      { kind: 'noSmoking', label: '禁止符' },
      { kind: 'blockArc', label: '空心弧' },
      { kind: 'foldedCorner', label: '折角形' },
      { kind: 'bevel', label: '棱台' },
      { kind: 'cube', label: '立方体' },
      { kind: 'can', label: '圆柱形' },
      { kind: 'lightningBolt', label: '闪电形' },
      { kind: 'heart', label: '心形' },
      { kind: 'sun', label: '太阳形' },
      { kind: 'moon', label: '新月形' },
      { kind: 'cloud', label: '云形' },
      { kind: 'arc', label: '弧形' },
      { kind: 'plaque', label: '铭牌' },
      { kind: 'smileyFace', label: '笑脸' },
      { kind: 'leftBracket', label: '左中括号' },
      { kind: 'rightBracket', label: '右中括号' },
      { kind: 'leftBrace', label: '左大括号' },
      { kind: 'rightBrace', label: '右大括号' },
    ],
  },
  {
    key: 'arrows',
    label: '箭头',
    shapes: [
      { kind: 'rightArrow', label: '右箭头' },
      { kind: 'leftArrow', label: '左箭头' },
      { kind: 'upArrow', label: '上箭头' },
      { kind: 'downArrow', label: '下箭头' },
      { kind: 'leftRightArrow', label: '左右箭头' },
      { kind: 'upDownArrow', label: '上下箭头' },
      { kind: 'quadArrow', label: '十字箭头' },
      { kind: 'bentArrow', label: '圆角右箭头' },
      { kind: 'uturnArrow', label: '手杖形箭头' },
      { kind: 'curvedRightArrow', label: '弧形右箭头' },
      { kind: 'stripedRightArrow', label: '虚尾箭头' },
      { kind: 'notchedRightArrow', label: '缺口右箭头' },
      { kind: 'chevron', label: 'V 形' },
      { kind: 'homePlate', label: '燕尾形' },
    ],
  },
  {
    key: 'stars',
    label: '星形',
    shapes: [
      { kind: 'star4', label: '四角星' },
      { kind: 'star5', label: '五角星' },
      { kind: 'star6', label: '六角星' },
      { kind: 'star7', label: '七角星' },
      { kind: 'star8', label: '八角星' },
      { kind: 'star10', label: '十角星' },
      { kind: 'star12', label: '十二角星' },
      { kind: 'star16', label: '十六角星' },
      { kind: 'star24', label: '二十四角星' },
      { kind: 'star32', label: '三十二角星' },
      { kind: 'irregularSeal1', label: '爆炸形 1' },
      { kind: 'irregularSeal2', label: '爆炸形 2' },
      { kind: 'ribbon', label: '前凸带形' },
      { kind: 'ribbon2', label: '上凸带形' },
      { kind: 'wave', label: '波形' },
      { kind: 'doubleWave', label: '双波形' },
    ],
  },
  {
    key: 'flowchart',
    label: '流程图',
    shapes: [
      { kind: 'flowChartProcess', label: '流程图: 过程' },
      { kind: 'flowChartAlternateProcess', label: '流程图: 可选过程' },
      { kind: 'flowChartDecision', label: '决策' },
      { kind: 'flowChartPredefinedProcess', label: '流程图: 预定义过程' },
      { kind: 'flowChartInternalStorage', label: '流程图: 内部贮存' },
      { kind: 'flowChartDocument', label: '流程图: 文档' },
      { kind: 'flowChartMultidocument', label: '流程图: 多文档' },
      { kind: 'flowChartTerminator', label: '终止' },
      { kind: 'flowChartPreparation', label: '流程图: 准备' },
      { kind: 'flowChartManualInput', label: '流程图: 手动输入' },
      { kind: 'flowChartManualOperation', label: '流程图: 手动操作' },
      { kind: 'flowChartConnector', label: '流程图: 接点' },
      { kind: 'flowChartOffpageConnector', label: '流程图: 离页连接符' },
      { kind: 'flowChartMagneticDisk', label: '流程图: 磁盘' },
      { kind: 'flowChartMagneticDrum', label: '流程图: 直接访问存储器' },
      { kind: 'flowChartDisplay', label: '流程图: 显示' },
      { kind: 'flowChartDelay', label: '流程图: 延期' },
      { kind: 'flowChartOr', label: '流程图: 或者' },
      { kind: 'flowChartCollate', label: '流程图: 对照' },
      { kind: 'flowChartSort', label: '流程图: 排序' },
      { kind: 'flowChartExtract', label: '流程图: 摘录' },
      { kind: 'flowChartMerge', label: '流程图: 合并' },
      { kind: 'flowChartSummingJunction', label: '流程图: 汇总连接' },
      { kind: 'flowChartPunchedTape', label: '流程图: 资料带' },
    ],
  },
  {
    key: 'callouts',
    label: '标注',
    shapes: [
      { kind: 'wedgeRectCallout', label: '矩形标注' },
      { kind: 'wedgeRoundRectCallout', label: '圆角矩形标注' },
      { kind: 'wedgeEllipseCallout', label: '椭圆形标注' },
      { kind: 'cloudCallout', label: '云形标注' },
    ],
  },
]
export const PPTX_SHAPES = PPTX_SHAPE_GROUPS.flatMap((group) => group.shapes)
export const isPptxLineKind = (kind: string) =>
  ['line', 'lineArrow', 'lineArrowDouble', 'lineBent', 'lineCurved'].includes(kind)
export function pptxShapeLabel(kind: string | undefined) {
  const label = PPTX_SHAPES.find((shape) => shape.kind === kind)?.label
  if (label) return label
  if (isConnectorPreset(kind)) {
    if (kind?.startsWith('bentConnector')) return '折线连接线'
    if (kind?.startsWith('curvedConnector')) return '曲线连接线'
    return '直线连接线'
  }
  return kind ? `自定义形状（${kind}）` : '自定义几何'
}

export interface PptxShapePreviewPaths {
  path?: string
  fillPath?: string
  strokePath?: string
}
/** The same geometry channels used by the native canvas; no generic rectangle placeholders. */
export function pptxShapePreview(kind: string, w = 36, h = 28): PptxShapePreviewPaths | null {
  if (isPptxLineKind(kind)) {
    let strokePath =
      kind === 'lineBent'
        ? `M 0 ${h} H ${w / 2} V 0 H ${w}`
        : kind === 'lineCurved'
          ? `M 0 ${h} C ${w * 0.6} ${h} ${w * 0.4} 0 ${w} 0`
          : `M 0 ${h} L ${w} 0`
    if (kind === 'lineArrow' || kind === 'lineArrowDouble')
      strokePath += ` M ${w - 10} 2 L ${w} 0 L ${w - 2} 10`
    if (kind === 'lineArrowDouble') strokePath += ` M 2 ${h - 10} L 0 ${h} L 10 ${h - 2}`
    return { strokePath }
  }
  const polygon = presetPolygon(kind, w, h)
  if (polygon)
    return {
      path:
        polygon.reduce(
          (d: string, n: number, index: number) =>
            d + (index % 2 ? ` ${n}` : `${index ? ' L' : 'M'} ${n}`),
          '',
        ) + ' Z',
    }
  const paths = presetPath(kind, w, h)
  if (paths) return { path: paths.path, fillPath: paths.fillPath, strokePath: paths.strokePath }
  if (kind === 'ellipse')
    return {
      path: `M 0 ${h / 2} a ${w / 2} ${h / 2} 0 1 0 ${w} 0 a ${w / 2} ${h / 2} 0 1 0 ${-w} 0`,
    }
  const radius =
    kind === 'roundRect' || kind === 'flowChartAlternateProcess'
      ? Math.min(w, h) / 6
      : isPillPreset(kind)
        ? Math.min(w, h) / 2
        : 0
  if (radius)
    return {
      path: `M ${radius} 0 H ${w - radius} Q ${w} 0 ${w} ${radius} V ${h - radius} Q ${w} ${h} ${w - radius} ${h} H ${radius} Q 0 ${h} 0 ${h - radius} V ${radius} Q 0 0 ${radius} 0 Z`,
    }
  if (kind === 'rect' || kind === 'flowChartProcess') return { path: `M 0 0 H ${w} V ${h} H 0 Z` }
  return null
}

const ACCENTS = [
  ['neutral', '灰色', '#5A5A5A'],
  ['red', '红色', '#C43E1C'],
  ['orange', '橙色', '#E97132'],
  ['yellow', '黄色', '#FFC000'],
  ['green', '绿色', '#4EA72E'],
  ['cyan', '青色', '#0F9ED5'],
  ['blue', '蓝色', '#0A50A1'],
  ['purple', '紫色', '#7030A0'],
] as const
function shade(hex: string, amount: number) {
  return (
    '#' +
    [1, 3, 5]
      .map((index) => {
        const value = parseInt(hex.slice(index, index + 2), 16)
        return Math.round(amount >= 0 ? value + (255 - value) * amount : value * (1 + amount))
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
      .toUpperCase()
  )
}
export const PPTX_SHAPE_STYLE_ROWS = [
  { key: 'outline', label: '彩色描边' },
  { key: 'soft', label: '浅色填充' },
  { key: 'solid', label: '实心填充' },
  { key: 'dash', label: '虚线描边' },
] as const
export interface PptxShapeStyle {
  key: string
  row: string
  label: string
  colorLabel: string
  fill: string
  stroke: string
  dash: string
}
export const PPTX_SHAPE_STYLES: readonly PptxShapeStyle[] = PPTX_SHAPE_STYLE_ROWS.flatMap((row) =>
  ACCENTS.map(([key, colorLabel, color]) => ({
    key: `${row.key}-${key}`,
    row: row.key,
    label: `${colorLabel}·${row.label}`,
    colorLabel,
    fill: row.key === 'solid' ? color : row.key === 'soft' ? shade(color, 0.8) : '#FFFFFF',
    stroke: row.key === 'solid' ? shade(color, -0.35) : color,
    dash: row.key === 'dash' ? 'dash' : 'solid',
  })),
)
export function currentPptxShapeStyle(element: SlideElement | null) {
  if (!element || (element.type !== 'shape' && element.type !== 'text')) return undefined
  const { fill, stroke } = element
  if (stroke?.fill.type !== 'solid') return undefined
  const strokeColor = stroke.fill.color.toUpperCase()
  const candidates = PPTX_SHAPE_STYLES.filter(
    (style) =>
      style.stroke.toUpperCase() === strokeColor && style.dash === (stroke.dash ?? 'solid'),
  )
  // Native connectors are stroke-only: parsing intentionally ignores their invisible XML fill.
  // Outline and soft-fill presets share a stroke, so only a unique visible match is meaningful.
  if (isConnectorPreset(element.presetGeometry))
    return candidates.length === 1 ? candidates[0] : undefined
  if (fill?.type !== 'solid') return undefined
  return candidates.find((style) => style.fill.toUpperCase() === fill.color.toUpperCase())
}
export function pptxShapeStyleOps(
  target: { slide: number; el: string },
  element: SlideElement,
  style: PptxShapeStyle,
): Op[] {
  const width = 'stroke' in element ? element.stroke?.width : undefined
  return [
    { op: 'setFill', target, fill: style.fill },
    {
      op: 'setStroke',
      target,
      stroke: {
        color: style.stroke,
        widthEmu: width && width > 0 ? width : 12700,
        dash: style.dash,
      },
    },
  ]
}
export function pptxInsertShapeOp(kind: string, slide: number, width: number, height: number): Op {
  return {
    op: 'addElement',
    target: { slide },
    kind,
    offset: {
      x: Math.round(width * 0.2),
      y: Math.round(height * 0.25),
      cx: Math.round(width * 0.3),
      cy: Math.round(height * 0.2),
    },
    fill: '#D9E8FB',
    stroke: { color: '#245A9B', widthEmu: 12700 },
  }
}
