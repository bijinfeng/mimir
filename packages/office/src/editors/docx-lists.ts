import { Extension, type Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import type { NumberingDef, NumberingLevel } from '../../vendor/packages/docx-engine/src/types.js'
import { formatNumber } from '../../vendor/apps/docs/src/renderer/editor/numbering.js'
import {
  LIST_DEFINITIONS_ATTR,
  listDefinitionEdits,
  validateListLevel,
  type ListDefinitionEdit,
  type ListLevelPatch,
} from '../docx-list-save.js'

const bases = new WeakMap<Editor, Map<string, NumberingDef>>()
const definitionCache = new WeakMap<
  Editor,
  { base: Map<string, NumberingDef>; edits: unknown; definitions: Map<string, NumberingDef> }
>()
export function docxListDefinitions(
  editor: Editor,
  doc = editor.state.doc,
): Map<string, NumberingDef> {
  if (!bases.has(editor)) bases.set(editor, new Map(editor.storage.listNumbering?.defs ?? []))
  const base = bases.get(editor)!
  const edits = doc.attrs[LIST_DEFINITIONS_ATTR]
  const cached = definitionCache.get(editor)
  if (cached?.base === base && cached.edits === edits) return cached.definitions
  const defs = new Map(base)
  for (const edit of listDefinitionEdits(doc)) {
    const inherited = edit.baseNumId ? defs.get(edit.baseNumId) : null
    const levels = inherited
      ? {
          ...Object.fromEntries(edit.levels.map((level, i) => [i, { ...level }])),
          ...inherited.levels,
        }
      : Object.fromEntries(edit.levels.map((level, i) => [i, { ...level }]))
    const overrides = { ...inherited?.startOverrides }
    for (const [index, patch] of Object.entries(edit.patches)) {
      const i = Number(index)
      levels[i] = { ...(levels[i] ?? edit.levels[i]), ...patch } as NumberingLevel
      if (patch.hanging !== undefined) delete levels[i]!.firstLine
      if (patch.numFmt !== undefined || patch.lvlText !== undefined) {
        delete levels[i]!.picBulletId
        delete levels[i]!.picBulletSrc
      }
      if (patch.start !== undefined) overrides[i] = patch.start
    }
    defs.set(edit.numId, {
      numId: edit.numId,
      abstractNumId: `mimir-${edit.numId}`,
      levels,
      startOverrides: overrides,
    })
  }
  definitionCache.set(editor, { base, edits, definitions: defs })
  return defs
}
function updateStorage(editor: Editor, doc: PmNode): void {
  if (editor.storage.listNumbering)
    editor.storage.listNumbering.defs = docxListDefinitions(editor, doc)
}
export function syncDocxListDefinitions(
  editor: Editor,
  definitions: Map<string, NumberingDef>,
): void {
  bases.set(editor, new Map(definitions))
  updateStorage(editor, editor.state.doc)
}
export const DocxListsExtension = Extension.create({
  name: 'mimirLists',
  priority: 1000,
  addGlobalAttributes() {
    return [
      {
        types: ['doc'],
        attributes: { [LIST_DEFINITIONS_ATTR]: { default: null, rendered: false } },
      },
    ]
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        state: {
          init: () => null,
          apply: (tr) => {
            updateStorage(editor, tr.doc)
            return null
          },
        },
      }),
    ]
  },
})
export interface DocxListTarget {
  doc: PmNode
  from: number
  to: number
  paragraphs: { node: PmNode; pos: number }[]
}
export function docxListTarget(editor: Editor): DocxListTarget {
  const { doc, selection } = editor.state
  const paragraphs: DocxListTarget['paragraphs'] = []
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (['docParagraph', 'docHeading', 'docListItem'].includes(node.type.name)) {
      // A selection ending at the next paragraph's opening boundary excludes it.
      if (selection.empty || (pos < selection.to && pos + node.nodeSize - 1 > selection.from))
        paragraphs.push({ node, pos })
      return false
    }
    return true
  })
  return { doc, from: selection.from, to: selection.to, paragraphs }
}
export function listTargetCurrent(target: DocxListTarget): {
  numId: string | null
  level: number | null
  mixed: boolean
  summary: string
} {
  const ids = new Set(
    target.paragraphs.map(({ node }) =>
      node.type.name === 'docListItem' ? String(node.attrs.numId ?? '') : '',
    ),
  )
  const levels = new Set(
    target.paragraphs.map(({ node }) =>
      node.type.name === 'docListItem' ? Number(node.attrs.ilvl ?? 0) : -1,
    ),
  )
  const numId = ids.size === 1 ? [...ids][0] || null : null
  const level = levels.size === 1 && !levels.has(-1) ? [...levels][0]! : null
  const mixed = ids.size > 1 || levels.size > 1
  return {
    numId,
    level,
    mixed,
    summary: !target.paragraphs.length
      ? '当前选区没有可编辑段落'
      : `${target.paragraphs.length} 段 · ${mixed ? '混合列表格式' : numId ? `列表 ${numId} · 第 ${Number(level) + 1} 级` : '无列表'}`,
  }
}
const bullets = ['•', '○', '■', '◆', '➢', '✦']
export interface ListPreset {
  id: string
  name: string
  family: 'bullet' | 'number' | 'multi'
  levels: NumberingLevel[]
}
const bulletLevels = (symbol: string): NumberingLevel[] =>
  Array.from({ length: 9 }, (_, i) => ({
    numFmt: 'bullet',
    lvlText: [symbol, '○', '■'][i % 3]!,
    start: 1,
    indentLeft: 720 * (i + 1),
    hanging: 360,
  }))
