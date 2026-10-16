import { useEffect, useState } from 'react'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarMenu,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarSelect,
} from '../shell/EditorShell.js'
import {
  HIGHLIGHTER_WIDTHS,
  INK_COLORS,
  PEN_WIDTHS,
  readInkPresets,
  type InkPreset,
  type InkTool,
} from '../pptx-ink.js'
import './pptx-ink.css'

const PRESET_KEY = 'mimir.pptx.ink-presets.v1'
export function usePptxInkSettings() {
  const [tool, setTool] = useState<InkTool>('select')
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [presets, setPresets] = useState<InkPreset[]>(() => {
    try {
      return readInkPresets(localStorage.getItem(PRESET_KEY))
    } catch {
      return readInkPresets(null)
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(presets))
    } catch {
      /* Drawing works when browser storage is unavailable. */
    }
  }, [presets])
  const selectPreset = (index: number) => {
    if (!presets[index]) return
    setSelectedPreset(index)
    setTool(presets[index]!.tool)
  }
  const updatePreset = (patch: Partial<Pick<InkPreset, 'color' | 'width'>>) => {
    setPresets((current) =>
      current.map((item, i) => (i === selectedPreset ? { ...item, ...patch } : item)),
    )
    setTool(presets[selectedPreset]!.tool)
  }
  return { tool, setTool, presets, selectedPreset, selectPreset, updatePreset }
}
export type PptxInkSettings = ReturnType<typeof usePptxInkSettings>
function PenIcon({ preset }: { preset: InkPreset }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d={preset.tool === 'pen' ? 'm4 13 9-10 4 4-10 9-4 1Z' : 'm4 11 7-8 6 5-7 8H6Z'}
        fill={`#${preset.color}`}
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M3 18h13"
        stroke={`#${preset.color}`}
        strokeWidth={preset.tool === 'pen' ? 2 : 4}
        opacity={preset.tool === 'pen' ? 1 : 0.45}
      />
    </svg>
  )
}
export function PptxInkControls({
  tool,
  setTool,
  presets,
  selectedPreset,
  selectPreset,
  updatePreset,
  count,
  disabled,
  clear,
}: PptxInkSettings & { count: number; disabled: boolean; clear: () => Promise<boolean> }) {
  const preset = presets[selectedPreset]!
  const names = ['笔1', '笔2', '笔3', '荧光笔4', '荧光笔5']
  return (
    <div className="mimir-pptx-ink-controls">
      <ToolbarButton
        label="选择对象（退出绘图）"
        active={tool === 'select'}
        disabled={disabled}
        disabledReason="正在处理幻灯片"
        onClick={() => setTool('select')}
      >
        选择
      </ToolbarButton>
      {presets.map((entry, index) => (
        <ToolbarButton
          key={names[index]}
          label={`${entry.tool === 'pen' ? '笔' : '荧光笔'}预设${index + 1}（#${entry.color}，${entry.width}px）`}
          active={tool === entry.tool && selectedPreset === index}
          disabled={disabled}
          disabledReason="正在处理幻灯片"
          onClick={() => selectPreset(index)}
        >
          <PenIcon preset={entry} />
          <span className="me-sr-only">{names[index]}</span>
        </ToolbarButton>
      ))}
      <ToolbarButton
        label="橡皮擦（整笔擦除）"
        active={tool === 'eraser'}
        disabled={disabled}
        disabledReason="正在处理幻灯片"
        onClick={() => setTool('eraser')}
      >
        橡皮擦
      </ToolbarButton>
      <ToolbarMenu
        label="笔迹设置"
        text="笔迹设置"
        panelWidth={240}
        renderPanel={() => (
          <>
            <ToolbarMenuFields
              label={`预设${selectedPreset + 1} · ${preset.tool === 'pen' ? '笔' : '荧光笔'}`}
            >
              <ToolbarColorPicker
                label="笔迹颜色"
                value={`#${preset.color}`}
                options={INK_COLORS.map((color) => ({
                  value: `#${color}`,
                  label: `#${color}`,
                  swatch: `#${color}`,
                }))}
                inline
                disabled={disabled}
                onPick={(color) => updatePreset({ color: color.replace('#', '') })}
              />
              <ToolbarSelect
                label="笔迹粗细（px）"
                value={String(preset.width)}
                disabled={disabled}
                options={(preset.tool === 'pen' ? PEN_WIDTHS : HIGHLIGHTER_WIDTHS).map((width) => ({
                  value: String(width),
                  label: `${width} px`,
                }))}
                onChange={(width) => updatePreset({ width: Number(width) })}
              />
            </ToolbarMenuFields>
            <ToolbarMenuNote>
              当前：#{preset.color} · {preset.width} px
              {preset.tool === 'highlighter' ? ' · 45% 不透明度' : ''}。设置自动记住。
            </ToolbarMenuNote>
          </>
        )}
      />
      <ToolbarButton
        label="清除本页全部笔迹"
        disabled={disabled || count === 0}
        disabledReason={disabled ? '正在处理幻灯片' : '当前页没有可识别的笔迹'}
        onClick={() => {
          void clear()
        }}
      >
        清除笔迹（{count}）
      </ToolbarButton>
    </div>
  )
}
