import {
  parsePivotDefinition,
  type PivotDefinition,
} from '../vendor/packages/xlsx-gateway/src/gateway/xlsx-pivot.js'
import { parseChartXml } from '../vendor/packages/pptx-engine/src/chart.js'
import { buildChartNode } from '../vendor/packages/pptx-render/src/build-chart.js'
import { HeuristicMetrics } from '../vendor/packages/pptx-render/src/metrics.js'
import { renderSlideToSvg } from './pptx-svg.js'
import type { BoundedZip } from './zip-bounds.js'
import { decodeXlsxXml } from './xlsx-format.js'
import {
  readXlsxShapePreviews,
  readXlsxShapeTheme,
  readXlsxShapeThemeTarget,
  type XlsxShapePreview,
} from './xlsx-shape-preview.js'
import { xlsxAttribute } from './xlsx-sheet-features.js'
import type { DrawingAnchor } from '../vendor/packages/xlsx-gateway/src/gateway/xlsx-drawing-add.js'
import { readXlsxTableBands, type XlsxTableBands } from './xlsx-table-styles.js'
export interface XlsxVisual {
  id: string
  drawingPath: string
  drawingIndex: number
  anchor: DrawingAnchor
  kind: 'chart' | 'shape' | 'image'
  name: string
  chartPath?: string
  chart?: {
    type: string
    legend: string
    dataLabels: string
    grouping: string
    series: string[]
    seriesColors?: (string | undefined)[]
    axisTitles?: { category?: string; value?: string }
  }
  svg?: string
  image?: string
  shapePreview?: XlsxShapePreview
  shapeType?: string
  fillColor?: string
  text?: string
}
export interface XlsxPivot {
  path: string
  cachePath: string
  name: string
  definition: PivotDefinition
}
export interface XlsxTable {
  path: string
  relationshipId: string
  name: string
  range: string
  columns: string[]
  style: string
  bandedRows: boolean
  bands?: XlsxTableBands
  headerRows?: number
  totalRows?: number
  bandedColumns?: boolean
  firstColumn?: boolean
  lastColumn?: boolean
  filterActive?: boolean
}
export function resolveXlsxPart(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const p of target.split('/')) {
    if (p === '..') parts.pop()
    else if (p !== '.') parts.push(p)
  }
  return parts.join('/')
}
export function xlsxRelsPath(part: string): string {
  return part.replace(/(^|\/)([^/]+)$/, '$1_rels/$2.rels')
}
async function relations(zip: BoundedZip, part: string) {
  return [...((await zip.readText(xlsxRelsPath(part))) ?? '').matchAll(/<Relationship\b[^>]*>/g)]
    .filter(([tag]) => xlsxAttribute(tag, 'TargetMode') !== 'External')
    .map(([tag]) => ({
      id: xlsxAttribute(tag, 'Id') ?? '',
      type: xlsxAttribute(tag, 'Type') ?? '',
      path: resolveXlsxPart(part, xlsxAttribute(tag, 'Target') ?? ''),
    }))
}
export const XLSX_ANCHOR_PATTERN =
  /<([A-Za-z_][\w.-]*:)?(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/\1\2>/g
function marker(xml: string, kind: string) {
  const body =
    new RegExp(`<(?:\\w+:)?${kind}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${kind}>`).exec(xml)?.[1] ?? ''
  const n = (tag: string) => Number(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)<`).exec(body)?.[1] ?? 0)
  return { row: n('row'), col: n('col'), rowOff: n('rowOff'), colOff: n('colOff') }
}
export async function readXlsxObjects(
  zip: BoundedZip,
  entry: string,
): Promise<{ visuals: XlsxVisual[]; tables: XlsxTable[]; pivots: XlsxPivot[] }> {
  const rels = await relations(zip, entry),
    visuals: XlsxVisual[] = [],
    tables: XlsxTable[] = [],
    pivots: XlsxPivot[] = []
  const themeTarget = readXlsxShapeThemeTarget(
    (await zip.readText(xlsxRelsPath('xl/workbook.xml'))) ?? '',
  )
  const theme = themeTarget
    ? readXlsxShapeTheme(
        (await zip.readText(resolveXlsxPart('xl/workbook.xml', themeTarget))) ?? '',
      )
    : undefined
  for (const rel of rels) {
    if (rel.type.endsWith('/pivotTable')) {
      const xml = (await zip.readText(rel.path)) ?? '',
        cache = (await relations(zip, rel.path)).find((r) =>
          r.type.endsWith('/pivotCacheDefinition'),
        )
      if (cache)
        pivots.push({
          path: rel.path,
          cachePath: cache.path,
          name: xlsxAttribute(/<pivotTableDefinition\b[^>]*>/.exec(xml)?.[0] ?? '', 'name') ?? '',
          definition: parsePivotDefinition(xml, (await zip.readText(cache.path)) ?? ''),
        })
    }
    if (rel.type.endsWith('/table')) {
      const xml = (await zip.readText(rel.path)) ?? '',
        tag = /<table\b[^>]*>/.exec(xml)?.[0] ?? '',
        styleTag = /<tableStyleInfo\b[^>]*>/.exec(xml)?.[0] ?? '',
        style = xlsxAttribute(styleTag, 'name') ?? '',
        enabled = (key: string) => /^(?:1|true)$/.test(xlsxAttribute(styleTag, key) ?? '')
      tables.push({
        path: rel.path,
        relationshipId: rel.id,
        name: xlsxAttribute(tag, 'displayName') ?? '',
        range: xlsxAttribute(tag, 'ref') ?? '',
        columns: [...xml.matchAll(/<tableColumn\b[^>]*>/g)].map(
          ([t]) => xlsxAttribute(t, 'name') ?? '',
        ),
        style,
        bands: readXlsxTableBands(
          style,
          (await zip.readText('xl/styles.xml')) ?? '',
          (await zip.readText('xl/theme/theme1.xml')) ?? '',
        ),
        headerRows: Number(xlsxAttribute(tag, 'headerRowCount') ?? 1),
        totalRows: Number(xlsxAttribute(tag, 'totalsRowCount') ?? 0),
        bandedRows: enabled('showRowStripes'),
        bandedColumns: enabled('showColumnStripes'),
        firstColumn: enabled('showFirstColumn'),
        lastColumn: enabled('showLastColumn'),
        filterActive:
          /<(?:filters|customFilters|dynamicFilter|top10|colorFilter|iconFilter)\b/.test(xml),
      })
    }
    if (!rel.type.endsWith('/drawing')) continue
    const xml = (await zip.readText(rel.path)) ?? '',
      drawingRels = await relations(zip, rel.path),
      shapePreviews = readXlsxShapePreviews(xml, theme)
    for (const [index, match] of [...xml.matchAll(XLSX_ANCHOR_PATTERN)].entries()) {
      const block = match[0],
        from = marker(block, 'from'),
        to = marker(block, 'to')
      if (match[2] === 'absoluteAnchor') {
        const position = /<(?:\w+:)?pos\b[^>]*>/.exec(block)?.[0] ?? ''
        from.colOff = Number(xlsxAttribute(position, 'x') ?? 0)
        from.rowOff = Number(xlsxAttribute(position, 'y') ?? 0)
      }
      const extent = /<(?:\w+:)?ext\b[^>]*\bcx=["'](\d+)["'][^>]*\bcy=["'](\d+)["']/.exec(block)
      const anchor = {
        fromRow: from.row,
        fromColumn: from.col,
        fromRowOffset: from.rowOff,
        fromColumnOffset: from.colOff,
        toRow: match[2] === 'twoCellAnchor' ? to.row : from.row,
        toColumn: match[2] === 'twoCellAnchor' ? to.col : from.col,
        toRowOffset:
          match[2] === 'twoCellAnchor' ? to.rowOff : from.rowOff + Number(extent?.[2] ?? 1905000),
        toColumnOffset:
          match[2] === 'twoCellAnchor' ? to.colOff : from.colOff + Number(extent?.[1] ?? 3048000),
      }
      const name =
        xlsxAttribute(/<(?:\w+:)?cNvPr\b[^>]*>/.exec(block)?.[0] ?? '', 'name') ??
        `对象 ${index + 1}`
      const visual: XlsxVisual = {
        id: `${rel.path}#${index}`,
        drawingPath: rel.path,
        drawingIndex: index,
        anchor,
        name,
        kind: 'shape',
      }
      const chartId = xlsxAttribute(/<(?:\w+:)?chart\b[^>]*>/.exec(block)?.[0] ?? '', 'r:id')
      const imageId = xlsxAttribute(/<(?:\w+:)?blip\b[^>]*>/.exec(block)?.[0] ?? '', 'r:embed')
      if (chartId) {
        const chart = drawingRels.find((r) => r.id === chartId)
        if (!chart) continue
        visual.kind = 'chart'
        visual.chartPath = chart.path
        const chartXml = (await zip.readText(chart.path)) ?? ''
        const model = parseChartXml(chartXml)
        if (model) {
          visual.name = model.title || name
          visual.chart = {
            type: /<c:doughnutChart\b/.test(chartXml)
              ? 'doughnut'
              : /<c:barChart\b/.test(chartXml) && /<c:lineChart\b/.test(chartXml)
                ? 'combo'
                : model.kind === 'bar'
                  ? /<c:barDir\b[^>]*val="bar"/.test(chartXml)
                    ? 'bar'
                    : 'column'
                  : model.kind,
            legend:
              ({ t: 'top', b: 'bottom', l: 'left', r: 'right', tr: 'right' } as const)[
                model.legendPos ?? 'r'
              ] ?? 'none',
            dataLabels: model.dataLabelsPct ? 'percent' : model.dataLabels ? 'value' : 'none',
            grouping: model.grouping === 'standard' ? 'clustered' : (model.grouping ?? 'clustered'),
            series: model.series.map((s, i) => s.name || `系列${i + 1}`),
            seriesColors: model.series.map((s) => s.color),
            axisTitles: { category: model.catAxis?.title, value: model.valAxis?.title },
          }
          if (!model.legendPos) visual.chart.legend = 'none'
          const w = 448,
            h = 300
          const node = buildChartNode(
            'xlsx-chart',
            visual.id,
            model,
            {
              x: 0,
              y: 0,
              w,
              h,
              rotationDeg: 0,
              flipH: false,
              flipV: false,
              centerX: w / 2,
              centerY: h / 2,
            },
            { widthPx: w, heightPx: h, scale: 1 },
            new HeuristicMetrics(),
          )
          if (node)
            visual.svg = renderSlideToSvg(
              {
                widthPx: w,
                heightPx: h,
                scale: 1,
                background: { kind: 'solid', color: '#FFFFFF' },
                nodes: [node],
              },
              `xlsx-${index}`,
            )
        }
      } else if (imageId) {
        const image = drawingRels.find((r) => r.id === imageId)
        const bytes = image ? await zip.read(image.path) : null
        if (image && bytes && bytes.length <= 8 * 1024 * 1024) {
          const mime = /\.png$/i.test(image.path)
            ? 'image/png'
            : /\.gif$/i.test(image.path)
              ? 'image/gif'
              : /\.jpe?g$/i.test(image.path)
                ? 'image/jpeg'
                : undefined
          if (mime) {
            let binary = ''
            for (const b of bytes) binary += String.fromCharCode(b)
            visual.image = `data:${mime};base64,${btoa(binary)}`
          }
        }
        visual.kind = 'image'
      } else {
        visual.shapePreview = shapePreviews.get(match.index) ?? { unsupported: true }
        visual.shapeType = visual.shapePreview.element?.presetGeometry
        visual.fillColor = xlsxAttribute(
          /<(?:\w+:)?solidFill>\s*<(?:\w+:)?srgbClr\b[^>]*>/.exec(block)?.[0]?.split('>').at(-2) ??
            '',
          'val',
        )
        visual.text = [...block.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
          .map((m) => decodeXlsxXml(m[1]!))
          .join('\n')
        const model = visual.shapePreview.element
        if (model?.text)
          visual.text = model.text.paragraphs
            .map((p) => p.runs.map((r) => r.text).join(''))
            .join('\n')
      }
      visuals.push(visual)
    }
  }
  return { visuals, tables, pivots }
}
