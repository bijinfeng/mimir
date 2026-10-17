import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { XlsxSheet } from '../xlsx.js'
import type { XlsxValidationOptions } from '@mimir/shared'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import './xlsx-validation.css'

export function XlsxValidationOptionsControls({
  sheet,
  busy,
  trigger,
  sourceKey,
  version,
  onClose,
  onApply,
}: {
  sheet: XlsxSheet
  busy: boolean
  trigger: HTMLButtonElement | null
  sourceKey: unknown
  version: number
  onClose: () => void
  onApply: (operation: unknown, signal: AbortSignal) => Promise<boolean>
}) {
  const rules = sheet.extras?.validations ?? []
  const [sourceAtOpen] = useState(() => sourceKey)
  const stale = sourceAtOpen !== sourceKey
  const [index, setIndex] = useState('0')
  const rule = rules[Number(index)]
  const panel = useRef<HTMLElement>(null)
  const liveTrigger = useRef(trigger)
  useLayoutEffect(() => {
    liveTrigger.current = trigger
  }, [trigger])
  const [footer, setFooter] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (stale) onClose()
  }, [stale, onClose])
  useEffect(() => {
    const node = panel.current
    const editor = node?.closest('.mimir-editor')
    node?.focus()
    return () => {
      const active = document.activeElement
      if (
        (active === document.body || active === node || node?.contains(active)) &&
        (liveTrigger.current?.isConnected || editor?.isConnected)
      )
        (liveTrigger.current?.isConnected
          ? liveTrigger.current
          : editor?.querySelector<HTMLButtonElement>(
              'button[aria-label="数据验证提示设置"], button[aria-label="数据规则"]',
            )
        )?.focus()
    }
  }, [])
  if (stale) return null
  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label="数据验证提示设置"
      className="mimir-xlsx-inspector mimir-xlsx-validation-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="mimir-xlsx-inspector__header">
        <h2>数据验证提示</h2>
        <ToolbarButton label="关闭数据验证提示设置" onClick={onClose}>
          <X size={16} />
        </ToolbarButton>
      </header>
      <div className="mimir-xlsx-inspector__content">
        <ToolbarPropertyForm columns={1}>
          <ToolbarMenuNote>{sheet.name}</ToolbarMenuNote>
          <ToolbarSelect
            label="原件验证规则"
            value={index}
            disabled={busy || !rules.length}
            options={rules.map((item, at) => ({
              value: String(at),
              label: `${item.range} · ${item.type}`,
            }))}
            onChange={setIndex}
          />
          {rule ? (
            <ValidationDraft
              key={`${rule.xml ?? index}:${version}`}
              footer={footer}
              rule={rule}
              sheetId={sheet.id}
              busy={busy || !!sheet.extras?.protected}
              onApply={onApply}
            />
          ) : (
            <ToolbarMenuNote>当前工作表没有数据验证规则。请先从数据规则中添加。</ToolbarMenuNote>
          )}
        </ToolbarPropertyForm>
      </div>
      <footer ref={setFooter} className="mimir-xlsx-inspector__footer" />
    </aside>
  )
}
function ValidationDraft({
  rule,
  sheetId,
  busy,
  onApply,
  footer,
}: {
  footer: HTMLElement | null
  rule: NonNullable<NonNullable<XlsxSheet['extras']>['validations']>[number]
  sheetId: string
  busy: boolean
  onApply: (operation: unknown, signal: AbortSignal) => Promise<boolean>
}) {
  const initial: XlsxValidationOptions = {
    showErrorMessage: rule.showErrorMessage ?? false,
    errorStyle: ['stop', 'warning', 'information'].includes(rule.errorStyle ?? '')
      ? (rule.errorStyle as XlsxValidationOptions['errorStyle'])
      : 'stop',
    errorTitle: rule.errorTitle ?? '',
    error: rule.error,
    showInputMessage: rule.showInputMessage ?? false,
    promptTitle: rule.promptTitle ?? '',
    prompt: rule.prompt ?? '',
    showDropDown: !rule.showDropDown,
  }
  const [options, setOptions] = useState(initial),
    [pending, setPending] = useState(false),
    [feedback, setFeedback] = useState('')
  const request = useRef<AbortController | null>(null),
    lock = useRef(false)
  useLayoutEffect(() => () => request.current?.abort(), [])
  const changed = JSON.stringify(options) !== JSON.stringify(initial)
  const unsupported =
    rule.unsupported ||
    !rule.xml ||
    !['none', 'list', 'whole', 'decimal', 'date', 'time', 'textLength', 'custom'].includes(
      rule.type,
    ) ||
    !['stop', 'warning', 'information'].includes(rule.errorStyle ?? 'stop')
  const update = (next: Partial<XlsxValidationOptions>) => {
    setOptions({ ...options, ...next })
    setFeedback('')
  }
  const apply = async () => {
    if (lock.current || busy || unsupported || !changed) return
    lock.current = true
    setPending(true)
    const controller = new AbortController()
    request.current = controller
    try {
      if (
        await onApply(
          { op: 'edit_validation_options', sheetId, ruleXml: rule.xml, options },
          controller.signal,
        )
      )
        setFeedback('已应用')
    } finally {
      lock.current = false
      if (!controller.signal.aborted) setPending(false)
    }
  }
  return (
    <>
      <ToolbarMenuNote>
        {rule.formula1}
        {rule.formula2 ? ` ～ ${rule.formula2}` : ''}
      </ToolbarMenuNote>
      {unsupported && (
        <ToolbarMenuNote>原件规则包含暂不支持的结构，无法可靠修改提示。</ToolbarMenuNote>
      )}
      <fieldset disabled={!!busy || pending || !!unsupported}>
        <ToolbarMenuFields label="选择单元格时">
          <ToolbarSelect
            label="输入提示"
            disabled={!!busy || pending || !!unsupported}
            value={String(options.showInputMessage)}
            options={[
              { value: 'true', label: '显示提示' },
              { value: 'false', label: '不显示' },
            ]}
            onChange={(value) => update({ showInputMessage: value === 'true' })}
          />
          <ToolbarTextField
            label="提示标题（最多32字）"
            value={options.promptTitle}
            onChange={(value) => update({ promptTitle: value.slice(0, 32) })}
          />
          <ToolbarTextArea
            label="提示内容（最多255字）"
            value={options.prompt}
            onChange={(value) => update({ prompt: value.slice(0, 255) })}
          />
        </ToolbarMenuFields>
        <ToolbarMenuFields label="输入不符合规则时">
          <ToolbarSelect
            label="错误行为"
            disabled={!!busy || pending || !!unsupported}
            value={options.showErrorMessage ? options.errorStyle : 'off'}
            options={[
              { value: 'stop', label: '停止：阻止输入' },
              { value: 'warning', label: '警告：确认后继续' },
              { value: 'information', label: '信息：确认后继续' },
              { value: 'off', label: '不显示错误提示' },
            ]}
            onChange={(value) =>
              update(
                value === 'off'
                  ? { showErrorMessage: false }
                  : {
                      showErrorMessage: true,
                      errorStyle: value as XlsxValidationOptions['errorStyle'],
                    },
              )
            }
          />
          <ToolbarTextField
            label="错误标题（最多32字）"
            value={options.errorTitle}
            onChange={(value) => update({ errorTitle: value.slice(0, 32) })}
          />
          <ToolbarTextArea
            label="错误内容（最多255字）"
            value={options.error}
            onChange={(value) => update({ error: value.slice(0, 255) })}
          />
        </ToolbarMenuFields>
        {rule.type === 'list' && (
          <ToolbarSelect
            label="单元格下拉列表"
            disabled={!!busy || pending || !!unsupported}
            value={String(options.showDropDown)}
            options={[
              { value: 'true', label: '显示下拉入口' },
              { value: 'false', label: '隐藏下拉入口' },
            ]}
            onChange={(value) => update({ showDropDown: value === 'true' })}
          />
        )}
      </fieldset>
      {feedback && <ToolbarMenuNote>{feedback}</ToolbarMenuNote>}
      {footer &&
        createPortal(
          <ToolbarButton
            label={pending ? '正在应用提示' : '应用验证提示'}
            primary
            disabled={!!busy || pending || !!unsupported || !changed}
            disabledReason={unsupported ? '原件规则暂不支持编辑' : '没有改动或正在处理'}
            onClick={() => void apply()}
          />,
          footer,
        )}
    </>
  )
}