const numberLevels = (numFmt: string, text: string): NumberingLevel[] =>
  Array.from({ length: 9 }, (_, i) => ({
    numFmt,
    lvlText: text.replace('%1', `%${i + 1}`),
    start: 1,
    indentLeft: 720 * (i + 1),
    hanging: 360,
  }))
export const LIST_PRESETS: ListPreset[] = [
  ...bullets.map((symbol, i) => ({
    id: `bullet-${i}`,
    name: ['圆点', '空心圆', '方块', '菱形', '箭头', '星形'][i]!,
    family: 'bullet' as const,
    levels: bulletLevels(symbol),
  })),
  ...[
    ['decimal', '%1.', '阿拉伯数字'],
    ['decimal', '%1)', '数字括号'],
    ['upperRoman', '%1.', '罗马数字'],
    ['upperLetter', '%1.', '大写字母'],
    ['lowerLetter', '%1)', '小写字母'],
    ['chineseCountingThousand', '%1、', '中文数字'],
  ].map(([fmt, text, name], i) => ({
    id: `number-${i}`,
    name: name!,
    family: 'number' as const,
    levels: numberLevels(fmt!, text!),
  })),
  {
    id: 'multi-decimal',
    name: '分级数字',
    family: 'multi',
    levels: Array.from({ length: 9 }, (_, i) => ({
      numFmt: 'decimal',
      lvlText: Array.from({ length: i + 1 }, (_entry, j) => `%${j + 1}`).join('.') + '.',
      start: 1,
      indentLeft: 720 * (i + 1),
      hanging: 432,
    })),
  },
  {
    id: 'multi-chinese',
    name: '中文层级',
    family: 'multi',
    levels: Array.from({ length: 9 }, (_, i) => ({
      numFmt: i < 2 ? 'chineseCountingThousand' : 'decimal',
      lvlText: i === 0 ? '%1、' : i === 1 ? '(%2)' : `%${i + 1}.`,
      start: 1,
      indentLeft: 720 * (i + 1),
      hanging: i < 2 ? 425 : 360,
    })),
  },
  { id: 'multi-bullets', name: '分级符号', family: 'multi', levels: bulletLevels('•') },
]
export function previewListLevel(levels: NumberingLevel[], index: number): string {
  const level = levels[index]
  if (!level) return ''
  return level.numFmt === 'bullet'
    ? level.lvlText
    : level.lvlText.replace(/%([1-9])/g, (_, n: string) =>
        formatNumber(levels[Number(n) - 1]?.start ?? 1, levels[Number(n) - 1]?.numFmt ?? 'decimal'),
      )
}
export type ListApply =
  | { kind: 'none' }
  | { kind: 'existing'; numId: string; level: number | null }
  | {
      kind: 'definition'
      baseNumId: string | null
      levels: NumberingLevel[]
      patches: Record<number, ListLevelPatch>
      level: number | null
    }
