import { XlsxVisualProperties } from './XlsxVisualProperties.js'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChartColumn, X } from 'lucide-react'
import type { XlsxSheet } from '../xlsx.js'
import {
  ToolbarButton,
  ToolbarConfirm,
  ToolbarFileButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTabs,
  ToolbarTextField,
  ToolbarTextArea,
  ToolbarColorPicker,
  ToolbarNumberField,
} from '../shell/EditorShell.js'
import { XLSX_COLORS } from './XlsxFormatControls.js'
export function XlsxObjectControls({
  sheet,
  range,
  busy,
  selectedId,
  onSelect,
  onOperation,
  onImage,
}: {
  sheet: XlsxSheet
  range: string
  busy: boolean
  selectedId: string
  onSelect: (id: string) => void
  onOperation: (op: Record<string, unknown>) => Promise<boolean>
  onImage?: (file: File, anchor: string) => Promise<boolean>
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLElement>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const close = () => setContainer(null)
  useEffect(() => {
    if (!container) return
    container.classList.add('mimir-xlsx-inspector-host')
    const currentPanel = panel.current,
      currentTrigger = trigger.current
    currentPanel?.focus()
    return () => {
      container.classList.remove('mimir-xlsx-inspector-host')
      const active = document.activeElement
      if (active === document.body || active === currentPanel || currentPanel?.contains(active))
        currentTrigger?.focus()
    }
  }, [container])
  const [mode, setMode] = useState('chart'),
    [kind, setKind] = useState('column'),
    [anchor, setAnchor] = useState(''),
    [title, setTitle] = useState(''),
    [shape, setShape] = useState('rect'),
    [fill, setFill] = useState('#4472C4'),
    [text, setText] = useState(''),
    [url, setUrl] = useState(''),
    [tableName, setTableName] = useState(''),
    [tableStyle, setTableStyle] = useState('TableStyleMedium2'),
    [bandedRows, setBandedRows] = useState('yes'),
    [feedback, setFeedback] = useState('')
  const [tableAction, setTableAction] = useState('add_table_row'),
    [position, setPosition] = useState(1),
    [count, setCount] = useState(1),
    [columnName, setColumnName] = useState(''),
    [rowFields, setRowFields] = useState(''),
    [columnField, setColumnField] = useState(''),
    [valueField, setValueField] = useState(''),
    [aggregation, setAggregation] = useState('sum'),
    [pivotTarget, setPivotTarget] = useState(''),
    [pivotName, setPivotName] = useState('')
  const visual = sheet.visuals?.find((v) => v.id === selectedId),
    [selectedTable, setSelectedTable] = useState('')
  const apply = async (op: Record<string, unknown>) => {
    setFeedback('')
    const ok = await onOperation(op)
    if (ok) {
      setFeedback('已应用')
    } else setFeedback('未应用，请查看编辑器错误说明')
    return ok
  }
  return (
    <>
      <ToolbarButton
        ref={trigger}
        label="图表、形状与结构化表"
        active={!!container}
        onClick={() => {
          if (container) close()
          else {
            setMode(selectedId ? 'edit' : 'chart')
            setContainer(
              trigger.current
                ?.closest('.mimir-editor')
                ?.querySelector<HTMLElement>('.mimir-editor__body') ?? null,
            )
          }
        }}
      >
        <ChartColumn size={16} />
      </ToolbarButton>
      {container &&
        createPortal(
          <aside
            className="mimir-xlsx-inspector"
            aria-label="工作表对象与表格"
            ref={panel}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !event.defaultPrevented) {
                event.stopPropagation()
                close()
              }
            }}
          >
            <header className="mimir-xlsx-inspector__header">
              <h2>对象与表格</h2>
              <ToolbarButton label="关闭工作表对象面板" onClick={close}>
                <X size={16} />
              </ToolbarButton>
            </header>
            <div className="mimir-xlsx-inspector__content">
              <ToolbarPropertyForm columns={1}>
                <div className="mimir-xlsx-tools">
                  <ToolbarTabs
                    label="插入对象类型"
                    value={mode}
                    onChange={setMode}
                    items={[
                      { value: 'chart', label: '图表' },
                      { value: 'shape', label: '形状' },
                      { value: 'image', label: '图片' },
                      { value: 'table', label: '表格' },
                      { value: 'pivot', label: '透视' },
                      { value: 'edit', label: '管理' },
                    ]}
                  />
                  <fieldset disabled={busy}>
                    {mode !== 'edit' && (
                      <ToolbarMenuNote>当前数据范围：{range || '未选择'}</ToolbarMenuNote>
                    )}
                    {['chart', 'shape', 'image'].includes(mode) && (
                      <ToolbarMenuFields label="位置">
                        <ToolbarTextField
                          label="左上角单元格"
                          value={anchor}
                          onChange={(s) => setAnchor(s.toUpperCase())}
                          placeholder="E2"
                        />
                        {mode === 'chart' && (
                          <ToolbarMenuNote>图表留空则放在数据右侧</ToolbarMenuNote>
                        )}
                      </ToolbarMenuFields>
                    )}
                    {mode === 'chart' && (
                      <ToolbarMenuFields label="从范围创建图表">
                        <ToolbarSelect
                          label="图表类型"
                          value={kind}
                          onChange={setKind}
                          options={[
                            ['column', '柱形图'],
                            ['bar', '条形图'],
                            ['line', '折线图'],
                            ['area', '面积图'],
                            ['pie', '饼图'],
                            ['doughnut', '圆环图'],
                            ['scatter', '散点图'],
                            ['radar', '雷达图'],
                            ['combo', '组合图'],
                          ].map(([value, label]) => ({ value: value!, label: label! }))}
                        />
                        <ToolbarTextField
                          label="图表标题（留空自动）"
                          value={title}
                          onChange={setTitle}
                        />
                        <ToolbarButton
                          label="插入范围图表"
                          primary
                          disabled={!range}
                          disabledReason="先选择数据范围"
                          onClick={() =>
                            void apply({
                              op: 'add_chart',
                              dataRange: range,
                              chartType: kind,
                              ...(title ? { title } : {}),
                              ...(anchor ? { anchorCell: anchor } : {}),
                            })
                          }
                        />
                      </ToolbarMenuFields>
                    )}
                    {mode === 'shape' && (
                      <ToolbarMenuFields label="形状与文字">
                        <ToolbarSelect
                          label="形状类型"
                          value={shape}
                          onChange={setShape}
                          options={[
                            ['rect', '矩形'],
                            ['roundRect', '圆角矩形'],
                            ['ellipse', '椭圆'],
                            ['triangle', '三角形'],
                            ['diamond', '菱形'],
                            ['textbox', '文本框'],
                          ].map(([value, label]) => ({ value: value!, label: label! }))}
                        />
                        <ToolbarTextArea label="形状文字" value={text} onChange={setText} />
                        <ToolbarColorPicker
                          label="形状填充"
                          value={fill}
                          options={XLSX_COLORS}
                          onPick={setFill}
                        />
                        <ToolbarButton
                          label="插入形状"
                          primary
                          disabled={!anchor}
                          disabledReason="填写对象左上角"
                          onClick={() =>
                            void apply({
                              op: 'add_shape',
                              shapeType: shape,
                              anchorCell: anchor,
                              text,
                              fillColor: fill,
                            })
                          }
                        />
                      </ToolbarMenuFields>
                    )}
                    {mode === 'image' && (
                      <ToolbarMenuFields label="插入图片">
                        <ToolbarFileButton
                          label="从设备选择图片"
                          accept="image/png,image/jpeg"
                          disabled={busy || !anchor || !onImage}
                          onPick={async (file) => {
                            setFeedback('')
                            if (
                              file.size > 8 * 1024 * 1024 ||
                              !['image/png', 'image/jpeg'].includes(file.type)
                            ) {
                              setFeedback('请选择不超过8MiB的PNG或JPEG图片')
                              return
                            }
                            const ok = await onImage?.(file, anchor)
                            setFeedback(ok ? '已应用' : '未插入，请查看编辑器错误说明')
                          }}
                        />
                        <ToolbarMenuNote>
                          支持PNG/JPEG，最大8MiB；先填写对象左上角。
                        </ToolbarMenuNote>
                        <ToolbarTextField
                          label="公开图片网址（PNG/JPEG/GIF）"
                          value={url}
                          onChange={setUrl}
                          placeholder="https://…"
                        />
                        <ToolbarButton
                          label="插入工作表图片"
                          primary
                          disabled={!anchor || !/^https?:\/\//i.test(url)}
                          disabledReason="填写图片网址与对象左上角"
                          onClick={() =>
                            void apply({ op: 'add_image', path: url, anchorCell: anchor })
                          }
                        />
                      </ToolbarMenuFields>
                    )}
                    {mode === 'table' && (
                      <ToolbarMenuFields label="结构化表">
                        <ToolbarMenuNote>
                          第一行为非空且唯一的标题，数据区域将作为原生 Excel 表格保存。
                        </ToolbarMenuNote>
                        <ToolbarTextField
                          label="表格名称（留空自动）"
                          value={tableName}
                          onChange={setTableName}
                        />
                        <ToolbarSelect
                          label="表格样式"
                          value={tableStyle}
                          onChange={setTableStyle}
                          options={[
                            ...Array.from({ length: 21 }, (_, i) => ({
                              value: `TableStyleLight${i + 1}`,
                              label: `浅色 ${i + 1}`,
                            })),
                            ...Array.from({ length: 28 }, (_, i) => ({
                              value: `TableStyleMedium${i + 1}`,
                              label: `中等 ${i + 1}`,
                            })),
                            ...Array.from({ length: 11 }, (_, i) => ({
                              value: `TableStyleDark${i + 1}`,
                              label: `深色 ${i + 1}`,
                            })),
                          ]}
                        />
                        <ToolbarSelect
                          label="表格隔行底色"
                          value={bandedRows}
                          onChange={setBandedRows}
                          options={[
                            { value: 'yes', label: '显示' },
                            { value: 'no', label: '隐藏' },
                          ]}
                        />
                        <ToolbarButton
                          label="插入结构化表"
                          primary
                          disabled={!range}
                          disabledReason="先选中标题与数据范围"
                          onClick={() =>
                            void apply({
                              op: 'add_table',
                              range,
                              style: tableStyle,
                              bandedRows: bandedRows === 'yes',
                              ...(tableName ? { name: tableName } : {}),
                            })
                          }
                        />
                      </ToolbarMenuFields>
                    )}
                    {mode === 'pivot' && (
                      <ToolbarMenuFields label="数据透视表">
                        <ToolbarMenuNote>
                          当前{sheet.pivots?.length ?? 0}
                          张透视表。第一行须为字段标题；按当前数值或公式缓存汇总。
                        </ToolbarMenuNote>
                        <ToolbarTextField
                          label="透视名称（留空自动）"
                          value={pivotName}
                          onChange={setPivotName}
                        />
                        <ToolbarTextField
                          label="输出左上角（空白区域，如I1）"
                          value={pivotTarget}
                          onChange={(v) => setPivotTarget(v.toUpperCase())}
                        />
                        <ToolbarTextField
                          label="行字段（多个字段用逗号分隔）"
                          value={rowFields}
                          onChange={setRowFields}
                          placeholder="区域,部门"
                        />
                        <ToolbarTextField
                          label="列字段（可选，多个用逗号分隔）"
                          value={columnField}
                          onChange={setColumnField}
                          placeholder="季度"
                        />
                        <ToolbarTextField
                          label="值字段"
                          value={valueField}
                          onChange={setValueField}
                          placeholder="销售额"
                        />
                        <ToolbarSelect
                          label="汇总方式"
                          value={aggregation}
                          onChange={setAggregation}
                          options={[
                            ['sum', '求和'],
                            ['count', '计数'],
                            ['average', '平均值'],
                            ['max', '最大值'],
                            ['min', '最小值'],
                          ].map(([value, label]) => ({ value: value!, label: label! }))}
                        />
                        <ToolbarButton
                          label="创建数据透视表"
                          primary
                          disabled={
                            !range || !pivotTarget || !rowFields.trim() || !valueField.trim()
                          }
                          disabledReason="选择源范围并填写输出位置、行字段和值字段"
                          onClick={() =>
                            void apply({
                              op: 'add_pivot',
                              sourceRange: range,
                              targetCell: pivotTarget,
                              rowFields: rowFields
                                .split(/[,，]/)
                                .map((s) => s.trim())
                                .filter(Boolean),
                              ...(columnField.trim()
                                ? {
                                    columnField: columnField
                                      .split(/[,，]/)
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  }
                                : {}),
                              values: [{ field: valueField.trim(), agg: aggregation }],
                              ...(pivotName ? { name: pivotName } : {}),
                            })
                          }
                        />
                        <ToolbarButton
                          label="刷新当前表全部透视表"
                          disabled={!sheet.pivots?.length}
                          disabledReason="当前表没有透视表"
                          onClick={() => void apply({ op: 'refresh_pivot' })}
                        >
                          刷新透视表
                        </ToolbarButton>
                        {sheet.pivots?.map((p) => (
                          <ToolbarMenuNote key={p.path}>
                            {p.name} · {p.definition.outputRef} ← {p.definition.sourceSheet}!
                            {p.definition.sourceRef}
                          </ToolbarMenuNote>
                        ))}
                      </ToolbarMenuFields>
                    )}
                    {mode === 'edit' && (
                      <>
                        <ToolbarMenuFields label="工作表对象">
                          <ToolbarSelect
                            label="当前对象"
                            value={selectedId}
                            onChange={(id) => {
                              onSelect(id)
                            }}
                            options={(sheet.visuals ?? []).map((v) => ({
                              value: v.id,
                              label: v.name,
                            }))}
                          />
                          {visual && (
                            <XlsxVisualProperties
                              key={visual.id + visual.name + visual.text + visual.fillColor}
                              visual={visual}
                              onApply={apply}
                            />
                          )}
                          <ToolbarConfirm
                            title="删除所选对象？"
                            description="移除图表、形状或图片，单元格数据保留。保存前可通过重新打开原件放弃变更。"
                            confirmLabel="删除对象"
                            onConfirm={() =>
                              visual && void apply({ op: 'delete_visual', visualId: visual.id })
                            }
                          >
                            <ToolbarButton
                              label="删除工作表对象"
                              disabled={!visual}
                              disabledReason="先选择对象"
                            >
                              删除对象
                            </ToolbarButton>
                          </ToolbarConfirm>
                        </ToolbarMenuFields>
                        <ToolbarMenuFields label="已有结构化表">
                          <ToolbarSelect
                            label="结构化表名称"
                            value={selectedTable}
                            onChange={setSelectedTable}
                            options={(sheet.tables ?? []).map((t) => ({
                              value: t.name,
                              label: `${t.name} · ${t.range}`,
                            }))}
                          />
                          <ToolbarSelect
                            label="表格结构操作"
                            value={tableAction}
                            onChange={setTableAction}
                            options={[
                              { value: 'add_table_row', label: '插入数据行' },
                              { value: 'delete_table_row', label: '删除数据行' },
                              { value: 'add_table_column', label: '插入表格列' },
                              { value: 'delete_table_column', label: '删除表格列' },
                            ]}
                          />
                          <ToolbarNumberField
                            label={
                              tableAction.endsWith('_row')
                                ? '数据区相对行号（1开始）'
                                : '表格内相对列号（1开始）'
                            }
                            value={position}
                            min={1}
                            max={1000}
                            onCommit={setPosition}
                          />
                          <ToolbarNumberField
                            label="行列数量"
                            value={count}
                            min={1}
                            max={tableAction.endsWith('_row') ? 1000 : 100}
                            onCommit={setCount}
                          />
                          {tableAction === 'add_table_column' && (
                            <ToolbarTextField
                              label="新增列名称"
                              value={columnName}
                              onChange={setColumnName}
                            />
                          )}
                          <ToolbarMenuNote>
                            与 Excel
                            一致，插入或删除会移动整行或整列及关联对象；表格保留至少一行数据和一列。
                          </ToolbarMenuNote>
                          <ToolbarConfirm
                            title="应用表格结构调整？"
                            description="影响所在整行或整列。保存前可重新打开原件放弃变更。"
                            confirmLabel="应用调整"
                            onConfirm={() =>
                              void apply({
                                op: tableAction,
                                tableName: selectedTable,
                                count,
                                ...(tableAction.endsWith('_row')
                                  ? { row: position }
                                  : { column: position }),
                                ...(tableAction === 'add_table_column' ? { columnName } : {}),
                              })
                            }
                          >
                            <ToolbarButton
                              label="应用表格结构调整"
                              disabled={
                                !selectedTable ||
                                (tableAction === 'add_table_column' && !columnName.trim())
                              }
                              disabledReason="选择结构化表并填写所需参数"
                            >
                              应用结构调整
                            </ToolbarButton>
                          </ToolbarConfirm>
                          <ToolbarConfirm
                            title="将表格转换为普通区域？"
                            description="移除结构化表定义，单元格内容和显式格式保留。引用此表的公式必须先修改。"
                            confirmLabel="转换为区域"
                            onConfirm={() =>
                              void apply({ op: 'delete_table', tableName: selectedTable })
                            }
                          >
                            <ToolbarButton
                              label="转换结构化表为区域"
                              disabled={!selectedTable}
                              disabledReason="先选择结构化表"
                            >
                              转换为普通区域
                            </ToolbarButton>
                          </ToolbarConfirm>
                        </ToolbarMenuFields>
                      </>
                    )}
                  </fieldset>
                  <div className="mimir-xlsx-tools__feedback" role="status">
                    {busy ? '正在应用…' : feedback}
                  </div>
                </div>
              </ToolbarPropertyForm>
            </div>
          </aside>,
          container,
        )}
    </>
  )
}
