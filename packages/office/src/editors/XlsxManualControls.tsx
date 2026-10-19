import { useState } from 'react'
import { parseRange } from '../../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { Paintbrush } from 'lucide-react'
import type { XlsxWorkbook, XlsxSheet } from '../xlsx.js'
import { xlsxFillOperation, xlsxAutoSizes, xlsxFormatPaintRange } from '../xlsx-manual.js'
import {
  ToolbarButton,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
} from '../shell/EditorShell.js'

type Capture = {
  workbook: XlsxWorkbook
  sheetId: string
  name: string
  range: string
  kind: 'format'
}
export function XlsxManualControls({
  group,
  workbook,
  sheet,
  range,
  busy,
  onOperation,
}: {
  group: 'home' | 'data' | 'layout'
  workbook: XlsxWorkbook
  sheet: XlsxSheet
  range: string
  busy: boolean
  onOperation: (op: Record<string, unknown>) => Promise<boolean>
}) {
  const [capture, setCapture] = useState<Capture | null>(null),
    [message, setMessage] = useState(''),
    [fill, setFill] = useState('down'),
    [axis, setAxis] = useState<'rows' | 'columns'>('rows')
  const apply = async (op: Record<string, unknown>) => {
    setMessage('')
    try {
      const ok = await onOperation(op)
      setMessage(ok ? '已应用' : '未应用，请查看编辑器错误说明')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败')
    }
  }
  let rangeIssue = ''
  try {
    parseRange(range)
  } catch {
    rangeIssue = '先选择有效范围'
  }
  const levels = (sheet.outlines ?? []).filter(
    (outline) => outline.axis === axis && outline.level > 0,
  )
  const maxLevel = Math.max(0, ...levels.map((outline) => outline.level))
  const blocked = busy || !!rangeIssue,
    stale = capture?.workbook !== workbook
  const staleReason = '文档已更新，请重新拾取格式'
  let paintTarget = '',
    paintIssue = ''
  if (capture?.kind === 'format' && !rangeIssue) {
    try {
      paintTarget = xlsxFormatPaintRange(capture.range, range)
    } catch (error) {
      paintIssue = error instanceof Error ? error.message : '目标范围无效'
    }
  }
  return (
    <ToolbarMenu
      label={
        group === 'home' ? '格式刷与清除格式' : group === 'data' ? '填充与闪填' : '自动尺寸与分级'
      }
      text={group === 'home' ? '格式刷' : group === 'data' ? '填充' : '尺寸与分级'}
      panelWidth={320}
      renderPanel={() => (
        <ToolbarPropertyForm columns={1}>
          <div className="mimir-xlsx-tools">
            <fieldset disabled={busy} aria-busy={busy}>
              {group === 'home' && (
                <>
                  <ToolbarMenuFields label="格式刷">
                    <ToolbarMenuNote>
                      先拾取源范围的格式，再选择目标应用。内容和公式保持。
                    </ToolbarMenuNote>
                    <div className="mimir-xlsx-tools__actions">
                      <ToolbarButton
                        label="拾取所选范围格式"
                        disabled={blocked}
                        disabledReason="先选择源范围"
                        onClick={() => {
                          setCapture({
                            workbook,
                            sheetId: sheet.id,
                            name: sheet.name,
                            range,
                            kind: 'format',
                          })
                          setMessage('已拾取格式，选择目标后应用')
                        }}
                      >
                        <Paintbrush size={14} />
                        格式刷
                      </ToolbarButton>
                    </div>
                    {capture && (
                      <>
                        <ToolbarMenuNote>
                          格式源：{capture.name}!{capture.range}
                          {stale ? `；${staleReason}` : ''}
                        </ToolbarMenuNote>
                        {capture.kind === 'format' && (
                          <ToolbarMenuNote>
                            {paintIssue ||
                              rangeIssue ||
                              `应用到：${sheet.name}!${paintTarget}。单格目标按源范围大小展开。`}
                          </ToolbarMenuNote>
                        )}
                        <div className="mimir-xlsx-tools__actions">
                          <ToolbarButton
                            label="应用格式刷到所选范围"
                            primary
                            disabled={blocked || stale || !!paintIssue}
                            disabledReason={
                              stale ? staleReason : paintIssue || rangeIssue || undefined
                            }
                            onClick={() =>
                              void apply({
                                op: 'copy_format',
                                sourceSheetId: capture.sheetId,
                                source: capture.range,
                                range,
                              })
                            }
                          />
                          <ToolbarButton
                            label="取消范围操作"
                            onClick={() => {
                              setCapture(null)
                              setMessage('')
                            }}
                          >
                            取消
                          </ToolbarButton>
                        </div>
                      </>
                    )}
                  </ToolbarMenuFields>
                  <ToolbarMenuFields label="清除格式">
                    <ToolbarMenuNote>
                      保留内容和公式，清除直接格式、富文本字形及所选范围的条件格式。结构化表的样式仍由表格管理。
                    </ToolbarMenuNote>
                    <ToolbarButton
                      label="清除所选范围格式"
                      disabled={blocked}
                      disabledReason="先选择范围"
                      onClick={() => void apply({ op: 'clear_format', range })}
                    >
                      清除格式
                    </ToolbarButton>
                  </ToolbarMenuFields>
                </>
              )}
              {group === 'data' && (
                <ToolbarMenuFields label="填充所选范围">
                  <ToolbarSelect
                    disabled={busy}
                    label="填充方式"
                    value={fill}
                    onChange={setFill}
                    options={[
                      { value: 'down', label: '向下（首行作源）' },
                      { value: 'right', label: '向右（首列作源）' },
                      { value: 'up', label: '向上（末行作源）' },
                      { value: 'left', label: '向左（末列作源）' },
                      { value: 'series', label: '等差序列（前两格）' },
                      { value: 'flash', label: '快速填充（左侧列拼接）' },
                    ]}
                  />
                  <ToolbarMenuNote>
                    {fill === 'flash'
                      ? '先在目标列填写示例。选单格时沿紧邻左列连续数据向下填充（最多1000行）；也可选择完整范围。识别左侧最多六列的拼接与固定文字。'
                      : fill === 'series'
                        ? '选择单行或单列，前两格为数字；按其步长填满所选范围。'
                        : '选择包含源格和目标格的完整范围，复制内容、格式与相对公式。'}
                  </ToolbarMenuNote>
                  <ToolbarButton
                    label="应用范围填充"
                    primary
                    disabled={blocked}
                    disabledReason="先选择范围"
                    onClick={() => {
                      try {
                        void apply(
                          fill === 'flash'
                            ? { op: 'flash_fill', range }
                            : xlsxFillOperation(sheet, range, fill),
                        )
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : '无法填充')
                      }
                    }}
                  />
                </ToolbarMenuFields>
              )}
              {group === 'layout' && (
                <>
                  <ToolbarMenuFields label="自动适应内容">
                    <ToolbarMenuNote>
                      按当前字体、显示文本和换行测量整行或整列。合并单元格不参与测量。
                    </ToolbarMenuNote>
                    <div className="mimir-xlsx-tools__actions">
                      {(['columns', 'rows'] as const).map((direction) => (
                        <ToolbarButton
                          key={direction}
                          label={direction === 'rows' ? '自动适应所选行高' : '自动适应所选列宽'}
                          disabled={blocked}
                          disabledReason="先选择行列范围"
                          onClick={() => {
                            try {
                              const context = document.createElement('canvas').getContext('2d')
                              if (!context) throw new Error('当前环境无法测量字体，请手动设置尺寸')
                              const sizes = xlsxAutoSizes(sheet, range, direction, (text, cell) => {
                                const f = cell?.format
                                context.font = `${f?.italic ? 'italic ' : ''}${f?.bold ? 'bold ' : ''}${((f?.fontSize ?? 11) * 4) / 3}px ${JSON.stringify(f?.fontFamily ?? 'Arial')}`
                                return context.measureText(text).width
                              })
                              void apply({ op: 'auto_size', axis: direction, sizes })
                            } catch (error) {
                              setMessage(error instanceof Error ? error.message : '无法测量内容')
                            }
                          }}
                        >
                          {direction === 'rows' ? '适应行高' : '适应列宽'}
                        </ToolbarButton>
                      ))}
                    </div>
                  </ToolbarMenuFields>
                  <ToolbarMenuFields label="分级显示">
                    <ToolbarSelect
                      disabled={busy}
                      label="分组方向"
                      value={axis}
                      onChange={(value) => setAxis(value as 'rows' | 'columns')}
                      options={[
                        { value: 'rows', label: '行' },
                        { value: 'columns', label: '列' },
                      ]}
                    />
                    <ToolbarMenuNote>
                      当前{axis === 'rows' ? '行' : '列'}分级：
                      {maxLevel
                        ? `最多${maxLevel}层，${levels.filter((level) => level.hidden).length}项已折叠`
                        : '尚未创建分组'}
                      。对所选范围的整行或整列操作。
                    </ToolbarMenuNote>
                    <div className="mimir-xlsx-tools__actions">
                      {(
                        [
                          { action: 'group', label: '创建分组' },
                          { action: 'ungroup', label: '取消一层分组' },
                          { action: 'collapse', label: '折叠明细' },
                          { action: 'expand', label: '展开明细' },
                        ] as const
                      ).map((item) => (
                        <ToolbarButton
                          key={item.action}
                          label={item.label}
                          disabled={blocked}
                          disabledReason="先选择范围"
                          onClick={() =>
                            void apply({ op: 'set_outline', range, axis, action: item.action })
                          }
                        >
                          {item.label}
                        </ToolbarButton>
                      ))}
                    </div>
                  </ToolbarMenuFields>
                </>
              )}
            </fieldset>
            <div className="mimir-xlsx-tools__feedback" role="status">
              {sheet.extras?.protected
                ? '工作表已保护，请先取消保护'
                : busy
                  ? '正在应用…'
                  : message}
            </div>
          </div>
        </ToolbarPropertyForm>
      )}
    />
  )
}
