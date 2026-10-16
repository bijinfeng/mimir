import { XLSX_COLORS } from './XlsxFormatControls.js'
import { useState } from 'react'
import type { XlsxSheet, XlsxWorkbook } from '../xlsx.js'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarConfirm,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTabs,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'
export function XlsxPropertyControls({
  group,
  range,
  sheet,
  workbook,
  busy,
  onOperation,
}: {
  group: 'rules' | 'names' | 'print' | 'freeze'
  range: string
  sheet: XlsxSheet
  workbook: XlsxWorkbook
  busy: boolean
  onOperation: (op: Record<string, unknown>) => Promise<boolean>
}) {
  const [mode, setMode] = useState('validation')
  const [validation, setValidation] = useState('list')
  const [cfKind, setCfKind] = useState('number')
  const [operator, setOperator] = useState('greaterThan')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [color, setColor] = useState('#FFCC00')
  const [name, setName] = useState('')
  const [ref, setRef] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [target, setTarget] = useState('')
  const [sparkType, setSparkType] = useState('line')
  const [pageChanges, setPageChanges] = useState<Record<string, unknown>>({})
  const orientation = String(
    pageChanges.orientation ?? sheet.extras?.pageSetup?.orientation ?? 'portrait',
  )
  const paper = String(pageChanges.paperSize ?? sheet.extras?.pageSetup?.paperSize ?? '9')
  const scale = Number(pageChanges.scale ?? sheet.extras?.pageSetup?.scale ?? 100)
  const margins = String(pageChanges.margins ?? '')
  const [printMode, setPrintMode] = useState('page')
  const [printArea, setPrintArea] = useState(
    workbook.definedNames
      ?.find(
        (n) => n.name === '_xlnm.Print_Area' && n.sheetIndex === workbook.sheets.indexOf(sheet),
      )
      ?.ref.split('!')
      .at(-1)
      ?.replaceAll('$', '') ?? range,
  )
  const [titles, setTitles] = useState(
    workbook.definedNames
      ?.find(
        (n) => n.name === '_xlnm.Print_Titles' && n.sheetIndex === workbook.sheets.indexOf(sheet),
      )
      ?.ref.split('!')
      .at(-1)
      ?.replaceAll('$', '') ?? '',
  )
  const [header, setHeader] = useState<string | null>(null)
  const [footer, setFooter] = useState<string | null>(null)
  const [rowsDraft, setRows] = useState<number | null>(null)
  const [columnsDraft, setColumns] = useState<number | null>(null)
  const rows = rowsDraft ?? sheet.extras?.frozenRows ?? 0
  const columns = columnsDraft ?? sheet.extras?.frozenColumns ?? 0
  const [dirty, setDirty] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const change = (fn: () => void) => {
    fn()
    setDirty(true)
    setFeedback(null)
  }
  const apply = async (op: Record<string, unknown>) => {
    setFeedback(null)
    if (await onOperation(op)) {
      setDirty(false)
      if (op.op === 'set_page_setup') {
        if (printMode === 'page') setPageChanges({})
        if (op.header !== undefined) setHeader(null)
        if (op.footer !== undefined) setFooter(null)
      }
      if (op.op === 'set_freeze') {
        setRows(null)
        setColumns(null)
      }
      setFeedback('已应用')
    } else setFeedback('未应用，请查看编辑器下方的错误说明')
  }
  const currentValidations = sheet.extras?.validations ?? [],
    currentCf = sheet.extras?.conditionalFormats ?? [],
    names = workbook.definedNames ?? []
  const v = () =>
    validation === 'list'
      ? { kind: 'list', values: first.split('\n') }
      : validation === 'listRef'
        ? { kind: 'listRef', range: first }
        : validation === 'numberBetween'
          ? { kind: 'numberBetween', min: Number(first), max: Number(second) }
          : validation === 'dateBetween'
            ? { kind: 'dateBetween', start: first, end: second }
            : validation === 'formula'
              ? { kind: 'formula', formula: first }
              : { kind: 'checkbox' }
  const cf = () =>
    cfKind === 'number'
      ? {
          kind: 'number',
          operator,
          value: Number(first),
          ...(['between', 'notBetween'].includes(operator) ? { value2: Number(second) } : {}),
          format: { fillColor: color },
        }
      : cfKind === 'text'
        ? { kind: 'text', operator: 'contains', text: first, format: { fillColor: color } }
        : cfKind === 'blank'
          ? { kind: 'blank', blank: true, format: { fillColor: color } }
          : cfKind === 'duplicate'
            ? { kind: 'duplicate', format: { fillColor: color } }
            : cfKind === 'top10'
              ? { kind: 'top10', rank: Number(first), format: { fillColor: color } }
              : cfKind === 'formula'
                ? { kind: 'formula', formula: first, format: { fillColor: color } }
                : cfKind === 'colorScale'
                  ? { kind: 'colorScale', minColor: '#FFFFFF', maxColor: color }
                  : { kind: 'dataBar', color }
  const label =
    group === 'rules'
      ? '数据规则与迷你图'
      : group === 'names'
        ? '命名范围管理'
        : group === 'print'
          ? '打印设置'
          : '冻结窗格设置'
  const mutableNames = names.filter(
    (n) => n.sheetIndex === undefined && !n.hidden && !n.name.startsWith('_xlnm.'),
  )
  const selected = mutableNames.find((n) => n.name === selectedName)
  const requiredValue =
    group === 'rules' &&
    (mode === 'validation'
      ? validation !== 'checkbox'
      : mode === 'conditional'
        ? ['number', 'text', 'top10', 'formula'].includes(cfKind)
        : false)
  return (
    <ToolbarMenu
      label={label}
      text={
        group === 'rules'
          ? '验证与条件格式'
          : group === 'names'
            ? '命名范围'
            : group === 'print'
              ? '打印设置'
              : '冻结窗格'
      }
      panelWidth={360}
      renderPanel={() => (
        <ToolbarPropertyForm columns={1}>
          <div className="mimir-xlsx-tools">
            <ToolbarMenuNote>
              {sheet.name} · 当前范围：{range || '未选择'}
              {sheet.extras?.protected ? ' · 工作表已保护' : ''}
            </ToolbarMenuNote>
            {group === 'rules' && (
              <ToolbarTabs
                label="数据规则工具"
                value={mode}
                onChange={(value) => {
                  setMode(value)
                  setFirst('')
                  setSecond('')
                  setDirty(false)
                  setFeedback(null)
                }}
                items={[
                  { value: 'validation', label: '数据验证' },
                  { value: 'conditional', label: '条件格式' },
                  { value: 'sparkline', label: '迷你图' },
                ]}
              />
            )}
            {group === 'print' && (
              <ToolbarTabs
                label="打印设置类别"
                value={printMode}
                onChange={setPrintMode}
                items={[
                  { value: 'page', label: '页面' },
                  { value: 'area', label: '打印范围' },
                  { value: 'header', label: '页眉页脚' },
                ]}
              />
            )}
            <fieldset
              disabled={busy || (group !== 'names' && sheet.extras?.protected)}
              aria-busy={busy}
            >
              {group === 'rules' && mode === 'validation' && (
                <ToolbarMenuFields label="数据验证">
                  <ToolbarMenuNote>
                    当前工作表有{currentValidations.length}
                    项验证。编辑时会检查输入，约束随工作簿保存。
                  </ToolbarMenuNote>
                  <ToolbarMenuNote>
                    {currentValidations
                      .slice(0, 5)
                      .map(
                        (rule) =>
                          `${rule.range} · ${rule.type} · ${rule.formula1}${rule.formula2 ? ' ～ ' + rule.formula2 : ''}`,
                      )
                      .join('；')}
                  </ToolbarMenuNote>
                  <ToolbarSelect
                    label="验证类型"
                    value={validation}
                    onChange={(value) =>
                      change(() => {
                        setValidation(value)
                        setFirst('')
                        setSecond('')
                      })
                    }
                    options={[
                      { value: 'list', label: '下拉选项' },
                      { value: 'listRef', label: '引用选项范围' },
                      { value: 'numberBetween', label: '数字区间' },
                      { value: 'dateBetween', label: '日期区间' },
                      { value: 'checkbox', label: '0/1列表' },
                      { value: 'formula', label: '自定义公式' },
                    ]}
                  />
                  {validation !== 'checkbox' &&
                    (validation === 'list' ? (
                      <ToolbarTextArea
                        label="下拉选项（每行一项）"
                        value={first}
                        onChange={(value) => change(() => setFirst(value))}
                        rows={4}
                      />
                    ) : (
                      <ToolbarTextField
                        label={
                          validation === 'listRef'
                            ? '选项范围（A1:A5）'
                            : validation === 'formula'
                              ? '验证公式（=开头）'
                              : validation === 'dateBetween'
                                ? '开始日期（YYYY-MM-DD）'
                                : '最小值'
                        }
                        value={first}
                        onChange={(value) => change(() => setFirst(value))}
                      />
                    ))}
                  {['numberBetween', 'dateBetween'].includes(validation) && (
                    <ToolbarTextField
                      label={validation === 'numberBetween' ? '最大值' : '结束日期（YYYY-MM-DD）'}
                      value={second}
                      onChange={(value) => change(() => setSecond(value))}
                    />
                  )}
                  <div className="mimir-xlsx-tools__actions">
                    <ToolbarButton
                      label="应用范围数据验证"
                      disabled={
                        !range ||
                        (requiredValue && !first.trim()) ||
                        (['numberBetween', 'dateBetween'].includes(validation) && !second.trim())
                      }
                      disabledReason="选择范围并填写规则必需字段"
                      onClick={() =>
                        void apply({ op: 'set_data_validation', range, validation: v() })
                      }
                    >
                      应用验证
                    </ToolbarButton>
                    <ToolbarButton
                      label="清除范围数据验证"
                      disabled={!range}
                      disabledReason="先输入范围"
                      onClick={() =>
                        void apply({ op: 'set_data_validation', range, validation: null })
                      }
                    >
                      清除范围验证
                    </ToolbarButton>
                  </div>
                </ToolbarMenuFields>
              )}
              {group === 'rules' && mode === 'conditional' && (
                <ToolbarMenuFields label="条件格式">
                  <ToolbarMenuNote>
                    当前{currentCf.reduce((sum, r) => sum + r.types.length, 0)}
                    条规则。数字/文字/空白/重复/排名、色阶与数据条在网格中呈现；复杂导入公式在格上标出计算限制。
                  </ToolbarMenuNote>
                  <ToolbarMenuNote>
                    {currentCf
                      .slice(0, 5)
                      .map((rule) => `${rule.range} · ${rule.types.join('、')}`)
                      .join('；')}
                  </ToolbarMenuNote>
                  <ToolbarSelect
                    label="条件类型"
                    value={cfKind}
                    onChange={(value) =>
                      change(() => {
                        setCfKind(value)
                        setFirst('')
                        setSecond('')
                      })
                    }
                    options={[
                      { value: 'number', label: '数字比较' },
                      { value: 'text', label: '文字包含' },
                      { value: 'blank', label: '空单元格' },
                      { value: 'duplicate', label: '重复值' },
                      { value: 'top10', label: '前N项' },
                      { value: 'formula', label: '自定义公式' },
                      { value: 'colorScale', label: '双色渐变' },
                      { value: 'dataBar', label: '数据条' },
                    ]}
                  />
                  {cfKind === 'number' && (
                    <ToolbarSelect
                      label="比较方式"
                      value={operator}
                      onChange={(value) => change(() => setOperator(value))}
                      options={[
                        { value: 'greaterThan', label: '大于' },
                        { value: 'lessThan', label: '小于' },
                        { value: 'equal', label: '等于' },
                        { value: 'notEqual', label: '不等于' },
                        { value: 'between', label: '介于' },
                        { value: 'notBetween', label: '不介于' },
                      ]}
                    />
                  )}
                  {['number', 'text', 'top10', 'formula'].includes(cfKind) && (
                    <ToolbarTextField
                      label={
                        cfKind === 'formula'
                          ? '条件公式（=开头）'
                          : cfKind === 'text'
                            ? '包含文字'
                            : cfKind === 'top10'
                              ? '项数（1–1000）'
                              : '比较数值'
                      }
                      value={first}
                      onChange={(value) => change(() => setFirst(value))}
                    />
                  )}
                  {cfKind === 'number' && ['between', 'notBetween'].includes(operator) && (
                    <ToolbarTextField
                      label="第二个比较数值"
                      value={second}
                      onChange={(value) => change(() => setSecond(value))}
                    />
                  )}
                  <ToolbarColorPicker
                    label={
                      cfKind === 'colorScale'
                        ? '最大值颜色（最小值为白色）'
                        : cfKind === 'dataBar'
                          ? '数据条颜色'
                          : '高亮填充颜色'
                    }
                    value={color}
                    options={XLSX_COLORS}
                    onPick={(value) => change(() => setColor(value))}
                  />
                  <ToolbarButton
                    label="添加范围条件格式"
                    disabled={
                      !range ||
                      (requiredValue && !first.trim()) ||
                      (cfKind === 'number' &&
                        ['between', 'notBetween'].includes(operator) &&
                        !second.trim())
                    }
                    disabledReason="选择范围并填写条件必需字段"
                    onClick={() => void apply({ op: 'add_conditional_format', range, rule: cf() })}
                  >
                    添加规则
                  </ToolbarButton>
                  <ToolbarConfirm
                    title="清除工作表全部条件格式？"
                    confirmLabel="清除全部规则"
                    description="仅移除条件规则，单元格原有格式保留。"
                    onConfirm={() => void apply({ op: 'clear_conditional_formats' })}
                  >
                    <ToolbarButton label="清除本表全部条件格式">清除全部规则</ToolbarButton>
                  </ToolbarConfirm>
                </ToolbarMenuFields>
              )}
              {group === 'rules' && mode === 'sparkline' && (
                <ToolbarMenuFields label="迷你图">
                  <ToolbarMenuNote>
                    当前{sheet.extras?.sparklines?.length ?? 0}
                    个迷你图。每个源数据行生成一个，目标从起点向下排列。网格直接显示折线、柱形或盈亏图；空值保留间隔。
                  </ToolbarMenuNote>
                  <ToolbarMenuNote>
                    {sheet.extras?.sparklines
                      ?.slice(0, 10)
                      .map((s) => `${s.cell} ← ${s.source}`)
                      .join('；')}
                  </ToolbarMenuNote>
                  <ToolbarSelect
                    label="迷你图类型"
                    value={sparkType}
                    onChange={(value) => change(() => setSparkType(value))}
                    options={[
                      { value: 'line', label: '折线' },
                      { value: 'column', label: '柱形' },
                      { value: 'stacked', label: '盈亏' },
                    ]}
                  />
                  <ToolbarTextField
                    label="迷你图目标起点（留空为范围右侧）"
                    value={target}
                    onChange={(value) => change(() => setTarget(value.toUpperCase()))}
                    placeholder="E2"
                  />
                  <ToolbarColorPicker
                    label="迷你图颜色"
                    value={color}
                    options={XLSX_COLORS}
                    onPick={(value) => change(() => setColor(value))}
                  />
                  <ToolbarButton
                    label="插入范围迷你图"
                    disabled={!range}
                    disabledReason="先选中源数据范围"
                    onClick={() =>
                      void apply({
                        op: 'add_sparkline',
                        dataRange: range,
                        type: sparkType,
                        ...(target ? { targetCell: target } : {}),
                        color,
                      })
                    }
                  >
                    插入迷你图
                  </ToolbarButton>
                </ToolbarMenuFields>
              )}
              {group === 'names' && (
                <>
                  <ToolbarMenuFields label="新增命名范围">
                    <ToolbarTextField
                      label="名称"
                      value={name}
                      onChange={(value) => change(() => setName(value))}
                      placeholder="销售区域"
                    />
                    <ToolbarTextField
                      label="引用或公式"
                      value={ref}
                      onChange={(value) => change(() => setRef(value))}
                      placeholder={`'${sheet.name}'!$A$1:$B$5`}
                    />
                    <ToolbarButton
                      label="新增工作簿命名范围"
                      disabled={!name.trim() || !ref.trim()}
                      disabledReason="填写名称和引用"
                      onClick={() => void apply({ op: 'add_defined_name', name, ref })}
                    >
                      新增名称
                    </ToolbarButton>
                  </ToolbarMenuFields>
                  <ToolbarMenuFields label="已有名称">
                    <ToolbarSelect
                      label="工作簿命名范围"
                      value={selectedName}
                      onChange={setSelectedName}
                      options={mutableNames.map((n) => ({ value: n.name, label: n.name }))}
                    />
                    <ToolbarMenuNote>
                      {selected?.ref ?? '无可修改的工作簿名称。内置、隐藏及工作表级名称保留。'}
                    </ToolbarMenuNote>
                    <ToolbarButton
                      label="删除选中命名范围"
                      disabled={!selected}
                      disabledReason="先选择现有工作簿名称"
                      onClick={() => void apply({ op: 'delete_defined_name', name: selectedName })}
                    >
                      删除名称
                    </ToolbarButton>
                  </ToolbarMenuFields>
                </>
              )}
              {group === 'print' && printMode === 'page' && (
                <ToolbarMenuFields label="纸张与缩放">
                  <ToolbarSelect
                    label="纸张方向"
                    value={orientation}
                    onChange={(value) =>
                      change(() => {
                        setPageChanges((p) => ({ ...p, orientation: value }))
                      })
                    }
                    options={[
                      { value: 'portrait', label: '纵向' },
                      { value: 'landscape', label: '横向' },
                    ]}
                  />
                  <ToolbarSelect
                    label="纸张大小"
                    value={paper}
                    onChange={(value) =>
                      change(() => {
                        setPageChanges((p) => ({ ...p, paperSize: Number(value) }))
                      })
                    }
                    options={[
                      { value: '9', label: 'A4' },
                      { value: '8', label: 'A3' },
                      { value: '11', label: 'A5' },
                      { value: '1', label: 'Letter' },
                    ]}
                  />
                  <ToolbarNumberField
                    label="打印缩放（%）"
                    value={scale}
                    min={10}
                    max={400}
                    onCommit={(value) =>
                      change(() => {
                        setPageChanges((p) => ({ ...p, scale: value }))
                      })
                    }
                  />
                  <ToolbarSelect
                    label="页边距"
                    value={margins}
                    onChange={(value) =>
                      change(() => {
                        setPageChanges((p) => {
                          const { margins: _margins, ...rest } = p
                          return value ? { ...rest, margins: value } : rest
                        })
                      })
                    }
                    options={[
                      { value: '', label: '保留当前页边距' },
                      { value: 'normal', label: '常规' },
                      { value: 'wide', label: '宽' },
                      { value: 'narrow', label: '窄' },
                    ]}
                  />
                  <ToolbarMenuNote>设置保存到文件，当前为普通网格视图。</ToolbarMenuNote>
                  <ToolbarButton
                    label="应用打印页面设置"
                    disabled={Object.keys(pageChanges).length === 0}
                    disabledReason="先更改页面设置"
                    onClick={() =>
                      void apply({
                        op: 'set_page_setup',
                        ...pageChanges,
                      })
                    }
                  >
                    应用页面设置
                  </ToolbarButton>
                </ToolbarMenuFields>
              )}
              {group === 'print' && printMode === 'area' && (
                <ToolbarMenuFields label="打印区域与标题">
                  <ToolbarTextField
                    label="打印区域（A1:C5）"
                    value={printArea}
                    onChange={(value) => change(() => setPrintArea(value.toUpperCase()))}
                  />
                  <ToolbarTextField
                    label="重复标题行（1:2）"
                    value={titles}
                    onChange={(value) => change(() => setTitles(value))}
                  />
                  <ToolbarMenuNote>留空会清除对应设置；只接受单个连续区域。</ToolbarMenuNote>
                  <ToolbarButton
                    label="应用打印范围与标题"
                    onClick={() =>
                      void apply({
                        op: 'set_page_setup',
                        printArea: printArea || null,
                        printTitles: titles || null,
                      })
                    }
                  >
                    应用打印范围
                  </ToolbarButton>
                </ToolbarMenuFields>
              )}
              {group === 'print' && printMode === 'header' && (
                <ToolbarMenuFields label="页眉页脚">
                  <ToolbarMenuNote>
                    当前页眉：{sheet.extras?.headers?.header || '无'}；页脚：
                    {sheet.extras?.headers?.footer || '无'}
                  </ToolbarMenuNote>
                  <ToolbarTextField
                    label="页眉居中文字"
                    value={header ?? ''}
                    placeholder="未编辑时保留原页眉"
                    onChange={(value) => change(() => setHeader(value))}
                  />
                  <ToolbarTextField
                    label="页脚居中文字"
                    value={footer ?? ''}
                    placeholder="未编辑时保留原页脚"
                    onChange={(value) => change(() => setFooter(value))}
                  />
                  <ToolbarMenuNote>
                    支持 &P 页码、&N 总页数、&D
                    日期。编辑后会将对应页眉或页脚替换为居中文字；编辑后留空可清除，未编辑的部分保留。
                  </ToolbarMenuNote>
                  <ToolbarButton
                    label="应用打印页眉页脚"
                    disabled={header === null && footer === null}
                    disabledReason="先编辑页眉或页脚"
                    onClick={() =>
                      void apply({
                        op: 'set_page_setup',
                        ...(header !== null ? { header: header ? { center: header } : null } : {}),
                        ...(footer !== null ? { footer: footer ? { center: footer } : null } : {}),
                      })
                    }
                  >
                    应用页眉页脚
                  </ToolbarButton>
                </ToolbarMenuFields>
              )}
              {group === 'freeze' && (
                <ToolbarMenuFields label="冻结窗格">
                  <ToolbarMenuNote>
                    当前冻结前{sheet.extras?.frozenRows ?? 0}行、前
                    {sheet.extras?.frozenColumns ?? 0}列。
                  </ToolbarMenuNote>
                  <ToolbarNumberField
                    label="冻结顶部行数"
                    value={rows}
                    min={0}
                    max={100}
                    onCommit={(value) => change(() => setRows(value))}
                  />
                  <ToolbarNumberField
                    label="冻结左侧列数"
                    value={columns}
                    min={0}
                    max={100}
                    onCommit={(value) => change(() => setColumns(value))}
                  />
                  <div className="mimir-xlsx-tools__actions">
                    <ToolbarButton
                      label="应用冻结窗格"
                      disabled={
                        rows === (sheet.extras?.frozenRows ?? 0) &&
                        columns === (sheet.extras?.frozenColumns ?? 0)
                      }
                      disabledReason="冻结行列数没有变化"
                      onClick={() => void apply({ op: 'set_freeze', rows, columns })}
                    >
                      冻结窗格
                    </ToolbarButton>
                    <ToolbarButton
                      label="取消冻结窗格"
                      disabled={
                        !(sheet.extras?.frozenRows ?? 0) && !(sheet.extras?.frozenColumns ?? 0)
                      }
                      disabledReason="当前没有冻结窗格"
                      onClick={() => void apply({ op: 'set_freeze', rows: 0, columns: 0 })}
                    >
                      取消冻结
                    </ToolbarButton>
                  </div>
                </ToolbarMenuFields>
              )}
            </fieldset>
            <div className="mimir-xlsx-tools__feedback" role="status">
              {busy ? '正在应用…' : (feedback ?? (dirty ? '待应用' : ''))}
            </div>
          </div>
        </ToolbarPropertyForm>
      )}
    />
  )
}
