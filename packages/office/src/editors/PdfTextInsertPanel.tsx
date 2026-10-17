import { Check, Trash2, X } from 'lucide-react'
import {
  ToolbarButton,
  ToolbarConfirm,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import './pdf-text-controls.css'

export interface PdfInsertDraft {
  text: string
  fontSize: number
  color: string
  font: '' | 'arial' | 'times' | 'courier'
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  maxWidth: number
  x?: number
  y?: number
}
const NO_INSERT_OPTIONS: { value: string; label: string }[] = []
export function PdfTextInsertPanel({
  value,
  onChange,
  busy,
  error,
  page,
  onApply,
  onClose,
  selectedId,
  options = NO_INSERT_OPTIONS,
  onSelect,
  onDelete,
}: {
  value: PdfInsertDraft
  onChange(value: PdfInsertDraft): void
  busy: boolean
  error?: string | null
  page: number
  onApply(): void
  onClose(): void
  selectedId?: string
  options?: { value: string; label: string }[]
  onSelect?(id: string): void
  onDelete?(): void
}) {
  const update = (patch: Partial<PdfInsertDraft>) => onChange({ ...value, ...patch })
  const invalid =
    !value.text.trim() || value.text.length > 10000 || !/^#[0-9a-fA-F]{6}$/.test(value.color)
  return (
    <section
      className="mimir-pdf-panel mimir-pdf-text-controls"
      aria-label={selectedId ? '待保存文字面板' : '插入文字面板'}
    >
      <header className="mimir-pdf-inspector__header">
        <div>
          <h2>{selectedId ? '编辑插字' : '插入文字'}</h2>
          <span className="mimir-pdf-inspector__meta">第 {page} 页 · pt</span>
        </div>
        <ToolbarButton label="关闭文字面板" onClick={onClose}>
          <X />
        </ToolbarButton>
      </header>
      <div className="mimir-pdf-inspector__content">
        {selectedId && onSelect && (
          <label className="mimir-pdf-inspector__control">
            <span>待保存文字</span>
            <ToolbarSelect
              label="待保存文字"
              value={selectedId}
              options={options}
              onChange={onSelect}
              disabled={busy}
            />
          </label>
        )}
        <label className="mimir-pdf-inspector__control">
          <span>文字</span>
          <ToolbarTextArea
            label={selectedId ? '插入文字内容' : '要插入的文字'}
            value={value.text}
            onChange={(text) => {
              if (!busy) update({ text })
            }}
          />
        </label>
        <div className="mimir-pdf-inspector__grid">
          <label className="mimir-pdf-inspector__control">
            <span>字体</span>
            <ToolbarSelect
              label="插字字体"
              value={value.font}
              options={[
                { value: '', label: '自动' },
                { value: 'arial', label: 'Arial' },
                { value: 'times', label: 'Times' },
                { value: 'courier', label: 'Courier' },
              ]}
              onChange={(font: PdfInsertDraft['font']) => update({ font })}
              disabled={busy}
            />
          </label>
          <label className="mimir-pdf-inspector__control">
            <span>字号</span>
            <ToolbarNumberField
              label="文字字号"
              value={value.fontSize}
              min={1}
              max={500}
              onCommit={(fontSize) => update({ fontSize })}
              disabled={busy}
            />
          </label>
          <label className="mimir-pdf-inspector__control">
            <span>对齐</span>
            <ToolbarSelect
              label="插字对齐"
              value={value.align}
              options={[
                { value: 'left', label: '左对齐' },
                { value: 'center', label: '居中' },
                { value: 'right', label: '右对齐' },
              ]}
              onChange={(align: PdfInsertDraft['align']) => update({ align })}
              disabled={busy}
            />
          </label>
          <label className="mimir-pdf-inspector__control">
            <span>换行宽度 · 0 为不换行</span>
            <ToolbarNumberField
              label="文字换行宽度"
              value={value.maxWidth}
              min={0}
              max={14400}
              onCommit={(maxWidth) => update({ maxWidth })}
              disabled={busy}
            />
          </label>
        </div>
        <div className="mimir-pdf-text-controls__style">
          <ToolbarButton
            label="插字粗体"
            active={value.bold}
            onClick={() => update({ bold: !value.bold })}
            disabled={busy}
          >
            粗体
          </ToolbarButton>
          <ToolbarButton
            label="插字斜体"
            active={value.italic}
            onClick={() => update({ italic: !value.italic })}
            disabled={busy}
          >
            斜体
          </ToolbarButton>
        </div>
        <label className="mimir-pdf-inspector__control">
          <span>颜色 · #RRGGBB</span>
          <ToolbarTextField
            label="文字颜色"
            value={value.color}
            onChange={(color) => {
              if (!busy) update({ color })
            }}
          />
        </label>
        {value.x !== undefined && value.y !== undefined ? (
          <div className="mimir-pdf-inspector__grid">
            <label className="mimir-pdf-inspector__control">
              <span>X</span>
              <ToolbarNumberField
                label="文字 X 坐标"
                value={value.x}
                min={0}
                max={14400}
                onCommit={(x) => update({ x })}
                disabled={busy}
              />
            </label>
            <label className="mimir-pdf-inspector__control">
              <span>Y</span>
              <ToolbarNumberField
                label="文字 Y 坐标"
                value={value.y}
                min={0}
                max={14400}
                onCommit={(y) => update({ y })}
                disabled={busy}
              />
            </label>
          </div>
        ) : (
          <p className="mimir-pdf-inspector__hint">默认放在页面顶部居中，也可点击纸面选择位置。</p>
        )}
        <p className="mimir-pdf-inspector__hint">
          中文使用覆盖对应字形的字体。换行与对齐按实际 PDF 字体计算。
        </p>
      </div>
      <div className="mimir-pdf-text-controls__footer">
        {error && (
          <p role="alert" className="mimir-pdf-inspector__error">
            {error}
          </p>
        )}
        <div className="mimir-pdf-text-controls__actions">
          {onDelete && (
            <ToolbarConfirm
              title="删除这段待保存文字？"
              description="删除后可撤销，尚未保存到原件。"
              confirmLabel="删除文字"
              onConfirm={onDelete}
            >
              <ToolbarButton label="删除插入文字" disabled={busy}>
                <Trash2 />
              </ToolbarButton>
            </ToolbarConfirm>
          )}
          <ToolbarButton
            primary
            label={selectedId ? '更新插入文字' : '插入到页面'}
            disabled={busy || invalid}
            disabledReason={busy ? '文字正在写入' : '请输入有效文字与颜色'}
            onClick={onApply}
          >
            <Check />
          </ToolbarButton>
        </div>
      </div>
    </section>
  )
}