export function applyDocxList(
  editor: Editor,
  target: DocxListTarget,
  action: ListApply,
): DocxListTarget {
  if (editor.isDestroyed || editor.state.doc !== target.doc)
    throw new Error('文档已变化，请重新打开列表设置')
  if (!target.paragraphs.length) throw new Error('请先在正文中放置光标或选择段落')
  const defs = docxListDefinitions(editor)
  let numId: string | null = null
  let definition: ListDefinitionEdit | null = null
  if (action.kind !== 'none') {
    if (
      action.level !== null &&
      (!Number.isInteger(action.level) || action.level < 0 || action.level > 8)
    )
      throw new Error('列表级别须为 1 至 9')
    if (action.kind === 'existing') {
      if (!defs.has(action.numId)) throw new Error('原列表定义已变化')
      numId = action.numId
    } else {
      if (action.baseNumId && !defs.has(action.baseNumId)) throw new Error('原列表定义已变化')
      if (action.levels.length !== 9) throw new Error('多级列表须包含九个级别')
      for (const [i, patch] of Object.entries(action.patches)) validateListLevel(patch, Number(i))
      numId = String(
        Math.max(2, ...[...defs.keys()].filter((id) => /^\d+$/.test(id)).map(Number)) + 1,
      )
      definition = {
        numId,
        baseNumId: action.baseNumId,
        levels: structuredClone(action.levels),
        patches: structuredClone(action.patches),
      }
    }
  }
  const tr = closeHistory(editor.state.tr)
  if (definition)
    tr.setDocAttribute(LIST_DEFINITIONS_ATTR, [...listDefinitionEdits(target.doc), definition])
  const nextDefs = definition ? docxListDefinitions(editor, tr.doc) : defs
  for (const { node, pos } of target.paragraphs) {
    if (action.kind === 'none' && node.type.name !== 'docListItem') continue
    const level =
      action.kind === 'none'
        ? null
        : (action.level ?? (node.type.name === 'docListItem' ? Number(node.attrs.ilvl ?? 0) : 0))
    const kind =
      numId && nextDefs.get(numId)?.levels[level ?? 0]?.numFmt === 'bullet' ? 'bullet' : 'ordered'
    const type =
      action.kind === 'none' ? editor.schema.nodes.docParagraph! : editor.schema.nodes.docListItem!
    const attrs = { ...node.attrs, numId, ilvl: level, kind: action.kind === 'none' ? null : kind }
    if (
      type === node.type &&
      Object.entries(attrs).every(([key, value]) => node.attrs[key] === value)
    )
      continue
    tr.setNodeMarkup(pos, type, attrs, node.marks)
  }
  if (tr.docChanged) editor.view.dispatch(tr)
  return {
    ...target,
    doc: editor.state.doc,
    paragraphs: target.paragraphs.map(({ pos }) => ({ pos, node: editor.state.doc.nodeAt(pos)! })),
  }
}
export function toggleDocxList(editor: Editor, kind: 'bullet' | 'ordered'): void {
  const target = docxListTarget(editor)
  if (!target.paragraphs.length) return
  if (
    target.paragraphs.every(
      ({ node }) => node.type.name === 'docListItem' && node.attrs.kind === kind,
    )
  ) {
    applyDocxList(editor, target, { kind: 'none' })
    return
  }
  const defs = docxListDefinitions(editor)
  const existing = [...defs.values()].find(
    (def) => def.levels[0]?.numFmt === (kind === 'bullet' ? 'bullet' : 'decimal'),
  )
  if (existing)
    applyDocxList(editor, target, { kind: 'existing', numId: existing.numId, level: null })
  else
    applyDocxList(editor, target, {
      kind: 'definition',
      baseNumId: null,
      levels: LIST_PRESETS.find(
        (preset) => preset.id === (kind === 'bullet' ? 'bullet-0' : 'number-0'),
      )!.levels,
      patches: {},
      level: null,
    })
}
