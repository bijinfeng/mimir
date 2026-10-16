import { useState } from 'react'
import { latexToOmml, ommlToMathML } from '../../vendor/packages/docx-engine/src/math.js'
import {
  layoutShapes,
  type SmartArtLayout,
} from '../../vendor/packages/pptx-engine/src/smartart-layout.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import { WORDART_PRESETS, wordArtStrokePx } from '../shims/ui.js'
import {
  PptxControlPanel,
  usePptxAction,
  type PptxApply,
  type PptxTarget,
} from './PptxControlPanel.js'

const formulas = [
  { value: 'E = mc^2', label: '质能方程' },
  { value: '\\frac{a}{b}', label: '分式' },
  { value: '\\sqrt{x^2 + y^2}', label: '根式' },
  { value: '\\sum_{i=1}^{n} x_i', label: '求和' },
  { value: '\\int_{a}^{b} f(x) dx', label: '积分' },
]
type InsertProps = { slide: number; width: number; height: number; apply: PptxApply }
export function PptxEquationControls({
  slide,
  width,
  height,
  target,
  apply,
}: InsertProps & { target: PptxTarget | null }) {
  const { busy, run } = usePptxAction(apply)
  const [latex, setLatex] = useState(formulas[0]!.value)
  const [destination, setDestination] = useState('new')
  let preview = '',
    error = ''
  try {
    if (latex.trim())
      preview = ommlToMathML(
        `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${latexToOmml(latex)}</m:oMath>`,
      )
  } catch {
    error = '公式语法暂不支持。可使用分式、根式、上下标、求和、积分和希腊字母。'
  }
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="公式">
        <ToolbarSelect
          label="公式模板"
          value={formulas.some((item) => item.value === latex) ? latex : 'custom'}
          options={[...formulas, { value: 'custom', label: '自定义公式' }]}
          onChange={(value) => {
            if (value !== 'custom') setLatex(value)
          }}
        />
        <ToolbarTextArea label="公式内容（LaTeX）" value={latex} onChange={setLatex} rows={3} />
        {preview && (
          <div
            className="mimir-pptx-equation-preview"
            aria-label="公式预览"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        )}
        {error && <ToolbarMenuNote>{error}</ToolbarMenuNote>}
        <ToolbarSelect
          label="插入位置"
          value={destination}
          options={[
            { value: 'new', label: '新建公式文本框' },
            ...(target ? [{ value: 'selected', label: '追加到所选文本框' }] : []),
          ]}
          onChange={setDestination}
        />
        <ToolbarMenuNote>
          公式保存在原生 Office 数学结构中。画布以线性文本显示，PowerPoint 中显示排版公式。
        </ToolbarMenuNote>
      </ToolbarMenuFields>
      <ToolbarButton
        primary
        label="插入公式"
        disabled={!latex.trim() || !!error || latex.length > 4000}
        disabledReason={error || '请输入不超过4000字的公式'}
        onClick={() =>
          void run({
            op: 'insertEquation',
            latex,
            position: 'end',
            ...(destination === 'selected' && target
              ? { target }
              : {
                  target: { slide },
                  box: {
                    x: Math.round(width * 0.15),
                    y: Math.round(height * 0.35),
                    cx: Math.round(width * 0.7),
                    cy: Math.round(height * 0.2),
                  },
                }),
          })
        }
      />
    </PptxControlPanel>
  )
}

