import { Checkbox } from 'antd'
import { Plus, Trash2, X } from 'lucide-react'
import { normalizeHtmlPageBrief, type HtmlBriefStyle } from '@mimir/shared'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  HtmlClarificationQuestion,
  HtmlClarificationResponse,
  HtmlPageBrief,
  HtmlBriefDecision,
} from '../agent/html-agent.js'
import {
  ToolbarButton,
  ToolbarNote,
  ToolbarMenuFields,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
  ToolbarColorPicker,
} from '../shell/EditorShell.js'

export type HtmlPromptRequest =
  | {
      id: number
      kind: 'questions'
      questions: HtmlClarificationQuestion[]
      resolve: (answer: HtmlClarificationResponse) => void
    }
  | {
      id: number
      kind: 'brief'
      brief: HtmlPageBrief
      mode: string
      resolve: (brief: HtmlPageBrief | HtmlBriefDecision | null) => void
    }

export function HtmlAgentPrompt({
  request,
  onClose,
}: {
  request: HtmlPromptRequest
  onClose: () => void
}) {
  const [choices, setChoices] = useState<Record<string, string[]>>({})
  const selectedChoices = (id: string) => (Object.hasOwn(choices, id) ? choices[id]! : [])
  const [other, setOther] = useState('')
  const cancel = () => {
    if (request.kind === 'questions') request.resolve({ answers: '', cancelled: true })
    else request.resolve(null)
    onClose()
  }
  if (request.kind === 'questions')
    return (
      <HtmlPromptPanel
        title="页面创建前的问题"
        onCancel={cancel}
        actions={
          <>
            <ToolbarButton label="跳过页面问题" onClick={cancel}>
              跳过
            </ToolbarButton>
            <ToolbarButton
              label="提交页面选择"
              primary
              onClick={() => {
                const selections = Object.fromEntries(
                  request.questions.map((question) => [
                    question.id,
                    question.options.filter((option) =>
                      selectedChoices(question.id).includes(option),
                    ),
                  ]),
                )
                request.resolve({
                  answers:
                    request.questions
                      .map(
                        (question) =>
                          `${question.label}: ${selections[question.id]?.join('、') || '由 AI 决定'}`,
                      )
                      .join('\n') + (other.trim() ? `\n其他：${other.trim()}` : ''),
                  ...(request.questions.some((question) => question.multi) ? { selections } : {}),
                })
                onClose()
              }}
            />
          </>
        }
      >
        <ToolbarNote>选择页面方向，答案会交给当前 Agent 继续规划。</ToolbarNote>
        {request.questions.map((question) =>
          question.multi ? (
            <ToolbarMenuFields key={question.id} label={question.label}>
              {question.description && <ToolbarNote>{question.description}</ToolbarNote>}
              <Checkbox.Group
                className="mimir-html-planning__choices"
                aria-label={question.label}
                options={question.options}
                value={selectedChoices(question.id)}
                onChange={(values) =>
                  setChoices((previous) => ({
                    ...previous,
                    [question.id]: values.map(String),
                  }))
                }
              />
              <ToolbarNote>可选择多项；不选择时由 AI 决定。</ToolbarNote>
            </ToolbarMenuFields>
          ) : (
            <div key={question.id} className="mimir-html-planning__question">
              <ToolbarSelect
                label={question.label}
                value={selectedChoices(question.id)[0] ?? null}
                emptyLabel="请选择"
                options={[
                  ...question.options.map((option) => ({ value: option, label: option })),
                  { value: '由 AI 决定', label: '由 AI 决定' },
                ]}
                onChange={(value) =>
                  setChoices((previous) => ({ ...previous, [question.id]: [value] }))
                }
              />
              {question.description && <ToolbarNote>{question.description}</ToolbarNote>}
            </div>
          ),
        )}
        <ToolbarTextField
          label="其他补充说明"
          value={other}
          onChange={setOther}
          placeholder="可选"
        />
      </HtmlPromptPanel>
    )
  return <HtmlBriefPrompt request={request} onCancel={cancel} onClose={onClose} />
}

