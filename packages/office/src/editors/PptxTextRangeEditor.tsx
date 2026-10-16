import { Input } from 'antd'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { Paragraph } from '../../vendor/packages/pptx-engine/src/types.js'
import type { EditParagraph } from '../../vendor/packages/pptx-ops/src/types.js'
import {
  editPptxTextValue,
  normalizePptxTextSelection,
  pptxTextValue,
  type PptxRunFormat,
  type PptxTextSelection,
} from '../pptx-text-range.js'
import './pptx-text-range.css'

export interface PptxTextSelectionEvent {
  targetKey: string
  version: number
  selection: PptxTextSelection | null
}
export interface PptxTextRangeEditorProps {
  paragraphs: readonly Paragraph[]
  targetKey: string
  version: number
  disabled?: boolean
  selection: PptxTextSelection | null
  pendingFormat?: PptxRunFormat
  onSelectionChange: (event: PptxTextSelectionEvent) => void
  onEdit: (paragraphs: EditParagraph[], event: PptxTextSelectionEvent) => void
}

/** Native selection spans the whole text box, including paragraph boundaries. */
export function PptxTextRangeEditor({
  paragraphs,
  targetKey,
  version,
  disabled = false,
  selection,
  pendingFormat,
  onSelectionChange,
  onEdit,
}: PptxTextRangeEditorProps) {
  const hintId = useId()
  const [composition, setComposition] = useState<{
    targetKey: string
    version: number
    value: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const softBreak = useRef(false)
  const inputRange = useRef<{
    targetKey: string
    version: number
    selection: PptxTextSelection
    inputType?: string
  } | null>(null)
  const text = pptxTextValue(paragraphs)
  const draft =
    composition?.targetKey === targetKey && composition.version === version
      ? composition.value
      : null
  const value = draft ?? text
  const emitSelection = (node: HTMLTextAreaElement) => {
    if (composing.current || disabled) return
    inputRange.current = {
      targetKey,
      version,
      selection: {
        start: node.selectionStart,
        end: node.selectionEnd,
        direction: node.selectionDirection,
      },
    }
    onSelectionChange({
      targetKey,
      version,
      selection: normalizePptxTextSelection(paragraphs, {
        start: node.selectionStart,
        end: node.selectionEnd,
        direction: node.selectionDirection,
      }),
    })
  }
  const edit = (node: HTMLTextAreaElement) => {
    if (disabled) return
    const nextSelection: PptxTextSelection = {
      start: node.selectionStart,
      end: node.selectionEnd,
      direction: node.selectionDirection,
    }
    try {
      const prior = inputRange.current
      const validPrior = prior?.targetKey === targetKey && prior.version === version ? prior : null
      const next = editPptxTextValue(
        paragraphs,
        node.value,
        pendingFormat,
        softBreak.current,
        validPrior?.selection,
        validPrior?.inputType,
      )
      softBreak.current = false
      onEdit(next, { targetKey, version, selection: nextSelection })
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '文字修改失败，请重新选择文字')
    }
  }
  useLayoutEffect(() => {
    const node = container.current?.querySelector('textarea')
    if (
      !node ||
      composing.current ||
      node.dataset.textTarget !== targetKey ||
      node.dataset.textVersion !== String(version)
    )
      return
    if (selection) {
      if (
        node.selectionStart !== selection.start ||
        node.selectionEnd !== selection.end ||
        node.selectionDirection !== (selection.direction ?? 'none')
      ) {
        node.setSelectionRange(selection.start, selection.end, selection.direction)
      }
    } else if (document.activeElement !== node) node.setSelectionRange(0, 0)
  }, [selection, targetKey, version])
  const scope = selection
    ? selection.start === selection.end
      ? '插入点格式'
      : `已选 ${Array.from(text.slice(selection.start, selection.end)).length} 个字符`
    : '整个文本框'
  return (
    <div className="mimir-pptx-text-range" ref={container}>
      <div className="mimir-pptx-text-range__head">
        <label htmlFor={`${hintId}-input`}>文字</label>
        <span aria-live="polite">{scope}</span>
      </div>
      <Input.TextArea
        id={`${hintId}-input`}
        aria-label="文本框文字"
        data-text-target={targetKey}
        data-text-version={version}
        aria-describedby={hintId}
        value={value}
        autoSize={{ minRows: 2, maxRows: 5 }}
        disabled={disabled}
        onSelect={(event) => emitSelection(event.currentTarget)}
        onPointerUp={(event) => emitSelection(event.currentTarget)}
        onKeyUp={(event) => emitSelection(event.currentTarget)}
        onFocus={(event) => emitSelection(event.currentTarget)}
        onBeforeInput={(event) => {
          inputRange.current = {
            targetKey,
            version,
            selection: {
              start: event.currentTarget.selectionStart,
              end: event.currentTarget.selectionEnd,
            },
            inputType: (event.nativeEvent as InputEvent).inputType,
          }
        }}
        onKeyDown={(event) => {
          inputRange.current = {
            targetKey,
            version,
            selection: {
              start: event.currentTarget.selectionStart,
              end: event.currentTarget.selectionEnd,
            },
            inputType:
              event.key === 'Backspace'
                ? 'deleteContentBackward'
                : event.key === 'Delete'
                  ? 'deleteContentForward'
                  : undefined,
          }
          if (event.key === 'Enter') softBreak.current = event.shiftKey
          if (event.key === 'Escape' && !composing.current && !event.nativeEvent.isComposing) {
            event.preventDefault()
            event.stopPropagation()
            onSelectionChange({ targetKey, version, selection: null })
            event.currentTarget.blur()
          }
        }}
        onCompositionStart={() => {
          composing.current = true
          setComposition({ targetKey, version, value: text })
        }}
        onCompositionEnd={(event) => {
          composing.current = false
          const valid = composition?.targetKey === targetKey && composition.version === version
          setComposition(null)
          if (valid) edit(event.currentTarget)
        }}
        onChange={(event) => {
          if (composing.current) {
            setComposition((current) =>
              current && current.targetKey === targetKey && current.version === version
                ? { ...current, value: event.target.value }
                : null,
            )
          } else edit(event.target)
        }}
      />
      <div id={hintId} className="mimir-pptx-text-range__hint">
        选择文字后设置格式 · Enter 分段 · Shift+Enter 换行 · Esc 返回整框
      </div>
      {error && (
        <div role="alert" className="mimir-pptx-text-range__error">
          {error}
        </div>
      )}
    </div>
  )
}