const layouts: { value: SmartArtLayout; label: string }[] = [
  { value: 'list', label: '列表' },
  { value: 'process', label: '流程' },
  { value: 'cycle', label: '循环' },
  { value: 'hierarchy', label: '层级' },
  { value: 'pyramid', label: '金字塔' },
  { value: 'matrix', label: '矩阵' },
  { value: 'venn', label: '关系' },
]
const artNames = [
  '蓝色',
  '金色',
  '红色',
  '紫色',
  '绿色斜体',
  '白字橙边',
  '白字红边',
  '金字棕边',
  '蓝字深蓝边',
  '深蓝白边',
  '黑字金边',
  '银字灰边',
]
export function PptxWordArtControls({ slide, width, height, apply }: InsertProps) {
  const { busy, run } = usePptxAction(apply)
  const [text, setText] = useState('艺术字')
  const [presetId, setPresetId] = useState('blue')
  const preset = WORDART_PRESETS.find((item) => item.id === presetId)!
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="艺术字">
        <ToolbarTextField label="艺术字文字" value={text} onChange={setText} />
        <ToolbarSelect
          label="艺术字样式"
          value={presetId}
          options={WORDART_PRESETS.map((item, index) => ({
            value: item.id,
            label: artNames[index]!,
          }))}
          onChange={setPresetId}
        />
        <svg
          className="mimir-pptx-diagram-preview"
          viewBox="0 0 300 80"
          role="img"
          aria-label="艺术字预览"
        >
          <text
            x="150"
            y="50"
            textAnchor="middle"
            fontSize="32"
            fontWeight={preset.bold ? '700' : '400'}
            fontStyle={preset.italic ? 'italic' : 'normal'}
            fill={preset.fill}
            stroke={preset.outline?.color}
            strokeWidth={preset.outline ? wordArtStrokePx(preset.outline.widthEmu) : 0}
            paintOrder="stroke fill"
          >
            {text.slice(0, 12)}
          </text>
        </svg>
        <ToolbarMenuNote>
          插入可编辑文字，保留填充与描边。文字超过12字时，预览显示开头；完整内容仍会插入。
        </ToolbarMenuNote>
      </ToolbarMenuFields>
      <ToolbarButton
        primary
        label="插入艺术字"
        disabled={!text.trim() || text.length > 500}
        disabledReason="请输入1–500字的文字"
        onClick={() =>
          void run({
            op: 'addElement',
            target: { slide },
            kind: 'textbox',
            offset: {
              x: Math.round(width * 0.15),
              y: Math.round(height * 0.35),
              cx: Math.round(width * 0.7),
              cy: Math.round(height * 0.25),
            },
            bodyPr: { autoFit: 'shrink' },
            paragraphs: [
              {
                align: 'center',
                runs: [
                  {
                    text,
                    fontSize: 44,
                    bold: preset.bold,
                    italic: preset.italic,
                    color: preset.fill,
                    ...(preset.outline ? { outline: preset.outline } : {}),
                  },
                ],
              },
            ],
          })
        }
      />
    </PptxControlPanel>
  )
}
export function PptxFieldControls({ slide, width, height, apply }: InsertProps) {
  const { busy, run } = usePptxAction(apply)
  const [kind, setKind] = useState('slidenum')
  const [date] = useState(() => new Date().toLocaleDateString('zh-CN'))
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="动态字段">
        <ToolbarSelect
          label="字段类型"
          value={kind}
          options={[
            { value: 'slidenum', label: '幻灯片页码' },
            { value: 'datetime1', label: '日期' },
          ]}
          onChange={setKind}
        />
        <ToolbarMenuNote>
          当前显示
          {kind === 'slidenum' ? `第${slide + 1}页` : date}
          。字段保存为原生动态字段，在 PowerPoint 打开时自动刷新。
        </ToolbarMenuNote>
      </ToolbarMenuFields>
      <ToolbarButton
        primary
        label="插入动态字段"
        onClick={() =>
          void run({
            op: 'addElement',
            target: { slide },
            kind: 'textbox',
            offset: {
              x: Math.round(width * 0.35),
              y: Math.round(height * 0.45),
              cx: Math.round(width * 0.3),
              cy: Math.round(height * 0.1),
            },
            paragraphs: [
              {
                align: 'center',
                runs: [
                  {
                    text: kind === 'slidenum' ? String(slide + 1) : date,
                    fontSize: 18,
                    field: kind,
                  },
                ],
              },
            ],
          })
        }
      />
    </PptxControlPanel>
  )
}
export function PptxDiagramControls({ slide, width, height, apply }: InsertProps) {
  const { busy, run } = usePptxAction(apply)
  const [layout, setLayout] = useState<SmartArtLayout>('process')
  const [text, setText] = useState('发现问题\n制定计划\n执行改进')
  const items = text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
  const limit = layout === 'venn' ? 4 : 8
  const shapes = layoutShapes(layout, items.slice(0, limit), 300, 180)
  return (
    <PptxControlPanel busy={busy}>
      <ToolbarMenuFields label="图示布局">
        <ToolbarSelect
          label="图示类型"
          value={layout}
          options={layouts}
          onChange={(value) => setLayout(value as SmartArtLayout)}
        />
        <svg
          className="mimir-pptx-diagram-preview"
          viewBox="-5 -5 310 190"
          role="img"
          aria-label="图示预览"
        >
          {shapes.map((shape) => (
            <g key={`${shape.prst}:${shape.box.x}:${shape.box.y}`}>
              {shape.prst === 'ellipse' ? (
                <ellipse
                  cx={shape.box.x + shape.box.cx / 2}
                  cy={shape.box.y + shape.box.cy / 2}
                  rx={shape.box.cx / 2}
                  ry={shape.box.cy / 2}
                  fill={`#${shape.color}`}
                  opacity={shape.alpha}
                />
              ) : (
                <rect
                  x={shape.box.x}
                  y={shape.box.y}
                  width={shape.box.cx}
                  height={shape.box.cy}
                  rx={shape.prst === 'roundRect' ? 5 : 0}
                  fill={`#${shape.color}`}
                />
              )}
              {shape.text && (
                <text
                  x={shape.box.x + shape.box.cx / 2}
                  y={shape.box.y + shape.box.cy / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize="9"
                >
                  {shape.text.length > 9 ? `${shape.text.slice(0, 8)}…` : shape.text}
                </text>
              )}
            </g>
          ))}
        </svg>
        <ToolbarTextArea label="节点文字（每行一个）" value={text} onChange={setText} rows={5} />
        <ToolbarMenuNote>
          {items.length} 个节点，当前布局最多 {limit}{' '}
          个。插入后为可编辑形状组合，可取消组合后逐个调整。
        </ToolbarMenuNote>
      </ToolbarMenuFields>
      <ToolbarButton
        primary
        label="插入图示"
        disabled={!items.length || items.length > limit || items.some((item) => item.length > 300)}
        disabledReason={`请填写1–${limit}个节点，每个节点不超过300字`}
        onClick={() =>
          void run({
            op: 'addSmartArt',
            target: { slide },
            layout,
            items,
            offset: {
              x: Math.round(width * 0.12),
              y: Math.round(height * 0.2),
              cx: Math.round(width * 0.76),
              cy: Math.round(height * 0.6),
            },
          })
        }
      />
    </PptxControlPanel>
  )
}
