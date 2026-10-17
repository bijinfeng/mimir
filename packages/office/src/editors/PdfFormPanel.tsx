import { Button, Checkbox, Input, Skeleton } from 'antd'
import { Check } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { PdfFormField, PdfFormSnapshot } from '@mimir/shared'
import { ToolbarSelect } from '../shell/EditorShell.js'
import { PdfInspectorHeader, type PdfPanelAction } from './PdfInspector.js'

const fieldType = {
  text: '文本',
  checkbox: '复选框',
  radio: '单选',
  choice: '下拉选项',
  unsupported: '不支持的类型',
}
const fieldText = (field: PdfFormField) =>
  Array.isArray(field.value)
    ? (field.value[0] ?? '')
    : typeof field.value === 'string'
      ? field.value
      : ''

function FieldEditor({
  field,
  busy,
  feedback,
  onApply,
  children,
  binding,
}: {
  field: PdfFormField
  busy: boolean
  feedback?: string
  onApply(value: { name: string; value?: string; checked?: boolean }): void
  children: ReactNode
  binding: string
}) {
  const [draft, setDraft] = useState({
    binding,
    text: fieldText(field),
    checked: field.value === true,
  })
  if (draft.binding !== binding)
    setDraft({ binding, text: fieldText(field), checked: field.value === true })
  const { text, checked } = draft
  const blocked = field.readOnly || field.type === 'unsupported'
  const changed = field.type === 'checkbox' ? checked !== field.value : text !== fieldText(field)
  const pages = [...new Set(field.widgets.map((widget) => widget.page))]
  return (
    <>
      <div className="mimir-pdf-inspector__content">
        {children}
        <div className="mimir-pdf-inspector__field">
          <div className="mimir-pdf-inspector__field-title">{field.name}</div>
          <p className="mimir-pdf-inspector__meta">
            {fieldType[field.type]} · 第 {pages.join('、')} 页{field.required ? ' · 必填' : ''}
          </p>
          {field.readOnly && <p className="mimir-pdf-inspector__hint">此字段为只读，无法修改。</p>}
          {field.type === 'unsupported' ? (
            <p className="mimir-pdf-inspector__hint">暂不支持编辑此字段类型。</p>
          ) : field.type === 'checkbox' ? (
            <Checkbox
              checked={checked}
              disabled={busy || blocked}
              onChange={(event) =>
                setDraft((value) => ({ ...value, checked: event.target.checked }))
              }
              aria-label="表单勾选值"
            >
              勾选此项
            </Checkbox>
          ) : field.type === 'text' ? (
            <label className="mimir-pdf-inspector__control">
              <span>字段内容</span>
              <Input.TextArea
                aria-label="表单文字值"
                value={text}
                onChange={(event) => setDraft((value) => ({ ...value, text: event.target.value }))}
                rows={3}
                disabled={busy || blocked}
                maxLength={10000}
              />
            </label>
          ) : (
            <div className="mimir-pdf-inspector__control">
              <span>字段选项</span>
              <ToolbarSelect
                label="表单选项值"
                value={text}
                options={[
                  { value: '', label: '清除选择' },
                  ...field.options.map((value) => ({ value, label: value })),
                ]}
                disabled={busy || blocked}
                onChange={(nextText) => setDraft((value) => ({ ...value, text: nextText }))}
              />
            </div>
          )}
        </div>
      </div>
      <footer className="mimir-pdf-inspector__footer">
        <Button
          type="primary"
          block
          aria-label="应用表单字段"
          disabled={blocked || busy || !changed}
          loading={busy}
          onClick={() =>
            onApply({
              name: field.name,
              ...(field.type === 'checkbox' ? { checked } : { value: text }),
            })
          }
        >
          应用字段
        </Button>
        <p className="mimir-pdf-inspector__hint" role="status">
          {feedback && !changed ? (
            <>
              <Check size={14} />
              {feedback}
            </>
          ) : changed ? (
            '应用后更新文档，保存后写入文件。'
          ) : (
            '当前值已与文档一致。'
          )}
        </p>
      </footer>
    </>
  )
}

export function PdfFormPanel({
  snapshot,
  busy,
  error,
  onAction,
  onClose,
  onGotoPage,
}: {
  snapshot?: PdfFormSnapshot
  busy: boolean
  error?: string | null
  onAction: PdfPanelAction
  onClose(): void
  onGotoPage(page: number): void
}) {
  const [name, setName] = useState('')
  const [feedback, setFeedback] = useState<{ name: string; sha256: string } | null>(null)
  const field = snapshot?.fields.find((item) => item.name === name) ?? snapshot?.fields[0]
  const failure = error ? (
    <p className="mimir-pdf-inspector__error" role="alert">
      {error}
    </p>
  ) : null
  return (
    <section
      className="mimir-pdf-panel mimir-pdf-form-panel"
      role="region"
      aria-label="PDF 表单面板"
      aria-busy={busy}
    >
      <PdfInspectorHeader
        title="交互表单"
        detail={snapshot ? `${snapshot.fields.length} 个字段` : undefined}
        busy={busy}
        refreshLabel="刷新表单字段"
        closeLabel="关闭表单面板"
        onRefresh={() => void onAction('list_form_fields', {})}
        onClose={onClose}
      />
      {field && snapshot ? (
        <FieldEditor
          binding={`${snapshot.sha256}:${field.name}`}
          field={field}
          busy={busy}
          feedback={
            feedback?.name === field.name && feedback.sha256 !== snapshot.sha256
              ? '已应用到文档。'
              : undefined
          }
          onApply={(value) => {
            void (async () => {
              const result = await onAction('apply_ops', { ops: [{ op: 'setFormValue', value }] })
              if (result?.ok && result.changed)
                setFeedback({ name: value.name, sha256: snapshot.sha256 })
            })()
          }}
        >
          {failure}
          <div className="mimir-pdf-inspector__control">
            <span>选择字段</span>
            <ToolbarSelect
              label="选择表单字段"
              value={field?.name ?? ''}
              disabled={busy}
              options={snapshot.fields.map((item) => ({
                value: item.name,
                label: `${item.name}${item.readOnly ? '（只读）' : ''}`,
              }))}
              onChange={(value) => {
                setName(value)
                setFeedback(null)
                const selected = snapshot.fields.find((item) => item.name === value)
                if (selected?.widgets[0]) onGotoPage(selected.widgets[0].page)
              }}
            />
          </div>
        </FieldEditor>
      ) : (
        <div className="mimir-pdf-inspector__content">
          {failure}
          {!snapshot && busy ? (
            <div aria-label="正在读取表单">
              <Skeleton title={false} paragraph={{ rows: 4 }} />
            </div>
          ) : (
            <p className="mimir-pdf-inspector__empty">
              {snapshot ? '这份 PDF 没有交互表单字段。' : '未读取到字段，请刷新重试。'}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
