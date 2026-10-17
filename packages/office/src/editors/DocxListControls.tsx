import { useEffect, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import type { NumberingLevel } from '../../vendor/packages/docx-engine/src/types.js'
import { LIST_FORMATS, type ListLevelPatch } from '../docx-list-save.js'
import {
  ToolbarButton,
  ToolbarMenuFields,
  ToolbarMenuNote,
  ToolbarNumberField,
  ToolbarPropertyForm,
  ToolbarSelect,
  ToolbarTextField,
} from '../shell/EditorShell.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
import {
  applyDocxList,
  docxListDefinitions,
  docxListTarget,
  listTargetCurrent,
  LIST_PRESETS,
  previewListLevel,
  type ListApply,
} from './docx-lists.js'
import './docx-lists.css'

const FORMAT_NAMES: Record<string, string> = {
  bullet: '项目符号',
  decimal: '1, 2, 3',
  decimalZero: '01, 02, 03',
  upperRoman: 'I, II, III',
  lowerRoman: 'i, ii, iii',
  upperLetter: 'A, B, C',
  lowerLetter: 'a, b, c',
  chineseCountingThousand: '一、二、三',
  chineseCounting: '一、二、三（逐位）',
  chineseLegalSimplified: '壹、贰、叁',
}
function completeLevels(levels: Record<number, NumberingLevel>): NumberingLevel[] {
  return Array.from({ length: 9 }, (_, i) => ({ ...LIST_PRESETS[6]!.levels[i]!, ...levels[i] }))
}
export function DocxListControls({ context }: { context: DocxAdvancedContext }) {
  const [target, setTarget] = useState(() => docxListTarget(context.editor))
  const [definitions, setDefinitions] = useState(() => docxListDefinitions(context.editor))
  const current = listTargetCurrent(target)
  const originalChoice = current.numId ? `doc:${current.numId}` : current.mixed ? 'mixed' : 'none'
  const [choice, setChoice] = useState(originalChoice)
  const [family, setFamily] = useState<'bullet' | 'number' | 'multi'>('bullet')
  const [applyLevel, setApplyLevel] = useState<number | null>(null)
  const [editLevel, setEditLevel] = useState(current.level ?? 0)
  const [patches, setPatches] = useState<Record<number, ListLevelPatch>>({})
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [stale, setStale] = useState(false)
  const [numberFocused, setNumberFocused] = useState(false)
  const [optionsIdentity] = useState(() => JSON.stringify(context.options))
  useEffect(() => {
    const check = () => {
      if (context.editor.state.doc !== target.doc) setStale(true)
    }
    context.editor.on('transaction', check)
    return () => {
      context.editor.off('transaction', check)
    }
  }, [context.editor, target])
  const preset = LIST_PRESETS.find((item) => choice === `preset:${item.id}`)
  const baseNumId = choice.startsWith('doc:') ? choice.slice(4) : null
  const base = baseNumId ? definitions.get(baseNumId) : null
  const originalLevels =
    preset?.levels ??
    (base
      ? completeLevels(base.levels).map((level, i) =>
          Object.assign({}, level, { start: base.startOverrides[i] ?? level.start }),
        )
      : LIST_PRESETS[6]!.levels)
  const levels = originalLevels.map((level, i) => ({ ...level, ...patches[i] }))
  const level = levels[editLevel]!
  const locked =
    stale ||
    JSON.stringify(context.options) !== optionsIdentity ||
    context.editor.isDestroyed ||
    !target.paragraphs.length
  const modified = Object.keys(patches).length > 0
  // Number fields commit on blur. Keep actions reachable while a numeric draft
  // is focused so the first button mousedown can flush that draft before click.
  const dirty = modified || choice !== originalChoice || applyLevel !== null || numberFocused
  const choose = (value: string) => {
    setChoice(value)
    setPatches({})
    setError('')
    setStatus('')
  }
  const patch = (change: ListLevelPatch) => {
    if (choice === 'none' || choice === 'mixed') setChoice('preset:number-0')
    setPatches({ ...patches, [editLevel]: { ...patches[editLevel], ...change } })
    setError('')
    setStatus('')
  }
  const submit = () => {
    try {
      if (locked) throw new Error('文档已变化，请重新打开列表设置')
      let action: ListApply
      if (choice === 'none') action = { kind: 'none' }
      else if (baseNumId && !modified)
        action = { kind: 'existing', numId: baseNumId, level: applyLevel }
      else
        action = {
          kind: 'definition',
          baseNumId,
          levels: originalLevels,
          patches,
          level: applyLevel,
        }
      const next = applyDocxList(context.editor, target, action)
      // Storage is refreshed in the same PM transaction, before native marker decoration.
      setDefinitions(docxListDefinitions(context.editor))
      setTarget(next)
      setChoice(listTargetCurrent(next).numId ? `doc:${listTargetCurrent(next).numId}` : 'none')
      setPatches({})
      setApplyLevel(null)
      setStale(false)
      setError('')
      setStatus('已应用到所选段落')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return (
    <div className="mimir-docx-lists">
      <div className="mimir-docx-lists__scroll">
        <p className="mimir-docx-lists__current" role="status">
          {current.summary}
        </p>
        <fieldset
          disabled={locked}
          className="mimir-docx-lists__fields"
          onFocusCapture={(event) =>
            setNumberFocused(event.target.getAttribute('role') === 'spinbutton')
          }
          onBlurCapture={() => setNumberFocused(false)}
        >
          <ToolbarPropertyForm>
            <ToolbarMenuFields label="列表样式">
              <ToolbarSelect
                label="文档列表"
                disabled={locked}
                value={choice.startsWith('preset:') ? 'preset' : choice}
                options={[
                  { value: 'none', label: '无列表' },
                  ...(originalChoice === 'mixed'
                    ? [{ value: 'mixed', label: '混合列表（保留）' }]
                    : []),
                  ...(preset ? [{ value: 'preset', label: `预设 · ${preset.name}` }] : []),
                  ...[...definitions.values()].map((def) => ({
                    value: `doc:${def.numId}`,
                    label: `列表 ${def.numId} · ${previewListLevel(completeLevels(def.levels), 0)}`,
                  })),
                ]}
                onChange={choose}
              />
              <ToolbarSelect
                label="样式库"
                disabled={locked}
                value={family}
                options={[
                  { value: 'bullet', label: '项目符号' },
                  { value: 'number', label: '编号' },
                  { value: 'multi', label: '多级列表' },
                ]}
                onChange={(value) => setFamily(value as typeof family)}
              />
              <div className="mimir-docx-lists__gallery" role="group" aria-label="列表预设">
                {LIST_PRESETS.filter((item) => item.family === family).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="mimir-docx-lists__preset"
                    disabled={locked}
                    aria-label={item.name}
                    aria-pressed={choice === `preset:${item.id}`}
                    onClick={() => choose(`preset:${item.id}`)}
                  >
                    <span className="mimir-docx-lists__sample" aria-hidden="true">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          style={{ paddingInlineStart: item.family === 'multi' ? i * 8 : 0 }}
                        >
                          <b>{previewListLevel(item.levels, i)}</b>
                          <i />
                        </span>
                      ))}
                    </span>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
              <div className="mimir-docx-lists__wide">
                <ToolbarSelect
                  label="应用列表级别"
                  disabled={locked || choice === 'none'}
                  value={applyLevel === null ? 'keep' : String(applyLevel)}
                  options={[
                    { value: 'keep', label: '保留各段现有级别' },
                    ...Array.from({ length: 9 }, (_, i) => ({
                      value: String(i),
                      label: `第 ${i + 1} 级`,
                    })),
                  ]}
                  onChange={(value) => setApplyLevel(value === 'keep' ? null : Number(value))}
                />
              </div>
            </ToolbarMenuFields>
            <ToolbarMenuFields label="详细定义">
              <ToolbarSelect
                label="编辑级别"
                disabled={locked}
                value={String(editLevel)}
                options={Array.from({ length: 9 }, (_, i) => ({
                  value: String(i),
                  label: `第 ${i + 1} 级`,
                }))}
                onChange={(value) => setEditLevel(Number(value))}
              />
              <ToolbarSelect
                label="编号格式"
                disabled={locked}
                value={level.numFmt}
                options={[
                  ...(!(LIST_FORMATS as readonly string[]).includes(level.numFmt)
                    ? [{ value: level.numFmt, label: `原件格式 · ${level.numFmt}` }]
                    : []),
                  ...LIST_FORMATS.map((value) => ({ value, label: FORMAT_NAMES[value]! })),
                ]}
                onChange={(numFmt) =>
                  patch({ numFmt, lvlText: numFmt === 'bullet' ? '•' : `%${editLevel + 1}.` })
                }
              />
              <div className="mimir-docx-lists__wide">
                <ToolbarTextField
                  label="编号格式文字"
                  value={level.lvlText}
                  onChange={(lvlText) => patch({ lvlText })}
                />
              </div>
              <ToolbarMenuNote>
                {editLevel === 0
                  ? '用 %1 表示第一级编号，例如「第%1项」。'
                  : `用 %1 至 %${editLevel + 1} 引用各级编号，例如 %1.%2。`}
              </ToolbarMenuNote>
              <ToolbarNumberField
                label="起始编号"
                disabled={locked || level.numFmt === 'bullet'}
                value={patches[editLevel]?.start ?? base?.startOverrides[editLevel] ?? level.start}
                min={1}
                max={32767}
                onCommit={(start) => patch({ start })}
              />
              <ToolbarNumberField
                label="文字缩进"
                disabled={locked}
                suffix="磅"
                value={(level.indentLeft ?? 720) / 20}
                min={0}
                max={1584}
                step={0.5}
                onCommit={(value) => patch({ indentLeft: Math.round(value * 20) })}
              />
              <ToolbarNumberField
                label="悬挂缩进"
                disabled={locked}
                suffix="磅"
                value={(level.hanging ?? 0) / 20}
                min={0}
                max={1584}
                step={0.5}
                onCommit={(value) => patch({ hanging: Math.round(value * 20) })}
              />
              <ToolbarSelect
                label="编号对齐"
                disabled={locked}
                value={level.lvlJc ?? 'left'}
                options={[
                  { value: 'left', label: '左对齐' },
                  { value: 'center', label: '居中' },
                  { value: 'right', label: '右对齐' },
                ]}
                onChange={(lvlJc) => patch({ lvlJc: lvlJc as NumberingLevel['lvlJc'] })}
              />
              <ToolbarSelect
                label="编号之后"
                disabled={locked}
                value={level.suff ?? 'tab'}
                options={[
                  { value: 'tab', label: '制表符' },
                  { value: 'space', label: '空格' },
                  { value: 'nothing', label: '无' },
                ]}
                onChange={(suff) => patch({ suff: suff as NumberingLevel['suff'] })}
              />
              <div className="mimir-docx-lists__preview" aria-label="当前级别预览">
                <span>{previewListLevel(levels, editLevel)}</span>
                <span>列表正文</span>
              </div>
            </ToolbarMenuFields>
          </ToolbarPropertyForm>
        </fieldset>
      </div>
      <div className="mimir-docx-lists__actions">
        {(error || locked) && (
          <p role="alert">
            {!target.paragraphs.length
              ? '请先在正文中放置光标或选择段落。'
              : locked
                ? '文档或附加结构已变化，请重新打开列表设置。'
                : error}
          </p>
        )}
        {status && <p role="status">{status}</p>}
        {modified && <p>详细定义仅应用到选区，其他段落继续使用原列表。</p>}
        <div className="mimir-docx-lists__buttons">
          <ToolbarButton
            label="重置列表草稿"
            disabled={!dirty || locked}
            onClick={() => {
              choose(originalChoice)
              setApplyLevel(null)
            }}
          >
            <RotateCcw size={14} />
            重置
          </ToolbarButton>
          <ToolbarButton
            label="应用列表"
            primary
            disabled={!dirty || locked}
            disabledReason={locked ? '请重新打开列表设置' : '请先选择样式或修改列表定义'}
            onClick={submit}
          >
            <Check size={14} />
          </ToolbarButton>
        </div>
      </div>
    </div>
  )
}
