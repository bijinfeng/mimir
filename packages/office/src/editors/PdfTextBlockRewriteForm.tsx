import { Replace, RotateCcw, TextCursorInput, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PdfPageTextBlock, PdfTextBlockTarget } from '@mimir/shared'
import {
  ToolbarButton,
  ToolbarNumberField,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import type { PdfPanelResult } from './PdfInspector.js'
import { pdfTextOccurrences } from './pdf-text-blocks.js'

type RewriteBlock = PdfPageTextBlock & { format: NonNullable<PdfPageTextBlock['format']> }
export function PdfTextBlockRewriteForm({
  target,
  block,
  partial,
  version,
  getVersion,
  busy,
  onApply,
}: {
  target: PdfTextBlockTarget
  block: RewriteBlock
  partial: boolean
  version: number
  getVersion(): number
  busy: boolean
  onApply(
    tool: string,
    args: Record<string, unknown>,
    version: number,
    signal: AbortSignal,
  ): Promise<PdfPanelResult | undefined>
}) {
  const [text, setText] = useState(partial ? '' : block.text)
  const [oldText, setOldText] = useState('')
  const [occurrence, setOccurrence] = useState(1)
  const [fontSize, setFontSize] = useState(block.format.fontSize)
  const [align, setAlign] = useState(block.format.align)
  const [font, setFont] = useState('')
  const [color, setColor] = useState('')
  const [bold, setBold] = useState('')
  const [italic, setItalic] = useState('')
  const [pending, setPending] = useState(false)
  const [numberFocused, setNumberFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const matches = pdfTextOccurrences(block.text, oldText)
  const match = matches[occurrence - 1]
  const styleChanged =
    fontSize !== block.format.fontSize ||
    (!partial && align !== block.format.align) ||
    !!font ||
    !!color ||
    !!bold ||
    !!italic
  const deleting = !partial && !text.trim()
  const invalid =
    text.length > 10000 || oldText.length > 10000
      ? '文字不能超过 10000 字符'
      : color && !/^#[a-fA-F0-9]{6}$/.test(color)
        ? '颜色请使用 #RRGGBB 格式'
        : partial && !match
          ? oldText
            ? '当前段落没有指定次序的匹配'
            : '先输入要替换的原文'
          : null
  const unchanged = partial
    ? text === oldText && !styleChanged
    : text === block.text && !styleChanged
  const blocked = busy || pending
  const apply = async () => {
    if (request.current || blocked || invalid || unchanged) return
    if (getVersion() !== version) {
      setError('PDF 已变化，请重新核验段落')
      return
    }
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError(null)
    const args: Record<string, unknown> = {
      page: target.pageIndex + 1,
      target,
      new_text: deleting ? '' : text,
      ...(fontSize !== block.format.fontSize ? { font_size: fontSize } : {}),
      ...(!partial && align !== block.format.align ? { align } : {}),
      ...(font ? { font } : {}),
      ...(color ? { color } : {}),
      ...(bold ? { bold: bold === 'apply' } : {}),
      ...(italic ? { italic: italic === 'apply' } : {}),
      ...(partial ? { old_text: oldText, occurrence } : {}),
    }
    try {
      const result = await onApply(
        partial ? 'edit_text' : 'edit_block',
        args,
        version,
        controller.signal,
      )
      if (!controller.signal.aborted && !result?.ok)
        setError(result?.error ?? '原文修改未完成，请重试')
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (request.current === controller) {
        request.current = null
        if (!controller.signal.aborted) setPending(false)
      }
    }
  }
  const reset = () => {
    setText(partial ? '' : block.text)
    setOldText('')
    setOccurrence(1)
    setFontSize(block.format.fontSize)
    setAlign(block.format.align)
    setFont('')
    setColor('')
    setBold('')
    setItalic('')
    setError(null)
  }
  return (
    <>
      <div
        className="mimir-pdf-inspector__content"
        onFocusCapture={(event) =>
          setNumberFocused(
            event.target instanceof HTMLInputElement && !!event.target.closest('.me-input--num'),
          )
        }
        onBlurCapture={() => setNumberFocused(false)}
      >
        <fieldset className="mimir-pdf-text-block__fields" disabled={blocked}>
          {partial && (
            <>
              <ToolbarTextField
                label="要替换的原文"
                value={oldText}
                onChange={(value) => {
                  setOldText(value)
                  setOccurrence(1)
                }}
              />
              <label className="mimir-pdf-inspector__control">
                <span>匹配位置 · 共 {matches.length} 处</span>
                <ToolbarNumberField
                  label="替换第几处"
                  value={occurrence}
                  min={1}
                  max={Math.max(1, matches.length)}
                  disabled={blocked || !matches.length}
                  onCommit={setOccurrence}
                />
              </label>
              {match && (
                <p className="mimir-pdf-text-block__match" aria-label="替换位置预览">
                  {block.text.slice(Math.max(0, match.start - 24), match.start)}
                  <mark>{block.text.slice(match.start, match.end)}</mark>
                  {block.text.slice(match.end, match.end + 24)}
                </p>
              )}
            </>
          )}
          <ToolbarTextArea
            label={partial ? '替换为' : '段落新文字'}
            value={text}
            onChange={setText}
            rows={partial ? 3 : 6}
          />
          <p className="mimir-pdf-inspector__hint">
            {partial
              ? '仅替换指定匹配，不重排整段。留空只删除这处文字。'
              : deleting
                ? '将移除整段原文对象。可撤销，其他段落保持原位。'
                : '按原段宽度重排，向下扩展，其他内容保持原位；内容过长可能重叠。清空文字可删除整段。'}
          </p>
          <details className="mimir-pdf-text-block__format">
            <summary>文字格式</summary>
            <p className="mimir-pdf-inspector__meta">
              当前参考字号 {Math.round(block.format.fontSize * 100) / 100} pt · 行距{' '}
              {Math.round(block.format.leading * 100) / 100} pt
            </p>
            <label className="mimir-pdf-inspector__control">
              <span>字号 · pt</span>
              <ToolbarNumberField
                label="改写字号（pt）"
                value={fontSize}
                min={0.1}
                max={500}
                disabled={blocked || deleting}
                onCommit={setFontSize}
              />
            </label>
            <label className="mimir-pdf-inspector__control">
              <span>字体</span>
              <ToolbarSelect
                label="改写字体"
                value={font}
                disabled={blocked || deleting}
                options={[
                  { value: '', label: '保留原字体' },
                  { value: 'arial', label: 'Arial' },
                  { value: 'times', label: 'Times' },
                  { value: 'courier', label: 'Courier' },
                ]}
                onChange={setFont}
              />
            </label>
            {!partial && (
              <label className="mimir-pdf-inspector__control">
                <span>对齐</span>
                <ToolbarSelect
                  label="改写段落对齐"
                  value={align}
                  disabled={blocked || deleting}
                  options={[
                    { value: 'left', label: '左对齐' },
                    { value: 'center', label: '居中' },
                    { value: 'right', label: '右对齐' },
                  ]}
                  onChange={setAlign}
                />
              </label>
            )}
            <ToolbarTextField
              label="文字颜色（留空保留）"
              value={color}
              placeholder="#RRGGBB"
              onChange={setColor}
            />
            <div className="mimir-pdf-inspector__grid">
              <label className="mimir-pdf-inspector__control">
                <span>粗体</span>
                <ToolbarSelect
                  label="改写粗体"
                  value={bold}
                  disabled={blocked || deleting}
                  options={[
                    { value: '', label: '保留' },
                    { value: 'apply', label: '应用粗体' },
                    { value: 'clear', label: '取消粗体' },
                  ]}
                  onChange={setBold}
                />
              </label>
              <label className="mimir-pdf-inspector__control">
                <span>斜体</span>
                <ToolbarSelect
                  label="改写斜体"
                  value={italic}
                  disabled={blocked || deleting}
                  options={[
                    { value: '', label: '保留' },
                    { value: 'apply', label: '应用斜体' },
                    { value: 'clear', label: '取消斜体' },
                  ]}
                  onChange={setItalic}
                />
              </label>
            </div>
            <p className="mimir-pdf-inspector__hint">
              未改参数沿用原文；混合字体的参考字号来自原生对象。缺失字形会拒绝写入。
            </p>
          </details>
        </fieldset>
        {invalid && <p className="mimir-pdf-inspector__hint">{invalid}</p>}
        {error && (
          <p className="mimir-pdf-inspector__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="mimir-pdf-text-block__actions">
        <ToolbarButton label="重置原文修改" disabled={blocked} onClick={reset}>
          <RotateCcw size={16} />
          重置
        </ToolbarButton>
        <ToolbarButton
          label={deleting ? '删除整段' : partial ? '应用局部替换' : '应用段落改写'}
          primary
          disabled={blocked || !!invalid || (unchanged && !numberFocused)}
          disabledReason={blocked ? 'PDF 正在处理' : (invalid ?? '先修改文字或格式')}
          onClick={() => void apply()}
        >
          {deleting ? (
            <Trash2 size={16} />
          ) : partial ? (
            <Replace size={16} />
          ) : (
            <TextCursorInput size={16} />
          )}
        </ToolbarButton>
      </div>
    </>
  )
}
