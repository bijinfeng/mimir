import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import type { TextElement } from '../../vendor/packages/pptx-engine/src/types.js'
import { ToolbarButton, ToolbarMenuNote, ToolbarTextArea } from '../shell/EditorShell.js'
import { editPptxTextValue, pptxTextValue } from '../pptx-text-range.js'

export interface PptxGroupTextControlsProps {
  element: TextElement
  target: { slide: number; el: string }
  group: string
  version: number
  applyOps: (ops: Record<string, unknown>[]) => Promise<boolean>
  disabled?: boolean
}
interface CaretTransfer {
  text: string
  start: number
  end: number
  direction: 'forward' | 'backward' | 'none'
}
/** A property draft stays local until one version-checked native setText transaction. */
export function PptxGroupTextControls(props: PptxGroupTextControlsProps) {
  const currentText = props.element.text ? pptxTextValue(props.element.text.paragraphs) : ''
  const container = useRef<HTMLElement>(null)
  const transfer = useRef<(CaretTransfer & { sourceVersion: number }) | null>(null)
  const acceptedCaret = useRef<CaretTransfer | null>(null)
  const binding = JSON.stringify([
    props.target.slide,
    props.target.el,
    props.group,
    props.version,
    currentText,
  ])
  useLayoutEffect(() => {
    if (acceptedCaret.current?.text !== currentText) acceptedCaret.current = null
    if (
      transfer.current &&
      props.version !== transfer.current.sourceVersion &&
      transfer.current.text !== currentText
    ) {
      transfer.current = null
    }
    if (props.disabled) return
    const area = container.current?.querySelector('textarea')
    const submitted = transfer.current?.text === currentText ? transfer.current : null
    const caret = submitted ?? acceptedCaret.current
    if (!area || !caret) return
    if (submitted) {
      transfer.current = null
      acceptedCaret.current = caret
      if (
        document.activeElement === document.body ||
        container.current?.contains(document.activeElement)
      )
        area.focus()
    }
    area.setSelectionRange(caret.start, caret.end, caret.direction)
  }, [props.disabled, props.version, currentText])
  const rememberAcceptedCaret = (target: EventTarget) => {
    if (!(target instanceof HTMLTextAreaElement) || target.value !== currentText) return
    acceptedCaret.current = {
      text: currentText,
      start: target.selectionStart,
      end: target.selectionEnd,
      direction: target.selectionDirection,
    }
  }
  if (!props.element.text) return null
  return (
    <section
      ref={container}
      className="mimir-pptx-selection-controls__group-text"
      aria-label="组合成员文字"
      onBlurCapture={(event) => rememberAcceptedCaret(event.target)}
      onSelectCapture={(event) => rememberAcceptedCaret(event.target)}
    >
      <GroupTextDraft
        key={binding}
        {...props}
        currentText={currentText}
        onTransfer={(caret) => {
          transfer.current = caret ? { ...caret, sourceVersion: props.version } : null
        }}
      />
    </section>
  )
}
function GroupTextDraft({
  element,
  target,
  group,
  applyOps,
  disabled = false,
  currentText,
  onTransfer,
}: PptxGroupTextControlsProps & {
  currentText: string
  onTransfer: (caret: CaretTransfer | null) => void
}) {
  const [draft, setDraft] = useState(currentText)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const pending = useRef<AbortController | null>(null)
  const fields = useRef<HTMLFieldSetElement>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const dirty = draft !== currentText
  const locked = disabled || busy
  const submit = async () => {
    if (locked || pending.current || !dirty || !element.text) return
    let paragraphs
    try {
      paragraphs = editPptxTextValue(element.text.paragraphs, draft)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文字草稿无法应用，请调整内容')
      return
    }
    const area = fields.current?.querySelector('textarea')
    onTransfer({
      text: draft,
      start: area?.selectionStart ?? draft.length,
      end: area?.selectionEnd ?? draft.length,
      direction: area?.selectionDirection ?? 'none',
    })
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const ok = await applyOps([{ op: 'setText', target, group, paragraphs }])
      if (controller.signal.aborted) return
      if (ok) {
        setStatus('文字已应用')
        setDraft(draft)
      } else {
        onTransfer(null)
        setError('文字未应用，已保留草稿，请重试')
      }
    } catch {
      if (!controller.signal.aborted) {
        onTransfer(null)
        setError('文字未应用，已保留草稿，请重试')
      }
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  return (
    <fieldset
      ref={fields}
      className="mimir-pptx-selection-controls__group-text-draft"
      disabled={locked}
      aria-busy={busy}
    >
      <strong>组合成员文字</strong>
      <ToolbarMenuNote>
        {busy
          ? '正在应用文字…'
          : dirty
            ? '文字草稿未应用；保存不包含此草稿。关闭面板会丢弃。'
            : status || '修改后点击应用，文字格式保持原有来源。'}
      </ToolbarMenuNote>
      <ToolbarTextArea
        label="文本框文字"
        rows={3}
        value={draft}
        onChange={(value) => {
          if (!locked) {
            setDraft(value)
            setError('')
            setStatus('')
          }
        }}
      />
      <div className="mimir-pptx-selection-controls__selection-actions">
        <ToolbarButton
          label={busy ? '正在应用成员文字' : '应用成员文字'}
          primary
          disabled={locked || !dirty}
          disabledReason={busy ? '正在应用文字' : '请先修改成员文字'}
          onClick={() => void submit()}
        >
          <Check size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="取消文字草稿"
          disabled={locked || !dirty}
          onClick={() => {
            onTransfer(null)
            setDraft(currentText)
            setError('')
            setStatus('')
          }}
        >
          <RotateCcw size={14} />
          取消
        </ToolbarButton>
      </div>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  )
}
