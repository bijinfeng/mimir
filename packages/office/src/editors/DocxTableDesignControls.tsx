import { useEffect, useState } from 'react'
import type { StyleInfo, TableLook } from '../../vendor/packages/docx-engine/src/types.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
import { liveDocxStyleState } from '../docx-styles.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import {
  applyDocxTableDesign,
  selectedDocxTable,
  tableDesignDraft,
  tableBorderCurrent,
  tablePositionContext,
  TABLE_TWIPS_PER_CM,
  TABLE_PRESETS,
  type BorderMode,
  type TableBorderDraft,
} from './docx-table-design.js'
import { docxTablePositionIssue } from '../docx-table-save.js'
import './docx-table-design.css'

const LOOK_LABELS: [keyof TableLook, string][] = [
  ['firstRow', '标题行'],
  ['lastRow', '汇总行'],
  ['firstColumn', '第一列'],
  ['lastColumn', '最后一列'],
  ['bandedRows', '条纹行'],
  ['bandedColumns', '条纹列'],
]
const BORDER_LABELS: [BorderMode, string][] = [
  ['all', '全部框线'],
  ['none', '无框线'],
  ['outside', '外侧框线'],
  ['inside', '内部框线'],
  ['insideH', '内部横线'],
  ['insideV', '内部竖线'],
  ['top', '上框线'],
  ['bottom', '下框线'],
  ['left', '左框线'],
  ['right', '右框线'],
]
export function DocxTableDesignControls({ context }: { context: DocxAdvancedContext }) {
  const [target, setTarget] = useState(() => selectedDocxTable(context.editor))
  const [draft, setDraft] = useState(() => (target ? tableDesignDraft(target) : null))
  const [preset, setPreset] = useState<string | null>(null)
  const [styles, setStyles] = useState<StyleInfo[]>(() =>
    [...context.session.footnotes.parsed.styles.values()].filter((s) => s.type === 'table'),
  )
  const [border, setBorder] = useState<TableBorderDraft | null>(null)
  const borderCurrent = target ? tableBorderCurrent(target) : { line: null, mixed: false }
  const current = borderCurrent.line
  const [scope, setScope] = useState<'table' | 'selection'>('selection')
  const [lineStyle, setLineStyle] = useState(current?.style ?? 'single')
  const [lineWidth, setLineWidth] = useState((current?.szEighths ?? 4) / 8)
  const [lineColor, setLineColor] = useState(current?.color ?? 'auto')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [stale, setStale] = useState(false)
  const [optionsIdentity] = useState(() => JSON.stringify(context.options))
  useEffect(() => {
    let active = true
    liveDocxStyleState(context.session, context.options)
      .then((parsed) => {
        if (active) setStyles([...parsed.styles.values()].filter((s) => s.type === 'table'))
      })
      .catch((cause) => {
        if (active) setError(`样式读取失败：${String(cause)}`)
      })
    return () => {
      active = false
    }
  }, [context.session, context.options])
  useEffect(() => {
    const check = () => {
      if (
        target &&
        (context.editor.state.doc !== target.doc ||
          selectedDocxTable(context.editor)?.pos !== target.pos)
      )
        setStale(true)
    }
    context.editor.on('transaction', check)
    return () => {
      context.editor.off('transaction', check)
    }
  }, [context.editor, target])
  if (!target || !draft)
    return <ToolbarMenuNote>请将光标放在表格内，再打开表格设计。</ToolbarMenuNote>
  const original = tableDesignDraft(target)
  const sourceXml = context.session.blocks.find(
    (block) => block.docxIndex === target.node.attrs.docxIndex,
  )?.originalXml
  const positionContext = tablePositionContext(target, context.sections, sourceXml ?? undefined)
  const positionIssue = sourceXml
    ? docxTablePositionIssue(sourceXml)
    : target.node.attrs.docxIndex != null
      ? '无法确认原件表格定位，请重新打开文档'
      : null
  const position = draft.position
  const anchors: Record<string, string> = { page: '页面', margin: '页边距', text: '正文' }
  const keywords: Record<string, string> = {
    left: '左侧',
    center: '居中',
    right: '右侧',
    inside: '内侧',
    outside: '外侧',
    top: '顶部',
    bottom: '底部',
  }
  const updatePosition = (patch: Partial<typeof position>) => {
    setDraft({ ...draft, position: { ...position, ...patch } })
    setStatus('')
  }
  const dirty =
    preset !== null || border !== null || JSON.stringify(draft) !== JSON.stringify(original)
  const optionsChanged = JSON.stringify(context.options) !== optionsIdentity
  const locked = stale || optionsChanged || context.editor.isDestroyed
  const preview = TABLE_PRESETS.find((item) => item.id === preset)
  const submit = () => {
    try {
      if (optionsChanged) throw new Error('文档附加结构已变化，请重新打开面板')
      const next = applyDocxTableDesign(
        context.editor,
        target,
        draft,
        preset,
        border
          ? {
              ...border,
              scope,
              line: {
                style: lineStyle,
                szEighths: Math.round(lineWidth * 8),
                color: lineColor.trim().replace(/^#/, ''),
              },
            }
          : null,
        positionContext,
      )
      setTarget(next)
      setDraft(tableDesignDraft(next))
      setPreset(null)
      setBorder(null)
      setStale(false)
      setError('')
      setStatus('已应用表格设计')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return (
    <div className="mimir-docx-table-design">
      <div className="mimir-docx-table-design__scroll">
        <fieldset disabled={locked} className="mimir-docx-table-design__fields">
          <ToolbarPropertyForm>
            <ToolbarMenuFields label="表格样式">
              <ToolbarSelect
                disabled={locked}
                label="文档表格样式"
                value={draft.styleId}
                options={[
                  { value: '', label: '无样式（保留直接格式）' },
                  ...styles.map((s) => ({ value: s.styleId, label: s.name })),
                ]}
                onChange={(styleId) => {
                  setDraft({ ...draft, styleId })
                  setPreset(null)
                  setStatus('')
                }}
              />
              <ToolbarSelect
                disabled={locked}
                label="快速表格预设"
                value={preset ?? ''}
                options={[
                  { value: '', label: '保留当前格式' },
                  ...TABLE_PRESETS.map((p) => ({ value: p.id, label: p.name })),
                ]}
                onChange={(value) => {
                  setPreset(value || null)
                  setStatus('')
                }}
              />
              {preview && (
                <figure className="mimir-docx-table-design__preview">
                  <table aria-label={`${preview.name}效果预览`}>
                    <tbody>
                      {[0, 1, 2].map((ri) => (
                        <tr key={ri}>
                          {[0, 1, 2].map((ci) => (
                            <td
                              key={ci}
                              style={{
                                backgroundColor: `#${(ri === 0 ? preview.header : ri % 2 ? preview.band1 : preview.band2) ?? 'FFFFFF'}`,
                                borderColor: `#${preview.border}`,
                              }}
                            >
                              {ri === 0 ? '标题' : '内容'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <figcaption>预设替换整表底纹与边框</figcaption>
                </figure>
              )}
            </ToolbarMenuFields>
            <ToolbarMenuFields label="样式选项">
              <div className="mimir-docx-table-design__look-grid">
                {LOOK_LABELS.map(([key, label]) => (
                  <ToolbarButton
                    key={key}
                    label={`表格${label}`}
                    active={draft.look[key]}
                    onClick={() => {
                      setDraft({ ...draft, look: { ...draft.look, [key]: !draft.look[key] } })
                      setStatus('')
                    }}
                  >
                    {label}
                  </ToolbarButton>
                ))}
              </div>
              <ToolbarMenuNote>
                选项控制文档表格样式中的条件格式。未定义相应格式时，外观不变；直接底纹优先。
              </ToolbarMenuNote>
            </ToolbarMenuFields>
            <ToolbarMenuFields label="边框">
              <ToolbarSelect
                disabled={locked}
                label="边框应用范围"
                value={scope}
                options={[
                  { value: 'selection', label: `所选 ${target.selectedCells.length} 个单元格` },
                  { value: 'table', label: '整张表格' },
                ]}
                onChange={setScope}
              />
              <ToolbarSelect
                disabled={locked}
                label="边框线型"
                value={lineStyle}
                options={['single', 'double', 'dotted', 'dashed', 'dashDotStroked', 'thick'].map(
                  (value, i) => ({
                    value,
                    label: ['实线', '双线', '点线', '虚线', '点划线', '粗实线'][i]!,
                  }),
                )}
                onChange={setLineStyle}
              />
              <ToolbarNumberField
                label="边框线宽（磅）"
                value={lineWidth}
                min={0.25}
                max={12}
                step={0.25}
                onCommit={setLineWidth}
              />
              <ToolbarTextField
                label="边框颜色"
                value={lineColor}
                placeholder="auto 或 RRGGBB"
                onChange={setLineColor}
              />
              {borderCurrent.mixed && (
                <ToolbarMenuNote>当前边框为混合值，线型参数将在选定框线时统一。</ToolbarMenuNote>
              )}
              {!current && !borderCurrent.mixed && (
                <ToolbarMenuNote>所选区域未设置直接边框，可能继承表格样式。</ToolbarMenuNote>
              )}
              <div className="mimir-docx-table-design__border-grid">
                {BORDER_LABELS.map(([mode, label]) => (
                  <ToolbarButton
                    key={mode}
                    label={`暂存${label}`}
                    active={border?.mode === mode}
                    onClick={() => {
                      setBorder({
                        scope,
                        mode,
                        line: {
                          style: lineStyle,
                          szEighths: Math.round(lineWidth * 8),
                          color: lineColor.trim().replace(/^#/, ''),
                        },
                      })
                      setStatus('')
                    }}
                  >
                    {label}
                  </ToolbarButton>
                ))}
              </div>
              {border && (
                <ToolbarMenuNote>
                  待应用：{scope === 'table' ? '整表' : '所选单元格'} ·{' '}
                  {BORDER_LABELS.find(([mode]) => mode === border.mode)?.[1]}
                </ToolbarMenuNote>
              )}
            </ToolbarMenuFields>
            <ToolbarMenuFields label="表格布局">
              <ToolbarSelect
                disabled={locked}
                label="表格水平对齐"
                value={draft.align}
                options={[
                  { value: 'left', label: '左对齐' },
                  { value: 'center', label: '居中' },
                  { value: 'right', label: '右对齐' },
                ]}
                onChange={(align) => setDraft({ ...draft, align })}
              />
              <ToolbarSelect
                disabled={locked}
                label="表格自动调整"
                value={draft.autoFit}
                options={[
                  { value: 'fixed', label: '固定列宽' },
                  { value: 'contents', label: '根据内容调整' },
                  { value: 'window', label: '根据窗口调整' },
                ]}
                onChange={(autoFit) => setDraft({ ...draft, autoFit })}
              />
            </ToolbarMenuFields>
            <ToolbarMenuFields label="文字环绕与位置">
              {positionIssue ? (
                <ToolbarMenuNote>{positionIssue}。原件定位将保留。</ToolbarMenuNote>
              ) : (
                <>
                  <ToolbarSelect
                    disabled={locked}
                    label="表格文字环绕"
                    value={position.wrap}
                    options={[
                      { value: 'none', label: '嵌入正文' },
                      { value: 'left', label: '文字在右侧（表格靠左）' },
                      { value: 'right', label: '文字在左侧（表格靠右）' },
                    ]}
                    onChange={(wrap) => updatePosition({ wrap })}
                  />
                  {position.wrap === 'right' &&
                    original.position.wrap !== 'right' &&
                    !position.xEdited && (
                      <ToolbarMenuNote>
                        应用时按当前节的右边缘放置；自填水平位置可覆盖此预设。
                      </ToolbarMenuNote>
                    )}
                  {target.node.attrs.tblFloatSuppressed && position.wrap !== 'none' && (
                    <ToolbarMenuNote>
                      原件使用浮动定位；因表格较高或正文余宽不足，当前按分页流式显示，保留原定位。
                    </ToolbarMenuNote>
                  )}
                  {position.wrap !== 'none' && (
                    <>
                      <ToolbarMenuNote>
                        定位参照：水平
                        {anchors[target.node.attrs.tblFloatHorzAnchor] ??
                          (original.position.wrap === 'none' ? '页边距' : '原件默认')}{' '}
                        · 垂直
                        {anchors[target.node.attrs.tblFloatVertAnchor] ??
                          (original.position.wrap === 'none' ? '页边距' : '正文')}
                        。修改数值将替换该轴对齐。
                      </ToolbarMenuNote>
                      {(['x', 'y'] as const).map((axis) => {
                        const spec = axis === 'x' ? position.xSpec : position.ySpec
                        const label = axis === 'x' ? '水平' : '垂直'
                        return (
                          <div className="mimir-docx-table-design__axis" key={axis}>
                            <ToolbarSelect
                              disabled={locked}
                              label={`表格${label}定位方式`}
                              value={spec ?? 'numeric'}
                              options={[
                                { value: 'numeric', label: '数值位置' },
                                ...(spec
                                  ? [{ value: spec, label: `当前对齐：${keywords[spec] ?? spec}` }]
                                  : []),
                              ]}
                              onChange={() =>
                                updatePosition(
                                  axis === 'x' ? { xSpec: null, xEdited: true } : { ySpec: null },
                                )
                              }
                            />
                            {!spec && (
                              <ToolbarNumberField
                                label={`表格${label}位置（厘米）`}
                                value={Number((position[axis] / TABLE_TWIPS_PER_CM).toFixed(2))}
                                min={-55.88}
                                max={55.88}
                                step={0.1}
                                onCommit={(value) =>
                                  updatePosition(
                                    axis === 'x'
                                      ? {
                                          x: Math.round(value * TABLE_TWIPS_PER_CM),
                                          xSpec: null,
                                          xEdited: true,
                                        }
                                      : { y: Math.round(value * TABLE_TWIPS_PER_CM), ySpec: null },
                                  )
                                }
                              />
                            )}
                          </div>
                        )
                      })}
                      <div className="mimir-docx-table-design__distance">
                        {(['top', 'bottom', 'left', 'right'] as const).map((side, i) => (
                          <ToolbarNumberField
                            key={side}
                            label={`${['上', '下', '左', '右'][i]}距正文（厘米）`}
                            value={Number(
                              (position.distance[side] / TABLE_TWIPS_PER_CM).toFixed(2),
                            )}
                            min={0}
                            max={55.88}
                            step={0.1}
                            onCommit={(value) =>
                              updatePosition({
                                distance: {
                                  ...position.distance,
                                  [side]: Math.round(value * TABLE_TWIPS_PER_CM),
                                },
                              })
                            }
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </ToolbarMenuFields>
            <ToolbarMenuFields label="默认单元格边距">
              {(['top', 'bottom', 'left', 'right'] as const).map((side, i) => (
                <ToolbarNumberField
                  key={side}
                  label={`${['上', '下', '左', '右'][i]}边距（磅）`}
                  value={draft.margins[side] / 20}
                  min={0}
                  max={1584}
                  step={0.5}
                  onCommit={(value) =>
                    setDraft({
                      ...draft,
                      margins: { ...draft.margins, [side]: Math.round(value * 20) },
                    })
                  }
                />
              ))}
              <ToolbarMenuNote>单元格自身的明确边距仍优先于表格默认值。</ToolbarMenuNote>
            </ToolbarMenuFields>
          </ToolbarPropertyForm>
        </fieldset>
      </div>
      <div className="mimir-docx-table-design__actions">
        {(error || stale || optionsChanged) && (
          <p role="alert">
            {stale || optionsChanged ? '文档已变化，请重新选择表格并打开面板。' : error}
          </p>
        )}
        {status && <p role="status">{status}</p>}
        <div className="mimir-docx-table-design__buttons">
          <ToolbarButton
            label="重置表格设计草稿"
            disabled={!dirty || locked}
            onClick={() => {
              setDraft(original)
              setPreset(null)
              setBorder(null)
              setError('')
              setStatus('')
            }}
          >
            重置
          </ToolbarButton>
          <ToolbarButton
            label="应用表格设计"
            primary
            disabled={!dirty || locked}
            disabledReason={stale ? '文档已变化，请重新打开面板' : '请先修改表格属性'}
            onClick={submit}
          />
        </div>
      </div>
    </div>
  )
}
