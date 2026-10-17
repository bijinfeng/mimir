import type { XlsxPivotLayoutEligibility } from '../xlsx-pivot-editability.js'
import { XlsxPivotControls } from './XlsxPivotControls.js'
import { XlsxShapeGallery } from './XlsxShapeGallery.js'
import { XlsxObjectManagement } from './XlsxObjectManagement.js'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChartColumn, X } from 'lucide-react'
import type { XlsxSheet } from '../xlsx.js'
import {
  ToolbarButton,
  ToolbarFileButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTabs,
  ToolbarTextField,
} from '../shell/EditorShell.js'
export function XlsxObjectControls({
  sheet,
  sheets,
  acceptedPivotSignal,
  readPivotLayoutEligibility,
  range,
  busy,
  selectedId,
  onSelect,
  onOperation,
  onImage,
  sourceKey,
  contextKey,
  onPivotOperation,
  inspector,
  onInspectorOpen,
}: {
  sheet: XlsxSheet
  sheets?: readonly XlsxSheet[]
  readPivotLayoutEligibility?: (
    path: string,
    signal: AbortSignal,
  ) => Promise<XlsxPivotLayoutEligibility>
  acceptedPivotSignal?: AbortSignal
  sourceKey: unknown
  contextKey: string
  inspector?: string | null
  onInspectorOpen?: () => void
  onPivotOperation: (
    op: Record<string, unknown>,
    options: { signal: AbortSignal },
  ) => Promise<boolean>
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
  if (container && inspector && inspector !== 'objects') setContainer(null)
  useEffect(() => {
    if (!container) return
    container.classList.add('mimir-xlsx-inspector-host')
    const currentPanel = panel.current,
      currentTrigger = trigger.current,
      triggerGroup = currentTrigger?.closest('[data-section-key]')
    currentPanel?.focus()
    return () => {
      container.classList.remove('mimir-xlsx-inspector-host')
      const active = document.activeElement
      if (active === document.body || active === currentPanel || currentPanel?.contains(active))
        (
          (currentTrigger?.isConnected ? currentTrigger : null) ??
          triggerGroup?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
        )?.focus()
    }
  }, [container])
  const [mode, setMode] = useState('chart'),
    [kind, setKind] = useState('column'),
    [anchor, setAnchor] = useState(''),
    [title, setTitle] = useState(''),
    [url, setUrl] = useState(''),
    [tableName, setTableName] = useState(''),
    [tableStyle, setTableStyle] = useState('TableStyleMedium2'),
    [bandedRows, setBandedRows] = useState('yes'),
    [feedback, setFeedback] = useState('')
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
            onInspectorOpen?.()
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
                // A shell picker or portal-owned Select/confirmation consumes its own layer.
                if (
                  event.target instanceof Element &&
                  event.target.closest('.me-menu__panel, [role="listbox"], [role="tooltip"]')
                )
                  return
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
            <div className="mimir-xlsx-inspector__content" data-mode={mode}>
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
                  {/* Management locks its fields but keeps task navigation available to cancel. */}
                  <fieldset disabled={busy && mode !== 'edit'}>
                    {!['pivot', 'shape', 'edit'].includes(mode) && (
                      <ToolbarMenuNote>当前数据范围：{range || '未选择'}</ToolbarMenuNote>
                    )}
                    {['chart', 'image'].includes(mode) && (
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
                      <XlsxShapeGallery
                        range={range}
                        sourceKey={sourceKey}
                        contextKey={contextKey}
                        busy={busy}
                        onOperation={onPivotOperation}
                      />
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
                      <XlsxPivotControls
                        sheets={sheets}
                        readLayoutEligibility={readPivotLayoutEligibility}
                        acceptedSignal={acceptedPivotSignal}
                        sheet={sheet}
                        range={range}
                        sourceKey={sourceKey}
                        contextKey={contextKey}
                        busy={busy}
                        onOperation={onPivotOperation}
                      />
                    )}
                    {mode === 'edit' && (
                      <XlsxObjectManagement
                        sheet={sheet}
                        sourceKey={sourceKey}
                        contextKey={contextKey}
                        busy={busy}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        onOperation={onPivotOperation}
                      />
                    )}
                  </fieldset>
                  {!['pivot', 'shape', 'edit'].includes(mode) && (
                    <div className="mimir-xlsx-tools__feedback" role="status">
                      {busy ? '正在应用…' : feedback}
                    </div>
                  )}
                </div>
              </ToolbarPropertyForm>
            </div>
          </aside>,
          container,
        )}
    </>
  )
}
