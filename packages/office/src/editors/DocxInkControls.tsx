import { useCallback, useSyncExternalStore, useState, type ReactNode } from 'react'
import { MousePointer2, PenLine, Highlighter, Eraser, Trash2, X, Check } from 'lucide-react'
import {
  ToolbarButton,
  ToolbarColorPicker,
  ToolbarNumberField,
  ToolbarMenuFields,
  ToolbarPropertyForm,
  ToolbarMenuNote,
} from '../shell/EditorShell.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
import { inkAnnotations } from '../docx-ink-model.js'
import { removeDocxInk, type InkController } from './docx-ink.js'
import './docx-ink.css'
const INK_COLORS = ['1F2937', 'C00000', '4472C4', '70AD47', 'FFE066', 'FFC000', 'FFFFFF'].map(
  (value) => ({ value, label: `#${value}`, swatch: `#${value}` }),
)
export function useInkUi(controller: InkController) {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot)
}
export function DocxInkRibbon({
  controller,
  disabled,
  reason,
  settings,
}: {
  controller: InkController
  disabled: boolean
  reason: string | null
  settings: ReactNode
}) {
  const ui = useInkUi(controller)
  return (
    <>
      {(
        [
          ['select', '选择笔迹', MousePointer2],
          ['pen', '笔', PenLine],
          ['highlighter', '荧光笔', Highlighter],
          ['eraser', '逐笔擦除', Eraser],
        ] as const
      ).map(([tool, label, Icon]) => (
        <ToolbarButton
          key={tool}
          label={label}
          active={ui.enabled && ui.tool === tool}
          disabled={disabled || !!reason}
          disabledReason={reason ?? '文档还没读完'}
          onClick={() => controller.update({ enabled: true, tool, selected: null })}
        >
          <Icon size={14} />
          <span>{label}</span>
        </ToolbarButton>
      ))}
      {settings}
      {ui.enabled && (
        <ToolbarButton
          label="退出绘图"
          onClick={() => controller.update({ enabled: false, selected: null })}
        >
          <X size={14} />
          <span>退出</span>
        </ToolbarButton>
      )}
    </>
  )
}
export function DocxInkControls({
  context,
  controller,
  reason,
}: {
  context: DocxAdvancedContext
  controller: InkController
  reason: string | null
}) {
  const { editor } = context,
    ui = useInkUi(controller)
  const subscribe = useCallback(
    (notify: () => void) => {
      editor.on('transaction', notify)
      return () => {
        editor.off('transaction', notify)
      }
    },
    [editor],
  )
  const read = useCallback(() => editor.state.doc, [editor])
  const doc = useSyncExternalStore(subscribe, read)
  const active = new Set<string>()
  doc.forEach((node) => {
    if (typeof node.attrs.mimirInkAnchor === 'string') active.add(node.attrs.mimirInkAnchor)
  })
  const retained = inkAnnotations(doc).filter((ink) => active.has(ink.anchor))
  const strokes = retained.filter((ink) => !!ink.stroke)
  const selected = strokes.find((ink) => ink.id === ui.selected)
  const [confirmClear, setConfirmClear] = useState(false),
    [error, setError] = useState('')
  const remove = (ids: string[]) => {
    try {
      removeDocxInk(editor, editor.state.doc, ids)
      controller.update({ selected: null })
      setError('')
      setConfirmClear(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return (
    <div className="mimir-docx-ink-settings">
      <div className="mimir-docx-ink-settings__scroll">
        {reason && <p role="status">{reason}</p>}
        <ToolbarPropertyForm>
          <ToolbarMenuFields label="笔">
            <ToolbarColorPicker
              label="笔颜色"
              value={ui.penColor}
              options={INK_COLORS}
              allowCustomRgb
              onPick={(color) => {
                if (color) controller.update({ penColor: color.replace('#', '').toUpperCase() })
              }}
            />
            <ToolbarNumberField
              label="笔宽度"
              value={ui.penWidth}
              min={0.5}
              max={64}
              step={0.5}
              suffix="px"
              onCommit={(value) => {
                if (value !== null) controller.update({ penWidth: value })
              }}
            />
          </ToolbarMenuFields>
          <ToolbarMenuFields label="荧光笔">
            <ToolbarColorPicker
              label="荧光笔颜色"
              value={ui.highlighterColor}
              options={INK_COLORS}
              allowCustomRgb
              onPick={(color) => {
                if (color)
                  controller.update({ highlighterColor: color.replace('#', '').toUpperCase() })
              }}
            />
            <ToolbarNumberField
              label="荧光笔宽度"
              value={ui.highlighterWidth}
              min={0.5}
              max={64}
              step={0.5}
              suffix="px"
              onCommit={(value) => {
                if (value !== null) controller.update({ highlighterWidth: value })
              }}
            />
          </ToolbarMenuFields>
        </ToolbarPropertyForm>
        <div className="mimir-docx-ink-settings__summary">
          <span>{reason ? `${retained.length} 笔原有墨迹` : `${strokes.length} 笔可编辑墨迹`}</span>
          <span>
            {selected
              ? `已选：${selected.stroke?.tool === 'highlighter' ? '荧光笔' : '笔'} · ${selected.stroke?.width}px · #${selected.stroke?.color}`
              : '未选择笔迹'}
          </span>
        </div>
        <ToolbarMenuNote>
          笔迹随锚定段落移动。选择或擦除只作用于本编辑器可识别的笔迹；正文图片保持原样。
        </ToolbarMenuNote>
      </div>
      <div className="mimir-docx-ink-settings__actions">
        {error && <p role="alert">{error}</p>}
        {confirmClear ? (
          <>
            <p>清除全部 {strokes.length} 笔墨迹？可通过撤销恢复。</p>
            <div>
              <ToolbarButton label="取消清除笔迹" onClick={() => setConfirmClear(false)}>
                <X size={14} />
                <span>取消</span>
              </ToolbarButton>
              <ToolbarButton
                label="确认清除笔迹"
                disabled={!!reason || !strokes.length}
                onClick={() => remove(strokes.map((ink) => ink.id))}
              >
                <Check size={14} />
                <span>确认清除</span>
              </ToolbarButton>
            </div>
          </>
        ) : (
          <div>
            <ToolbarButton
              label="删除选中笔迹"
              disabled={!!reason || !selected}
              disabledReason={reason ?? '请先在画布选择一笔墨迹'}
              onClick={() => selected && remove([selected.id])}
            >
              <Trash2 size={14} />
              <span>删除选中</span>
            </ToolbarButton>
            <ToolbarButton
              label="清除全部笔迹"
              disabled={!!reason || !strokes.length}
              disabledReason={reason ?? '当前没有可编辑笔迹'}
              onClick={() => setConfirmClear(true)}
            >
              <Eraser size={14} />
              <span>清除全部</span>
            </ToolbarButton>
          </div>
        )}
      </div>
    </div>
  )
}
