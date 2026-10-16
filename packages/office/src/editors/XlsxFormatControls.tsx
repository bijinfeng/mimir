import { useState } from 'react'
import { Bold, Italic, Underline } from 'lucide-react'
import type { XlsxCell } from '../xlsx.js'
import type { XlsxCellFormat } from '../xlsx-format.js'
import {
  ToolbarPropertyForm,
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarMenuFields,
  ToolbarLabel,
  ToolbarMenu,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'

export const XLSX_COLORS = [
  ['#000000', '黑色'],
  ['#FFFFFF', '白色'],
  ['#C00000', '红色'],
  ['#FFC000', '黄色'],
  ['#70AD47', '绿色'],
  ['#4472C4', '蓝色'],
  ['#7030A0', '紫色'],
  ['#D9E2F3', '浅蓝'],
].map(([value, label]) => ({ value: value!, label: label!, swatch: value! }))

/** All controls read the selected cells and write the same format_range operation as Agent. */
export function XlsxFormatControls({
  cells,
  range,
  busy,
  disabledReason,
  onFormat,
}: {
  cells: XlsxCell[]
  range: string
  busy?: boolean
  disabledReason?: string
  onFormat: (patch: Record<string, unknown>) => void
}) {
  const [fontDraft, setFontDraft] = useState<string | null>(null)
  const [sizeDraft, setSizeDraft] = useState<string | null>(null)
  const [numberDraft, setNumberDraft] = useState<string | null>(null)
  function current<K extends keyof XlsxCellFormat>(key: K): NonNullable<XlsxCellFormat[K]> | null {
    if (!cells.length) return null
    const values = cells.map((cell) => cell.format?.[key])
    return values.every((value) => value === values[0])
      ? ((values[0] ?? null) as NonNullable<XlsxCellFormat[K]> | null)
      : null
  }
  const formatSize = () => {
    const size = Number(sizeDraft)
    if (sizeDraft && Number.isFinite(size) && size >= 1 && size <= 409) {
      onFormat({ fontSize: size })
      setSizeDraft(null)
    }
  }
  if (!cells.length || disabledReason)
    return (
      <ToolbarButton
        label="范围字体与对齐"
        disabled
        disabledReason={disabledReason ?? '先选中单元格或输入范围'}
      >
        字体与对齐
      </ToolbarButton>
    )
  return (
    <>
      {(
        [
          { key: 'bold', label: '加粗', Icon: Bold },
          { key: 'italic', label: '斜体', Icon: Italic },
          { key: 'underline', label: '下划线', Icon: Underline },
        ] as const
      ).map(({ key, label, Icon }) => (
        <ToolbarButton
          key={key}
          label={`快速${label}`}
          active={current(key) === true}
          disabled={busy}
          disabledReason="正在应用或保存工作簿"
          onClick={() => onFormat({ [key]: current(key) !== true })}
        >
          <Icon size={16} />
        </ToolbarButton>
      ))}
      <ToolbarSelect
        label="快速字体"
        value={current('fontFamily')}
        emptyLabel="字体"
        disabled={busy}
        options={[
          ...new Set([
            ...(current('fontFamily') ? [current('fontFamily')!] : []),
            '宋体',
            '微软雅黑',
            '等线',
            'Arial',
            'Calibri',
            'Times New Roman',
          ]),
        ].map((value) => ({ value, label: value }))}
        onChange={(fontFamily) => onFormat({ fontFamily })}
      />
      <ToolbarSelect
        label="快速字号"
        value={current('fontSize') === null ? null : String(current('fontSize'))}
        emptyLabel="字号"
        disabled={busy}
        options={[
          ...new Set([
            ...(current('fontSize') ? [current('fontSize')!] : []),
            8,
            9,
            10,
            11,
            12,
            14,
            16,
            18,
            20,
            24,
            28,
            36,
            48,
            72,
          ]),
        ].map((value) => ({ value: String(value), label: String(value) }))}
        onChange={(fontSize) => onFormat({ fontSize: Number(fontSize) })}
      />
      <ToolbarMenu
        label="范围字体与对齐"
        text="字体与对齐"
        panelWidth={420}
        renderPanel={() => (
          <ToolbarPropertyForm columns={2}>
            <fieldset
              disabled={busy}
              aria-busy={busy}
              title={busy ? '正在应用工作簿操作' : undefined}
              style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
            >
              <ToolbarLabel>
                {range} · {cells.length} 个可见单元格
              </ToolbarLabel>
              <ToolbarMenuFields label="字形">
                <ToolbarLabel>字形</ToolbarLabel>
                {(
                  [
                    ['bold', '加粗', 'B'],
                    ['italic', '斜体', 'I'],
                    ['underline', '下划线', 'U'],
                    ['strikethrough', '删除线', 'S'],
                  ] as const
                ).map(([key, label, text]) => (
                  <ToolbarButton
                    key={key}
                    label={`范围${label}`}
                    active={current(key) === true}
                    onClick={() => onFormat({ [key]: current(key) !== true })}
                  >
                    {text}
                  </ToolbarButton>
                ))}
                <ToolbarTextField
                  label="范围字体"
                  value={fontDraft ?? current('fontFamily') ?? ''}
                  placeholder="混合或默认字体"
                  onChange={setFontDraft}
                  onSubmit={() => {
                    if (fontDraft?.trim()) {
                      onFormat({ fontFamily: fontDraft.trim() })
                      setFontDraft(null)
                    }
                  }}
                  onCancel={() => setFontDraft(null)}
                />
                <ToolbarButton
                  label="应用范围字体"
                  disabled={!fontDraft?.trim()}
                  disabledReason="先输入字体名称"
                  onClick={() => {
                    if (fontDraft?.trim()) {
                      onFormat({ fontFamily: fontDraft.trim() })
                      setFontDraft(null)
                    }
                  }}
                >
                  应用字体
                </ToolbarButton>
                <ToolbarTextField
                  label="范围字号（1–409 磅）"
                  value={sizeDraft ?? String(current('fontSize') ?? '')}
                  placeholder="混合或默认字号"
                  onChange={setSizeDraft}
                  onSubmit={formatSize}
                  onCancel={() => setSizeDraft(null)}
                />
                <ToolbarButton
                  label="应用范围字号"
                  disabled={
                    !sizeDraft ||
                    !Number.isFinite(Number(sizeDraft)) ||
                    Number(sizeDraft) < 1 ||
                    Number(sizeDraft) > 409
                  }
                  disabledReason="输入 1–409 磅字号"
                  onClick={formatSize}
                >
                  应用字号
                </ToolbarButton>
              </ToolbarMenuFields>
              <ToolbarMenuFields label="颜色">
                <ToolbarLabel>颜色</ToolbarLabel>
                <ToolbarColorPicker
                  label="范围字体颜色"
                  value={current('fontColor')}
                  options={XLSX_COLORS}
                  onPick={(fontColor) => onFormat({ fontColor })}
                  onClear={() => onFormat({ fontColor: null })}
                  clearLabel="自动字体颜色"
                  icon={<span>A</span>}
                />
                <ToolbarColorPicker
                  label="范围填充颜色"
                  value={current('fillColor')}
                  options={XLSX_COLORS}
                  onPick={(fillColor) => onFormat({ fillColor })}
                  onClear={() => onFormat({ fillColor: null })}
                  clearLabel="无填充"
                  icon={<span>▧</span>}
                />
              </ToolbarMenuFields>
              <ToolbarMenuFields label="对齐">
                <ToolbarLabel>对齐</ToolbarLabel>
                <ToolbarSelect
                  label="范围水平对齐"
                  value={current('horizontalAlign')}
                  emptyLabel="混合或默认"
                  options={[
                    { value: 'left', label: '左对齐' },
                    { value: 'center', label: '居中' },
                    { value: 'right', label: '右对齐' },
                  ]}
                  onChange={(horizontalAlign) => onFormat({ horizontalAlign })}
                />
                <ToolbarSelect
                  label="范围垂直对齐"
                  value={current('verticalAlign')}
                  emptyLabel="混合或默认"
                  options={[
                    { value: 'top', label: '顶端' },
                    { value: 'center', label: '居中' },
                    { value: 'bottom', label: '底端' },
                  ]}
                  onChange={(verticalAlign) => onFormat({ verticalAlign })}
                />
                <ToolbarButton
                  label="范围自动换行"
                  active={current('wrapText') === true}
                  onClick={() => onFormat({ wrapText: current('wrapText') !== true })}
                >
                  换行
                </ToolbarButton>
                <ToolbarMenu
                  label="范围边框"
                  text="边框"
                  items={(['all', 'top', 'bottom', 'left', 'right', 'none'] as const).map(
                    (type, index) => ({
                      key: type,
                      label: ['所有边框', '上边框', '下边框', '左边框', '右边框', '无边框'][index]!,
                      onSelect: () => onFormat({ border: { type } }),
                    }),
                  )}
                />
                <ToolbarMenu
                  label="范围文字方向"
                  text="方向"
                  items={[
                    { key: 'normal', label: '水平', onSelect: () => onFormat({ textRotation: 0 }) },
                    {
                      key: 'vertical',
                      label: '竖排',
                      onSelect: () => onFormat({ textRotation: 'vertical' }),
                    },
                    {
                      key: 'up',
                      label: '向上旋转 90°',
                      onSelect: () => onFormat({ textRotation: 90 }),
                    },
                    {
                      key: 'down',
                      label: '向下旋转 90°',
                      onSelect: () => onFormat({ textRotation: -90 }),
                    },
                  ]}
                />
                <ToolbarButton
                  label="增加范围缩进"
                  onClick={() => onFormat({ indent: Math.min(250, (current('indent') ?? 0) + 1) })}
                >
                  增加缩进
                </ToolbarButton>
                <ToolbarButton
                  label="减少范围缩进"
                  onClick={() => onFormat({ indent: Math.max(0, (current('indent') ?? 0) - 1) })}
                >
                  减少缩进
                </ToolbarButton>
              </ToolbarMenuFields>
              <ToolbarMenuFields label="数字格式">
                <ToolbarLabel>数字格式</ToolbarLabel>
                <ToolbarSelect
                  label="范围数字格式预设"
                  value={current('numberFormat')}
                  emptyLabel="混合或自定义"
                  options={[
                    { value: 'General', label: '常规' },
                    { value: '0', label: '整数' },
                    { value: '0.00', label: '两位小数' },
                    { value: '#,##0.00', label: '千位分隔' },
                    { value: '0%', label: '百分比' },
                    { value: 'yyyy-mm-dd', label: '日期' },
                    { value: '@', label: '文本' },
                  ]}
                  onChange={(numberFormat) => onFormat({ numberFormat })}
                />
                <ToolbarTextField
                  label="自定义范围数字格式"
                  value={numberDraft ?? current('numberFormat') ?? ''}
                  onChange={setNumberDraft}
                  onSubmit={() => {
                    if (numberDraft) {
                      onFormat({ numberFormat: numberDraft })
                      setNumberDraft(null)
                    }
                  }}
                  onCancel={() => setNumberDraft(null)}
                />
                <ToolbarButton
                  label="应用自定义数字格式"
                  disabled={!numberDraft}
                  disabledReason="先输入格式代码"
                  onClick={() => {
                    if (numberDraft) {
                      onFormat({ numberFormat: numberDraft })
                      setNumberDraft(null)
                    }
                  }}
                >
                  应用格式
                </ToolbarButton>
              </ToolbarMenuFields>
            </fieldset>
          </ToolbarPropertyForm>
        )}
      />
    </>
  )
}
