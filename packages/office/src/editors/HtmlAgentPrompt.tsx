import { useState } from 'react'
import type { HtmlClarificationQuestion, HtmlPageBrief } from '../agent/html-agent.js'
import {
  ToolbarButton,
  ToolbarNote,
  ToolbarSelect,
  ToolbarTextArea,
  ToolbarTextField,
} from '../shell/EditorShell.js'

export type HtmlPromptRequest =
  | {
      id: number
      kind: 'questions'
      questions: HtmlClarificationQuestion[]
      resolve: (answer: { answers: string; cancelled?: boolean }) => void
    }
  | {
      id: number
      kind: 'brief'
      brief: HtmlPageBrief
      mode: string
      resolve: (brief: HtmlPageBrief | null) => void
    }

export function HtmlAgentPrompt({
  request,
  onClose,
}: {
  request: HtmlPromptRequest
  onClose: () => void
}) {
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [other, setOther] = useState('')
  const [title, setTitle] = useState(request.kind === 'brief' ? request.brief.title : '')
  const [tone, setTone] = useState(request.kind === 'brief' ? request.brief.tone : '')
  const [audience, setAudience] = useState(request.kind === 'brief' ? request.brief.audience : '')
  const [sections, setSections] = useState(
    request.kind === 'brief'
      ? request.brief.sections.map((section) => `${section.title}: ${section.purpose}`).join('\n')
      : '',
  )
  if (request.kind === 'questions')
    return (
      <section className="mimir-html-agent-prompt" aria-label="页面创建前的问题">
        <ToolbarNote>选择页面方向，答案会交给当前 Agent 工具继续规划。</ToolbarNote>
        {request.questions.map((question) => (
          <div key={question.id}>
            <ToolbarNote>
              {question.label}
              {question.description ? ` · ${question.description}` : ''}
            </ToolbarNote>
            <ToolbarSelect
              label={question.label}
              value={choices[question.id] ?? null}
              emptyLabel="请选择"
              options={[
                ...question.options.map((option) => ({ value: option, label: option })),
                { value: '由 AI 决定', label: '由 AI 决定' },
              ]}
              onChange={(value) =>
                setChoices((previous) => ({ ...previous, [question.id]: value }))
              }
            />
          </div>
        ))}
        <ToolbarTextField
          label="其他补充说明"
          value={other}
          onChange={setOther}
          placeholder="可选"
        />
        <ToolbarButton
          label="提交页面选择"
          onClick={() => {
            request.resolve({
              answers:
                request.questions
                  .map((question) => `${question.label}: ${choices[question.id] ?? '由 AI 决定'}`)
                  .join('\n') + (other.trim() ? `\n其他：${other.trim()}` : ''),
            })
            onClose()
          }}
        >
          继续规划
        </ToolbarButton>
        <ToolbarButton
          label="跳过页面问题"
          onClick={() => {
            request.resolve({ answers: '', cancelled: true })
            onClose()
          }}
        >
          跳过
        </ToolbarButton>
      </section>
    )
  return (
    <section className="mimir-html-agent-prompt" aria-label="确认页面提纲">
      <ToolbarNote>确认或修改页面提纲后，才会生成内容。当前模式：{request.mode}</ToolbarNote>
      <ToolbarTextField label="页面标题" value={title} onChange={setTitle} />
      <ToolbarTextField label="视觉语气" value={tone} onChange={setTone} />
      <ToolbarTextField label="目标读者" value={audience} onChange={setAudience} />
      <ToolbarTextArea
        label="章节（每行标题: 用途）"
        value={sections}
        onChange={setSections}
        rows={5}
      />
      <ToolbarButton
        label="确认页面提纲"
        onClick={() => {
          const parsed = sections
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const pivot = line.indexOf(':')
              return pivot < 0
                ? { title: line, purpose: '' }
                : { title: line.slice(0, pivot).trim(), purpose: line.slice(pivot + 1).trim() }
            })
          request.resolve({
            title: title.trim(),
            tone: tone.trim(),
            audience: audience.trim(),
            sections: parsed.length ? parsed : request.brief.sections,
          })
          onClose()
        }}
      >
        确认并继续
      </ToolbarButton>
      <ToolbarButton
        label="取消页面提纲"
        onClick={() => {
          request.resolve(null)
          onClose()
        }}
      >
        取消
      </ToolbarButton>
    </section>
  )
}
