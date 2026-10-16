import { useState } from 'react'
import type { PptxClarification } from '@mimir/shared'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import { PptxControlPanel } from './PptxObjectControls.js'

export function PptxClarificationControls({
  input,
  complete,
}: {
  input: PptxClarification
  complete: (answers: { id: string; label: string; choices: string[]; other: string }[]) => void
}) {
  const [choices, setChoices] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})
  const ready = input.questions.every((q) => choices[q.id]?.length || other[q.id]?.trim())
  return (
    <PptxControlPanel busy={false}>
      <ToolbarMenuNote>选择演示文稿的方向，确认后继续生成。</ToolbarMenuNote>
      {input.questions.map((q) => (
        <ToolbarMenuFields key={q.id} label={q.label}>
          {q.description && <ToolbarMenuNote>{q.description}</ToolbarMenuNote>}
          {[...q.options, '请为我决定'].map((option) => (
            <ToolbarButton
              key={option}
              label={`${q.label}：${option}`}
              active={choices[q.id]?.includes(option)}
              onClick={() =>
                setChoices((current) => ({
                  ...current,
                  [q.id]: q.multi
                    ? current[q.id]?.includes(option)
                      ? current[q.id]!.filter((item) => item !== option)
                      : [...(current[q.id] ?? []), option]
                    : [option],
                }))
              }
            >
              {option}
            </ToolbarButton>
          ))}
          <ToolbarTextField
            label={`${q.label}：其他要求`}
            value={other[q.id] ?? ''}
            onChange={(value) => setOther((current) => ({ ...current, [q.id]: value }))}
          />
        </ToolbarMenuFields>
      ))}
      <ToolbarButton
        primary
        label="确认演示需求"
        disabled={!ready}
        disabledReason="请为每个问题选择方向或填写其他要求"
        onClick={() =>
          complete(
            input.questions.map((q) => ({
              id: q.id,
              label: q.label,
              choices: choices[q.id] ?? [],
              other: other[q.id]?.trim() ?? '',
            })),
          )
        }
      />
    </PptxControlPanel>
  )
}
