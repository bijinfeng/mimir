import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  ToolbarButton,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import type { PdfPanelResult } from './PdfInspector.js'
import './pdf-text-controls.css'

export function PdfTextMarkupPanel({
  selectedText,
  page,
  getVersion,
  busy,
  blocked,
  onApply,
  onClose,
}: {
  selectedText: string
  page: number
  getVersion(): number
  busy: boolean
  blocked?: string
  onApply(
    args: Record<string, unknown>,
    version: number,
    signal: AbortSignal,
  ): Promise<(PdfPanelResult & { data?: unknown }) | undefined>
  onClose(): void
}) {
  const [text, setText] = useState(selectedText),
    [type, setType] = useState<'highlight' | 'underline' | 'strikeout'>('highlight'),
    [color, setColor] = useState('#FFE04D'),
    [all, setAll] = useState(false),
    [pending, setPending] = useState(false),
    [feedback, setFeedback] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const apply = async () => {
    if (request.current || busy || blocked || !text.trim() || !/^#[0-9a-fA-F]{6}$/.test(color))
      return
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setFeedback(null)
    try {
      const result = await onApply(
        { page, text, type, color, all },
        getVersion(),
        controller.signal,
      )
      if (!controller.signal.aborted)
        setFeedback(
          result?.ok
            ? `已添加 ${(result.data as { count?: number })?.count ?? 1} 处标注`
            : (result?.error ?? '标注失败，请重试'),
        )
    } catch (cause) {
      if (!controller.signal.aborted)
        setFeedback(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (request.current === controller) {
        request.current = null
        if (!controller.signal.aborted) setPending(false)
      }
    }
  }
  const disabled = busy || pending
  return (
    <section className="mimir-pdf-panel mimir-pdf-text-controls" aria-label="文字标注面板">
      <header className="mimir-pdf-inspector__header">
        <div>
          <h2>文字标注</h2>
          <span className="mimir-pdf-inspector__meta">第 {page} 页</span>
        </div>
        <ToolbarButton label="关闭文字标注" onClick={onClose}>
          <X />
        </ToolbarButton>
      </header>
      <div className="mimir-pdf-inspector__content">
        <label className="mimir-pdf-inspector__control">
          <span>原文片段</span>
          <ToolbarTextArea
            label="标注原文片段"
            value={text}
            onChange={(value) => {
              if (!disabled) setText(value)
            }}
          />
        </label>
        <label className="mimir-pdf-inspector__control">
          <span>标注类型</span>
          <ToolbarSelect
            label="文字标注类型"
            value={type}
            onChange={setType}
            options={[
              { value: 'highlight', label: '高亮' },
              { value: 'underline', label: '下划线' },
              { value: 'strikeout', label: '删除线' },
            ]}
            disabled={disabled}
          />
        </label>
        <label className="mimir-pdf-inspector__control">
          <span>颜色 · #RRGGBB</span>
          <ToolbarTextField
            label="标注颜色"
            value={color}
            onChange={(value) => {
              if (!disabled) setColor(value)
            }}
          />
        </label>
        <label className="mimir-pdf-inspector__control">
          <span>匹配范围</span>
          <ToolbarSelect
            label="文字标注范围"
            value={all ? 'all' : 'first'}
            options={[
              { value: 'first', label: '仅第一处' },
              { value: 'all', label: '当前页全部匹配' },
            ]}
            onChange={(value) => setAll(value === 'all')}
            disabled={disabled}
          />
        </label>
        <p className="mimir-pdf-inspector__hint">
          可点击纸面填入整段文字，再修改为部分片段。跨行按原文字形定位，扫描图片的临时 OCR
          不能用作标注目标。
        </p>
      </div>
      <div className="mimir-pdf-text-controls__footer">
        {(feedback || blocked) && (
          <p role="status" className="mimir-pdf-inspector__hint">
            {feedback ?? blocked}
          </p>
        )}
        <div className="mimir-pdf-text-controls__actions">
          <ToolbarButton
            primary
            label="添加标注"
            disabled={disabled || !!blocked || !text.trim() || !/^#[0-9a-fA-F]{6}$/.test(color)}
            disabledReason={blocked ?? '请输入原文片段与有效颜色'}
            onClick={() => void apply()}
          >
            <Check />
          </ToolbarButton>
        </div>
      </div>
    </section>
  )
}