function HtmlBriefPrompt({
  request,
  onCancel,
  onClose,
}: {
  request: Extract<HtmlPromptRequest, { kind: 'brief' }>
  onCancel: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(() => normalizeHtmlPageBrief(request.brief))
  const [directions] = useState(() =>
    [draft.style!, ...(draft.alternatives ?? [])].map((value) => ({
      id: crypto.randomUUID(),
      value,
    })),
  )
  const [sectionIds, setSectionIds] = useState(() => draft.sections.map(() => crypto.randomUUID()))
  const [selectedDirection, setSelectedDirection] = useState(0)
  const [edited, setEdited] = useState<string[]>([])
  const [redoNote, setRedoNote] = useState('')
  const [error, setError] = useState('')
  const style = draft.style!
  const touch = (key: string) => setEdited((previous) => [...new Set([...previous, key])])
  const update = (patch: Partial<HtmlPageBrief>, key: string) => {
    setDraft((previous) => ({ ...previous, ...patch }))
    touch(key)
  }
  const updateStyle = (patch: Partial<HtmlBriefStyle>, key: string) => {
    setDraft((previous) => ({ ...previous, style: { ...previous.style!, ...patch } }))
    touch(key)
  }
  const confirm = () => {
    try {
      if (!draft.core_hook?.trim() || !draft.sections.some((section) => section.title.trim()))
        throw new Error('请填写内容主张和至少一个章节标题')
      const brief = normalizeHtmlPageBrief({
        ...draft,
        tone: style.tone,
        user_edited: [...new Set([...(draft.user_edited ?? []), ...edited])],
        sections: draft.sections.filter(
          (section) => section.title.trim() || section.purpose.trim(),
        ),
      })
      request.resolve({ kind: 'confirmed', brief })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const paletteLabels = {
    primary: '主色',
    accent: '强调色',
    bg: '页面底色',
    surface: '内容底色',
    text: '文字色',
  } as const
  return (
    <HtmlPromptPanel
      title="确认页面提纲"
      onCancel={onCancel}
      actions={
        <>
          <ToolbarButton label="取消页面提纲" onClick={onCancel}>
            取消
          </ToolbarButton>
          <ToolbarButton
            label="重新拟定页面提纲"
            onClick={() => {
              request.resolve({ kind: 'redo', note: redoNote.trim().slice(0, 2000) })
              onClose()
            }}
          >
            重新拟定
          </ToolbarButton>
          <ToolbarButton label="确认页面提纲" primary onClick={confirm} />
        </>
      }
    >
      <ToolbarNote>
        {request.mode === 'restyle'
          ? '确认后固定提纲；随后再调整页面样式，保留正文。'
          : request.mode === 'extract'
            ? '确认后将提纲保存在当前 HTML 内，正文保持原样。'
            : '确认内容与视觉方向后再生成页面。'}
      </ToolbarNote>
      <ToolbarTextArea
        label="内容主张"
        rows={2}
        value={draft.core_hook ?? ''}
        onChange={(value) => update({ core_hook: value }, 'core_hook')}
      />
      <ToolbarTextField
        label="页面标题"
        value={draft.title}
        onChange={(value) => update({ title: value }, 'meta.title')}
      />
      <ToolbarTextField
        label="目标读者"
        value={draft.audience}
        onChange={(value) => update({ audience: value }, 'meta.audience')}
      />
      <ToolbarMenuFields label="视觉方向">
        <div className="mimir-html-brief-directions" role="group" aria-label="页面视觉方向">
          {directions.map(({ id, value: direction }, index) => (
            <div className="mimir-html-brief-direction" key={id}>
              <ToolbarButton
                label={`选择视觉方向：${direction.name || `方向 ${index + 1}`}`}
                active={selectedDirection === index}
                onClick={() => {
                  setSelectedDirection(index)
                  setDraft((previous) => ({ ...previous, style: structuredClone(direction) }))
                  touch('style')
                }}
              >
                <span
                  className="mimir-html-brief-direction__sample"
                  style={{
                    background: direction.palette.bg ?? '#f6f4ef',
                    color: direction.palette.text ?? '#242424',
                  }}
                >
                  <span className="mimir-html-brief-direction__title">
                    {direction.name || `方向 ${index + 1}`}
                  </span>
                  <span className="mimir-html-brief-direction__tone">{direction.tone}</span>
                  <span className="mimir-html-brief-direction__swatches" aria-hidden="true">
                    {Object.entries(direction.palette).map(([key, value]) => (
                      <i key={key} style={{ background: value }} />
                    ))}
                  </span>
                </span>
              </ToolbarButton>
            </div>
          ))}
        </div>
      </ToolbarMenuFields>
      <details className="mimir-html-brief-details">
        <summary>配色、字体与布局</summary>
        <ToolbarPropertyForm columns={1}>
          <ToolbarTextField
            label="视觉语气"
            value={style.tone}
            onChange={(value) => updateStyle({ tone: value }, 'style.tone')}
          />
          <div className="mimir-html-brief-palette">
            {(Object.keys(paletteLabels) as Array<keyof typeof paletteLabels>).map((key) => (
              <div key={key}>
                <code>{style.palette[key] ?? '未指定'}</code>
                <ToolbarColorPicker
                  label={`提纲${paletteLabels[key]}`}
                  value={style.palette[key] ?? ''}
                  options={
                    style.palette[key]
                      ? [
                          {
                            value: style.palette[key]!,
                            label: style.palette[key]!,
                            swatch: style.palette[key]!,
                          },
                        ]
                      : []
                  }
                  allowCustomRgb
                  onPick={(value: string) =>
                    updateStyle(
                      { palette: { ...style.palette, [key]: value || undefined } },
                      `style.palette.${key}`,
                    )
                  }
                />
              </div>
            ))}
          </div>
          {(['heading', 'body', 'scale'] as const).map((key) => (
            <ToolbarTextField
              key={key}
              label={key === 'heading' ? '标题字体' : key === 'body' ? '正文字体' : '字号层级'}
              value={style.typography[key] ?? ''}
              onChange={(value) =>
                updateStyle(
                  { typography: { ...style.typography, [key]: value } },
                  `style.typography.${key}`,
                )
              }
            />
          ))}
          {(['radius', 'spacing', 'shadow'] as const).map((key) => (
            <ToolbarTextField
              key={key}
              label={key === 'radius' ? '圆角' : key === 'spacing' ? '基础间距' : '卡片阴影'}
              value={style.tokens?.[key] ?? ''}
              onChange={(value) =>
                updateStyle({ tokens: { ...style.tokens, [key]: value } }, `style.tokens.${key}`)
              }
            />
          ))}
          <ToolbarTextField
            label="布局方向"
            value={style.layout ?? ''}
            onChange={(value) => updateStyle({ layout: value }, 'style.layout')}
          />
          <ToolbarTextField
            label="内容密度"
            value={style.density ?? ''}
            onChange={(value) => updateStyle({ density: value }, 'style.density')}
          />
          <Checkbox
            checked={style.docx_friendly === true}
            onChange={(event) =>
              updateStyle({ docx_friendly: event.target.checked }, 'style.docx_friendly')
            }
          >
            便于导出为 Word
          </Checkbox>
        </ToolbarPropertyForm>
      </details>
      <ToolbarMenuFields label="页面章节">
        {draft.sections.map((section, index) => (
          <div className="mimir-html-brief-section" key={sectionIds[index]}>
            <div className="mimir-html-brief-section__title">
              <ToolbarTextField
                label={`章节 ${index + 1} 标题`}
                value={section.title}
                onChange={(title) =>
                  update(
                    {
                      sections: draft.sections.map((item, at) =>
                        at === index ? { ...item, title } : item,
                      ),
                    },
                    `sections[${index}]`,
                  )
                }
              />
              <ToolbarButton
                label={`移除章节 ${index + 1}`}
                disabled={draft.sections.length <= 1}
                disabledReason="至少保留一个章节"
                onClick={() => {
                  setSectionIds((ids) => ids.filter((_, at) => at !== index))
                  update({ sections: draft.sections.filter((_, at) => at !== index) }, 'sections')
                }}
              >
                <Trash2 size={14} />
              </ToolbarButton>
            </div>
            <ToolbarTextArea
              label={`章节 ${index + 1} 用途`}
              value={section.purpose}
              rows={2}
              onChange={(purpose) =>
                update(
                  {
                    sections: draft.sections.map((item, at) =>
                      at === index ? { ...item, purpose } : item,
                    ),
                  },
                  `sections[${index}]`,
                )
              }
            />
          </div>
        ))}
        <ToolbarButton
          label="添加页面章节"
          disabled={draft.sections.length >= 20}
          disabledReason="最多20个章节"
          onClick={() => {
            setSectionIds((ids) => [...ids, crypto.randomUUID()])
            update({ sections: [...draft.sections, { title: '', purpose: '' }] }, 'sections')
          }}
        >
          <Plus size={14} />
          添加章节
        </ToolbarButton>
      </ToolbarMenuFields>
      <details className="mimir-html-brief-details">
        <summary>文档要求与重新拟定说明</summary>
        <ToolbarPropertyForm columns={1}>
          <ToolbarTextField
            label="页面语言"
            value={draft.meta?.language ?? ''}
            onChange={(language) => update({ meta: { ...draft.meta, language } }, 'meta.language')}
          />
          <ToolbarTextField
            label="内容长度"
            value={draft.meta?.length ?? ''}
            onChange={(length) => update({ meta: { ...draft.meta, length } }, 'meta.length')}
          />
          <ToolbarTextArea
            label="重新拟定说明"
            value={redoNote}
            onChange={setRedoNote}
            rows={3}
            placeholder="说明希望调整的内容或视觉方向"
          />
        </ToolbarPropertyForm>
      </details>
      {error && (
        <p role="alert" className="mimir-html-inspector__feedback">
          {error}
        </p>
      )}
    </HtmlPromptPanel>
  )
}

function HtmlPromptPanel({
  title,
  onCancel,
  actions,
  children,
}: {
  title: string
  onCancel: () => void
  actions: ReactNode
  children: ReactNode
}) {
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const panel = root.current
    const editor = panel?.closest('.mimir-editor')
    const previous = document.activeElement
    panel?.focus()
    return () => {
      const active = document.activeElement
      if (active !== document.body && active !== panel && !panel?.contains(active)) return
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
      else editor?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus()
    }
  }, [])
  return (
    <aside
      ref={root}
      className="mimir-html-inspector mimir-html-planning"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <header className="mimir-html-inspector__header">
        <h2>{title}</h2>
        <ToolbarButton label="关闭页面规划" onClick={onCancel}>
          <X size={16} />
        </ToolbarButton>
      </header>
      <div className="mimir-html-inspector__scroll">
        <ToolbarPropertyForm columns={1}>{children}</ToolbarPropertyForm>
      </div>
      <footer className="mimir-html-inspector__footer mimir-html-planning__actions">
        {actions}
      </footer>
    </aside>
  )
}
