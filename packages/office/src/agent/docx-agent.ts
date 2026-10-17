import { FORCED_TRACKING_REASON } from '../docx-forced-tracking.js'
import { replaceNoteText } from './docx-note-edit.js'
import type { Editor } from '@tiptap/core'
import {
  DOMParser as PmDOMParser,
  DOMSerializer,
  Fragment,
  type Node as PmNode,
} from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import type { SaveOptions } from '../../vendor/packages/docx-engine/src/patch.js'
import {
  pendingHeadingLevel,
  type StyleUpsert,
} from '../../vendor/packages/docx-engine/src/style-upsert.js'
import type {
  ChartDisplay,
  CommentInfo,
  NewChart,
  NewImage,
  NoteInfo,
  TextboxDisplay,
} from '../../vendor/packages/docx-engine/src/types.js'
import { PAGE_MARK, TOTAL_PAGES_MARK } from '../../vendor/packages/docx-engine/src/types.js'
import type { DocxSession } from '../docx.js'
import {
  applyPageNumType,
  applySectionSettings,
  applySectionStartType,
  applyTitlePg,
  buildAnchoredTextboxParagraphXml,
  generateTocFieldXml,
  sectionFromSectPr,
} from '../../vendor/packages/docx-engine/src/index.js'
import type { SectionInfo, SectionSettings } from '../../vendor/packages/docx-engine/src/types.js'
import {
  applyRevisions,
  collectRevisions,
  TRACK_IGNORE,
} from '../../vendor/apps/docs/src/renderer/editor/revisions.js'

/** GenOffice DOCX tool names at 480548fd55f1be3593ee0d8e316a734751d58309. */
export const DOCX_AGENT_TOOL_NAMES = [
  'get_document_context',
  'read_blocks',
  'insert_content',
  'write_document',
  'replace_blocks',
  'replace_selection',
  'apply_ops',
  'read_revisions',
  'accept_changes',
  'reject_changes',
  'read_comments',
  'reply_comment',
  'resolve_comment',
  'add_comment',
  'delete_comment',
  'insert_footnote',
  'insert_endnote',
  'delete_note',
  'edit_note',
  'read_notes',
  'web_search',
  'image_search',
  'analyze_media',
  'insert_image',
  'generate_image',
  'insert_chart',
  'edit_chart',
  'set_header_footer',
  'set_page_setup',
  'insert_section_break',
  'define_style',
  'list_styles',
  'set_watermark',
  'insert_text_box',
  'insert_picture',
  'create_document',
] as const

export const DOCX_AGENT_OP_NAMES = [
  'setFont',
  'setMatchedFont',
  'setParagraphFormat',
  'setHeadingLevel',
  'findReplace',
  'deleteBlocks',
  'moveBlocks',
  'setList',
  'clearList',
  'setImageProperties',
  'insertToc',
  'setParagraphAttrs',
  'setOutlineLevel',
  'stepIndent',
  'stepHangingIndent',
] as const

export interface DocxAgentSelection {
  from: number
  to: number
  text: string
}
export interface DocxAgentBlock {
  index: number
  type: string
  text: string
}
export interface DocxAgentContext {
  documentId: string
  version: number
  selection: DocxAgentSelection
  blocks: DocxAgentBlock[]
  text: string
  editingRestriction?: string
}
export interface DocxAgentResult {
  ok: true
  summary: string
  changed: boolean
  version: number
  data?: unknown
}
export interface DocxAgentExecuteOptions {
  expectedVersion?: number
  /** Stable user turn ID, unchanged across TanStack resumed runs. */
  roundId?: string
  signal?: AbortSignal
}
export interface DocxAgentHandle {
  readonly documentId: string
  getVersion(): number
  getContext(): DocxAgentContext
  readImage(blockIndex?: number): {
    blockIndex: number
    version: number
    dataUrl: string
    mimeType: string
  }
  freezeSelection(roundId?: string): DocxAgentSelection
  setRevisionMode(enabled: boolean): void
  beginDraft(roundId: string): void
  appendDraft(roundId: string, delta: string): void
  getDraft(roundId: string): string | null
  hasPendingDraft(): boolean
  commitDraft(roundId: string, options?: { expectedVersion?: number }): Promise<DocxAgentResult>
  discardDraft(roundId: string): void
  execute(tool: string, args: unknown, options?: DocxAgentExecuteOptions): Promise<DocxAgentResult>
  undoRound(roundId: string): boolean
  /** Saving changes the rollback baseline; an old round must not claim a clean canvas. */
  markSaved(): void
  dispose(): void
}

type JsonObject = Record<string, unknown>
type Round = {
  protectionEpoch?: number
  commentsOnly?: boolean
  content: ReturnType<Editor['getJSON']>
  saveOptions: SaveOptions
  lastVersion: number
  dirtyBefore: boolean
}
type Draft = { text: string; version: number; element: HTMLElement }
function escapeHtml(part: string): string {
  return part.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
function escapedParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('')
}
function draftHtml(text: string): string {
  if (!/<\/?(?:p|h[1-6]|ul|ol|li|blockquote|strong|em|b|i|br)\b/i.test(text))
    return escapedParagraphs(text)
  const input = new DOMParser().parseFromString(text, 'text/html').body
  const allowed = new Set([
    'P',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'UL',
    'OL',
    'LI',
    'BLOCKQUOTE',
    'STRONG',
    'EM',
    'B',
    'I',
    'BR',
  ])
  const discard = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'FORM'])
  const clean = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE)
      return (
        node.textContent
          ?.replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;') ?? ''
      )
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const element = node as Element
    if (discard.has(element.tagName)) return ''
    const children = [...element.childNodes].map(clean).join('')
    return allowed.has(element.tagName)
      ? `<${element.tagName.toLowerCase()}>${children}</${element.tagName.toLowerCase()}>`
      : children
  }
  return [...input.childNodes].map(clean).join('')
}
function asObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} 必须是对象`)
  return value as JsonObject
}
function asString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`)
  return value
}
function asIndex(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} 必须是整数`)
  return value as number
}
function blockAt(editor: Editor, index: number): { node: PmNode; from: number; to: number } {
  if (index < 0) throw new Error(`块索引 ${index} 不存在`)
  let found: { node: PmNode; from: number; to: number } | undefined
  editor.state.doc.forEach((node, from, i) => {
    if (i === index) found = { node, from, to: from + node.nodeSize }
  })
  if (!found) throw new Error(`块索引 ${index} 不存在，请重新读取文档`)
  return found
}
function selectionOf(editor: Editor): DocxAgentSelection {
  const { from, to } = editor.state.selection
  return { from, to, text: editor.state.doc.textBetween(from, to, '\n') }
}
function htmlOf(editor: Editor, node: PmNode): string {
  const element = document.createElement('div')
  element.appendChild(DOMSerializer.fromSchema(editor.schema).serializeNode(node))
  return element.innerHTML
}
function replacementNodes(editor: Editor, start: number, end: number, html: string): PmNode[] {
  const element = document.createElement('div')
  element.innerHTML = html
  const parsed = PmDOMParser.fromSchema(editor.schema).parse(element)
  const templates: PmNode[] = []
  for (let i = start; i <= end; i += 1) templates.push(blockAt(editor, i).node)
  const used = new Set<number>()
  const nodes: PmNode[] = []
  parsed.forEach((node) => {
    const templateIndex = templates.findIndex((candidate) => candidate.type === node.type)
    if (templateIndex < 0) {
      nodes.push(node)
      return
    }
    const old = templates[templateIndex]!
    const anchor = !used.has(templateIndex)
    used.add(templateIndex)
    if (node.type.name === 'docTable') {
      nodes.push(inheritTableNode(editor, old, node, anchor))
      return
    }
    if (!node.isTextblock) {
      nodes.push(node)
      return
    }
    let inheritedMarks: PmNode['marks'] = []
    old.descendants((child) => {
      if (inheritedMarks.length === 0 && child.isText)
        inheritedMarks = child.marks.filter((mark) =>
          ['bold', 'italic', 'underline', 'strike', 'docTextStyle'].includes(mark.type.name),
        )
    })
    const content: PmNode[] = []
    node.forEach((child) => {
      if (!child.isText) {
        content.push(child)
        return
      }
      let marks = child.marks
      for (const mark of inheritedMarks)
        if (!marks.some((existing) => existing.type === mark.type)) marks = mark.addToSet(marks)
      content.push(editor.schema.text(child.text ?? '', marks))
    })
    const attrs = {
      ...old.attrs,
      ...Object.fromEntries(
        Object.entries(node.attrs).filter(
          ([key, value]) => value !== null && value !== undefined && key !== 'docxIndex',
        ),
      ),
      docxIndex: anchor ? old.attrs.docxIndex : null,
      aiChanged: true,
    }
    nodes.push(node.type.create(attrs, Fragment.fromArray(content), node.marks))
  })
  return nodes
}

/** Keep Word's table, row and cell properties when AI rewrites table content. */
function inheritTableNode(editor: Editor, old: PmNode, next: PmNode, anchor: boolean): PmNode {
  const inherit = (source: PmNode | null, replacement: PmNode): PmNode => {
    if (!source || source.type !== replacement.type) return replacement
    if (replacement.isTextblock) {
      let marks: PmNode['marks'] = []
      source.descendants((child) => {
        if (marks.length === 0 && child.isText)
          marks = child.marks.filter((mark) =>
            ['bold', 'italic', 'underline', 'strike', 'docTextStyle', 'link'].includes(
              mark.type.name,
            ),
          )
      })
      const content: PmNode[] = []
      replacement.forEach((child) => {
        if (!child.isText) {
          content.push(child)
          return
        }
        let merged = child.marks
        for (const mark of marks)
          if (!merged.some((existing) => existing.type === mark.type))
            merged = mark.addToSet(merged)
        content.push(editor.schema.text(child.text ?? '', merged))
      })
      return replacement.type.create(
        { ...source.attrs, ...nonNullAttrs(replacement.attrs), aiChanged: true },
        Fragment.fromArray(content),
        replacement.marks,
      )
    }
    const children: PmNode[] = []
    replacement.forEach((child, _offset, index) => {
      children.push(inherit(source.maybeChild(index), child))
    })
    return replacement.type.create(
      { ...source.attrs, ...nonNullAttrs(replacement.attrs) },
      Fragment.fromArray(children),
      replacement.marks,
    )
  }
  const table = inherit(old, next)
  return table.type.create(
    { ...table.attrs, docxIndex: anchor ? old.attrs.docxIndex : null, aiChanged: true },
    table.content,
    table.marks,
  )
}

function nonNullAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attrs).filter(([, value]) => value !== null && value !== undefined),
  )
}

const SECT_PR = /<w:sectPr[^>]*\/>|<w:sectPr[\s\S]*?<\/w:sectPr>/

type LiveSection = {
  info: SectionInfo
  ending?: { node: PmNode; from: number; source: string; sectPr: string }
}

function currentSections(
  editor: Editor,
  session: DocxSession,
  saveOptions: SaveOptions,
): LiveSection[] {
  const sections: LiveSection[] = []
  let first = 0
  editor.state.doc.forEach((node, from, index) => {
    const source =
      (node.attrs.genXml as string | null) ??
      session.blocks.find((block) => block.docxIndex === node.attrs.docxIndex)?.originalXml
    const sectPr = typeof source === 'string' ? SECT_PR.exec(source)?.[0] : undefined
    if (!sectPr) return
    sections.push({
      info: sectionFromSectPr(sectPr, first, index, session.footnotes.parsed.gutterAtTop),
      ending: { node, from, source: source!, sectPr },
    })
    first = index + 1
  })
  let trailing = saveOptions.trailingSectPr ?? session.sections.at(-1)?.sectPrXml ?? ''
  if (saveOptions.section) trailing = applySectionSettings(trailing, saveOptions.section)
  if (saveOptions.titlePg !== undefined) trailing = applyTitlePg(trailing, saveOptions.titlePg)
  if (saveOptions.pgNumType)
    trailing = applyPageNumType(trailing, saveOptions.pgNumType.fmt, saveOptions.pgNumType.start)
  sections.push({
    info: sectionFromSectPr(
      trailing,
      first,
      Math.max(first, editor.state.doc.childCount - 1),
      session.footnotes.parsed.gutterAtTop,
    ),
  })
  return sections
}

/** Current section settings for pagination, including unsaved agent edits. */
export function docxAgentLiveSections(
  editor: Editor,
  session: DocxSession,
  saveOptions: SaveOptions,
): SectionInfo[] {
  return currentSections(editor, session, saveOptions).map((section) => section.info)
}

function resolvePageSetup(args: JsonObject, current: SectionSettings): Partial<SaveOptions> {
  const next = { ...current }
  let changed = false
  if (args.paper !== undefined) {
    const entry = Object.entries(PAPER_SIZES).find(
      ([name]) => name.toLowerCase() === asString(args.paper, 'paper').toLowerCase(),
    )
    if (!entry) throw new Error('未知纸张规格')
    ;[next.pageWidth, next.pageHeight] =
      current.orientation === 'landscape' ? [entry[1][1], entry[1][0]] : entry[1]
    changed = true
  }
  if (args.width !== undefined) {
    next.pageWidth = twips(args.width, 'width')
    changed = true
  }
  if (args.height !== undefined) {
    next.pageHeight = twips(args.height, 'height')
    changed = true
  }
  if (args.orientation !== undefined) {
    if (args.orientation !== 'portrait' && args.orientation !== 'landscape')
      throw new Error('orientation 无效')
    next.orientation = args.orientation
    if (next.pageWidth > next.pageHeight !== (args.orientation === 'landscape')) {
      const width = next.pageWidth
      next.pageWidth = next.pageHeight
      next.pageHeight = width
    }
    changed = true
  }
  if (args.margins !== undefined) {
    const margins = asObject(args.margins, 'margins')
    allowedKeys(
      margins,
      ['top', 'right', 'bottom', 'left', 'header', 'footer', 'gutter'],
      'margins',
    )
    const map = {
      top: 'marginTop',
      right: 'marginRight',
      bottom: 'marginBottom',
      left: 'marginLeft',
      header: 'headerDist',
      footer: 'footerDist',
      gutter: 'gutter',
    } as const
    for (const [key, field] of Object.entries(map)) {
      if (margins[key] === undefined) continue
      const value = twips(margins[key], `margins.${key}`)
      if (value < 0) throw new Error(`margins.${key} 不能为负`)
      Object.assign(next, { [field]: value })
      changed = true
    }
  }
  if (args.columns !== undefined) {
    const columns = asObject(args.columns, 'columns')
    allowedKeys(columns, ['count', 'spacing'], 'columns')
    const count = asIndex(columns.count, 'columns.count')
    if (count < 1 || count > 12) throw new Error('columns.count 必须在 1–12 之间')
    next.columns = count
    if (columns.spacing !== undefined) next.colSpace = twips(columns.spacing, 'columns.spacing')
    changed = true
  }
  if (
    next.pageWidth <= 0 ||
    next.pageHeight <= 0 ||
    next.marginLeft + next.marginRight >= next.pageWidth ||
    next.marginTop + next.marginBottom >= next.pageHeight
  )
    throw new Error('纸张与页边距不允许正文区域为空')
  const patch: Partial<SaveOptions> = {}
  if (changed) patch.section = next
  if (args.titlePg !== undefined) {
    if (typeof args.titlePg !== 'boolean') throw new Error('titlePg 必须是布尔值')
    patch.titlePg = args.titlePg
    changed = true
  }
  if (args.pageNumberStart !== undefined || args.pageNumberFormat !== undefined) {
    const start = args.pageNumberStart
    if (
      start !== undefined &&
      start !== null &&
      (!Number.isSafeInteger(start) || (start as number) < 0)
    )
      throw new Error('pageNumberStart 必须是非负整数或 null')
    const fmt =
      args.pageNumberFormat === undefined
        ? undefined
        : asString(args.pageNumberFormat, 'pageNumberFormat')
    if (
      fmt !== undefined &&
      ![
        'decimal',
        'lowerRoman',
        'upperRoman',
        'lowerLetter',
        'upperLetter',
        'decimalFullWidth',
      ].includes(fmt)
    )
      throw new Error('pageNumberFormat 不受支持')
    patch.pgNumType = {
      ...(fmt ? { fmt } : {}),
      ...(typeof start === 'number' ? { start } : {}),
    }
    changed = true
  }
  if (!changed) throw new Error('没有提供可修改的页面设置字段')
  return patch
}

async function dimensionsOf(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener(
      'load',
      () => resolve({ width: image.naturalWidth, height: image.naturalHeight }),
      { once: true },
    )
    image.addEventListener('error', () => reject(new Error('图片无法解码')), { once: true })
    image.src = dataUrl
  })
}

function nextNumericId(items: Array<{ id: string }>): string {
  return String(Math.max(0, ...items.map((item) => Number.parseInt(item.id, 10) || 0)) + 1)
}
function revisionType(kind: string): 'insertion' | 'deletion' | 'formatting' | 'move' {
  if (kind === 'ins' || kind === 'blockIns' || kind === 'rowIns' || kind === 'cellIns')
    return 'insertion'
  if (
    kind === 'del' ||
    kind === 'blockDel' ||
    kind === 'rowDel' ||
    kind === 'cellDel' ||
    kind === 'both'
  )
    return 'deletion'
  if (kind === 'moveFrom' || kind === 'moveTo') return 'move'
  return 'formatting'
}
function indexAtPosition(editor: Editor, position: number): number {
  let found = -1
  editor.state.doc.forEach((node, from, index) => {
    if (found < 0 && position >= from && position < from + node.nodeSize) found = index
  })
  return found
}

const PAPER_SIZES: Record<string, [number, number]> = {
  A3: [16838, 23811],
  A4: [11906, 16838],
  A5: [8391, 11906],
  B5: [10319, 14572],
  Letter: [12240, 15840],
  Legal: [12240, 20160],
  Tabloid: [15840, 24480],
}
function twips(value: unknown, label: string): number {
  const factors: Record<string, number> = {
    twip: 1,
    twips: 1,
    pt: 20,
    px: 15,
    in: 1440,
    cm: 566.929,
    mm: 56.6929,
  }
  const match =
    typeof value === 'string'
      ? /^\s*(-?\d+(?:\.\d+)?)\s*(twips?|pt|px|in|cm|mm)\s*$/i.exec(value)
      : null
  const result =
    typeof value === 'number'
      ? value
      : match
        ? Number(match[1]) * factors[match[2]!.toLowerCase()]!
        : NaN
  if (!Number.isFinite(result) || Math.abs(result) > 50_400) throw new Error(`${label} 长度无效`)
  return Math.round(result)
}
function styleTwips(value: unknown, label: string): number | null {
  if (value === null) return null
  return typeof value === 'number' ? twips(`${value}pt`, label) : twips(value, label)
}
function emu(value: unknown, label: string): number {
  const input = typeof value === 'number' ? `${value}pt` : value
  return twips(input, label) * 635
}
function pxFromEmu(value: number): number {
  return Math.max(1, Math.round(value / 9525))
}
function colorHex(value: unknown, label: string): string | null {
  if (value === null) return null
  const match = /^#?([0-9a-fA-F]{6})$/.exec(asString(value, label))
  if (!match) throw new Error(`${label} 必须是 #RRGGBB`)
  return match[1]!.toUpperCase()
}

function anchorRange(
  editor: Editor,
  index: number,
  exact?: string,
  occurrence = 1,
): { from: number; to: number; text: string } {
  const block = blockAt(editor, index)
  if (!block.node.textContent) throw new Error('目标块没有可批注的文字')
  const text = block.node.textContent
  let start = 0
  if (exact !== undefined) {
    if (!exact || !Number.isSafeInteger(occurrence) || occurrence < 1)
      throw new Error('批注锚点文字或 occurrence 无效')
    for (let n = 0; n < occurrence; n += 1) {
      start = text.indexOf(exact, start)
      if (start < 0) throw new Error('目标块中找不到指定的批注锚点')
      if (n < occurrence - 1) start += exact.length
    }
  }
  const end = exact === undefined ? text.length : start + exact.length
  let consumed = 0
  const segments: Array<{ textFrom: number; textTo: number; pos: number }> = []
  block.node.descendants((node, relative) => {
    if (!node.isText || !node.text) return
    segments.push({
      textFrom: consumed,
      textTo: consumed + node.text.length,
      pos: block.from + 1 + relative,
    })
    consumed += node.text.length
  })
  const position = (offset: number): number => {
    const segment = segments.find((item) => offset >= item.textFrom && offset <= item.textTo)
    if (!segment) throw new Error('批注锚点不能映射到正文')
    return segment.pos + offset - segment.textFrom
  }
  return { from: position(start), to: position(end), text: text.slice(start, end) }
}

/** A revocable view of the live editor. Unsupported operations fail without mutating it. */
export function createDocxAgentHandle(
  editor: Editor,
  documentId: string,
  options: {
    isDirty: () => boolean
    onDirtyChange: (dirty: boolean) => void
    headingLevels?: readonly number[]
    session?: DocxSession
    saveOptions?: { current: SaveOptions }
    onSaveOptionsChange?: () => void
  },
): DocxAgentHandle {
  let version = 0
  let disposed = false
  let frozen: DocxAgentSelection | null = null
  let frozenVersion: number | null = null
  const roundSelections = new Map<
    string,
    { selection: DocxAgentSelection; version: number; writeVersion: number }
  >()
  const rounds = new Map<string, Round>()
  const drafts = new Map<string, Draft>()
  let draftBaseline: { dirty: boolean; version: number } | null = null
  let revisionMode = false
  let revisionRestore: boolean | null = null
  const trackStorage = () =>
    (editor.storage as unknown as { trackChanges?: { enabled?: boolean } }).trackChanges
  const restoreRevision = () => {
    if (revisionRestore === null) {
      if (options.session?.protection.getAccess().mandatoryTracking && trackStorage())
        trackStorage()!.enabled = true
      return
    }
    const storage = trackStorage()
    if (storage)
      storage.enabled = options.session?.protection.getAccess().mandatoryTracking || revisionRestore
    revisionRestore = null
  }
  const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
    if (transaction.docChanged) version += 1
  }
  editor.on('transaction', onTransaction)
  const live = (signal?: AbortSignal) => {
    if (disposed || editor.isDestroyed) throw new Error('文档编辑器已关闭，请重新打开文档')
    if (signal?.aborted) throw new Error('工具调用已停止')
  }
  const result = (summary: string, changed = false, data?: unknown): DocxAgentResult => ({
    ok: true,
    summary,
    changed,
    version,
    ...(data === undefined ? {} : { data }),
  })
  const assertWrite = () => options.session?.protection.assertWrite()
  const unsubscribeProtection = options.session?.protection.subscribe(() => {
    version += 1
  })
  const beforeWrite = (roundId?: string, commentsOnly = false) => {
    if (!commentsOnly) assertWrite()
    if (options.session?.protection.getAccess().mandatoryTracking) {
      if (
        !editor.state.plugins.some((plugin) =>
          (plugin as unknown as { key: string }).key.startsWith('mimirForcedTracking'),
        )
      )
        throw new Error('当前编辑器未挂载强制修订守卫，未修改文档')
      if (trackStorage()) trackStorage()!.enabled = true
    }
    if (!commentsOnly && revisionMode && revisionRestore === null) {
      const storage = trackStorage()
      if (!storage) throw new Error('当前编辑器不支持 AI 修订')
      revisionRestore = storage.enabled === true
      storage.enabled = true
    }
    if (roundId && !rounds.has(roundId))
      rounds.set(roundId, {
        content: editor.getJSON(),
        saveOptions: structuredClone(options.saveOptions?.current ?? {}),
        lastVersion: version,
        dirtyBefore: options.isDirty(),
        protectionEpoch: options.session?.protection.getAccess().epoch,
        commentsOnly: options.session?.protection.getAccess().commentsOnly === true,
      })
  }
  const afterWrite = (roundId?: string) => {
    restoreRevision()
    if (roundId) {
      const round = rounds.get(roundId)
      if (round) round.lastVersion = version
      const selection = roundSelections.get(roundId)
      if (selection) selection.writeVersion = version
    }
    options.onDirtyChange(true)
  }
  const forcedText = (html: string) => {
    const host = document.createElement('div')
    host.innerHTML = html
    // DOMParser can discard block CSS/attributes before schema comparison.
    // Only plain paragraph wrappers and supported inline elements carry text intent here.
    for (const element of host.querySelectorAll('*')) {
      if (
        !['P', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE'].includes(element.tagName) ||
        (element.tagName === 'P' && element.attributes.length > 0)
      )
        throw new Error(FORCED_TRACKING_REASON)
    }
    const parsed = PmDOMParser.fromSchema(editor.schema).parse(host)
    const paragraph = editor.schema.nodes.docParagraph!.create()
    if (parsed.childCount !== 1 || !parsed.firstChild?.hasMarkup(paragraph.type, paragraph.attrs))
      throw new Error(FORCED_TRACKING_REASON)
    const content = parsed.firstChild.content
    content.forEach((node) => {
      if (!node.isText) throw new Error(FORCED_TRACKING_REASON)
    })
    return content
  }
  const publishTrackedText = (tr: Transaction, roundId?: string) => {
    if (!tr.docChanged || tr.doc.eq(editor.state.doc)) return false
    const before = editor.state.doc,
      hadRound = roundId ? rounds.has(roundId) : false
    beforeWrite(roundId)
    editor.view.dispatch(tr)
    if (before.eq(editor.state.doc)) {
      if (roundId && !hadRound) rounds.delete(roundId)
      throw new Error(FORCED_TRACKING_REASON)
    }
    options.session!.protection.assertSave(editor.getJSON(), options.saveOptions?.current ?? {})
    afterWrite(roundId)
    return true
  }
  const updateSaveOptions = (
    patch: Partial<SaveOptions>,
    roundId?: string,
    commentMutation = false,
  ) => {
    const state = options.saveOptions
    if (!state) throw new Error('当前编辑器没有 DOCX 附加结构保存状态')
    const commentsOnly = options.session?.protection.getAccess().commentsOnly === true
    if (commentsOnly) {
      if (!commentMutation || Object.keys(patch).some((key) => key !== 'comments')) assertWrite()
      options.session!.protection.assertCommentMutation(editor.getJSON(), {
        ...state.current,
        ...patch,
      })
    }
    beforeWrite(roundId, commentsOnly)
    state.current = { ...state.current, ...patch }
    version += 1
    options.onSaveOptionsChange?.()
    afterWrite(roundId)
    return true
  }
  // Validate the entire PM + metadata pair before dispatch. A rejected PM
  // transaction must not publish an orphan comment or manufacture history/dirty.
  const publishCommentTransaction = (tr: Transaction, list: CommentInfo[], roundId?: string) => {
    const state = options.saveOptions
    if (!state) throw new Error('当前编辑器没有 DOCX 附加结构保存状态')
    const protection = options.session?.protection
    const commentsOnly = protection?.getAccess().commentsOnly === true
    const next = { ...state.current, comments: list }
    if (commentsOnly) protection!.assertCommentMutation(tr.doc.toJSON(), next)
    const hadRound = roundId ? rounds.has(roundId) : false
    beforeWrite(roundId, commentsOnly)
    const publish = () => {
      if (tr.docChanged) editor.view.dispatch(tr)
      return editor.state.doc.eq(tr.doc)
    }
    const accepted = commentsOnly
      ? protection!.runCommentTransaction(tr.doc.toJSON(), next, publish)
      : publish()
    if (!accepted) {
      if (roundId && !hadRound) rounds.delete(roundId)
      throw new Error('批注事务未被编辑器接受，请重新选择后再试')
    }
    state.current = next
    if (!tr.docChanged) version += 1
    options.onSaveOptionsChange?.()
    afterWrite(roundId)
  }
  const comments = (): CommentInfo[] =>
    structuredClone(
      options.saveOptions?.current.comments ??
        options.session?.protection.readComments() ??
        options.session?.footnotes.parsed.comments ??
        [],
    )
  // Deleted original IDs remain reserved: the protected native writer treats
  // them as immutable identities, including their original author/date/parent.
  const nextCommentId = (list: CommentInfo[]): string =>
    nextNumericId([...list, ...(options.session?.protection.readComments() ?? [])])
  const notes = (kind: 'footnote' | 'endnote'): NoteInfo[] =>
    structuredClone(
      (kind === 'footnote'
        ? options.saveOptions?.current.footnotes
        : options.saveOptions?.current.endnotes) ??
        (kind === 'footnote'
          ? options.session?.footnotes.parsed.footnotes
          : options.session?.footnotes.parsed.endnotes) ??
        [],
    )
  return {
    documentId,
    getVersion: () => version,
    getContext() {
      live()
      const blocks: DocxAgentBlock[] = []
      editor.state.doc.forEach((node, _offset, index) =>
        blocks.push({
          index,
          type: node.type.name,
          text: node.textContent.slice(0, 500),
        }),
      )
      return {
        documentId,
        version,
        selection: frozen ?? selectionOf(editor),
        blocks,
        text: editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n'),
        ...(options.session?.protection.getAccess().mandatoryTracking
          ? { editingRestriction: FORCED_TRACKING_REASON }
          : {}),
      }
    },
    readImage(blockIndex) {
      live()
      let index = blockIndex
      if (index === undefined) {
        const pos = editor.state.selection.from
        editor.state.doc.forEach((node, from, i) => {
          if (index === undefined && pos >= from && pos < from + node.nodeSize) index = i
        })
      }
      if (index === undefined) throw new Error('未选中图片，请指定图片块索引')
      const block = blockAt(editor, index)
      let source: unknown =
        block.node.type.name === 'docProtected' && block.node.attrs.blockType === 'image'
          ? block.node.attrs.imageDataUrl
          : undefined
      if (!source)
        block.node.descendants((node) => {
          if (!source && node.type.name === 'docInlineImage') source = node.attrs.dataUrl
        })
      if (
        typeof source !== 'string' ||
        !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/s.test(source)
      ) {
        throw new Error('所选块没有可分析的内嵌图片')
      }
      if (source.length > 28_000_000) throw new Error('文档图片超过 20 MB 分析限制')
      return {
        blockIndex: index,
        version,
        dataUrl: source,
        mimeType: source.slice(5, source.indexOf(';')),
      }
    },
    freezeSelection(roundId) {
      live()
      frozen = selectionOf(editor)
      frozenVersion = version
      if (roundId)
        roundSelections.set(roundId, { selection: frozen, version, writeVersion: version })
      return { ...frozen }
    },
    setRevisionMode(enabled) {
      live()
      if (!enabled && options.session?.protection.getAccess().mandatoryTracking)
        throw new Error(FORCED_TRACKING_REASON)
      revisionMode = enabled
    },
    beginDraft(roundId) {
      live()
      assertWrite()
      if (options.session?.protection.getAccess().mandatoryTracking)
        throw new Error(FORCED_TRACKING_REASON)
      if (!roundId || drafts.has(roundId)) throw new Error('草稿轮次无效或已经开始')
      if (drafts.size === 0) draftBaseline = { dirty: options.isDirty(), version }
      const element = document.createElement('div')
      element.dataset.docxAgentDraft = roundId
      element.setAttribute('role', 'status')
      element.setAttribute('aria-label', 'AI 写作草稿，尚未写入文档')
      element.style.cssText =
        'white-space:pre-wrap;padding:12px 16px;margin:12px 0;border:1px dashed #8b9bb4;border-radius:8px;background:rgba(125,145,180,.08);color:inherit'
      editor.view.dom.insertAdjacentElement('afterend', element)
      drafts.set(roundId, { text: '', version, element })
      options.onDirtyChange(true)
    },
    appendDraft(roundId, delta) {
      live()
      assertWrite()
      const draft = drafts.get(roundId)
      if (!draft) throw new Error('草稿不存在或已结束')
      if (typeof delta !== 'string') throw new Error('草稿片段必须是字符串')
      if (draft.text.length + delta.length > 200_000) throw new Error('草稿超过 20 万字符限制')
      draft.text += delta
      draft.element.innerHTML = draftHtml(draft.text)
    },
    getDraft(roundId) {
      live()
      return drafts.get(roundId)?.text ?? null
    },
    hasPendingDraft() {
      live()
      return drafts.size > 0
    },
    async commitDraft(roundId, commitOptions = {}) {
      live()
      assertWrite()
      const draft = drafts.get(roundId)
      if (!draft) throw new Error('草稿不存在或已结束')
      if (!draft.text.trim()) throw new Error('草稿为空，无法保留')
      const expectedVersion = commitOptions.expectedVersion ?? draft.version
      const outcome = await this.execute(
        'insert_content',
        { html: draftHtml(draft.text) },
        { roundId, expectedVersion },
      )
      draft.element.remove()
      drafts.delete(roundId)
      if (drafts.size === 0) draftBaseline = null
      return outcome
    },
    discardDraft(roundId) {
      live()
      drafts.get(roundId)?.element.remove()
      drafts.delete(roundId)
      if (drafts.size === 0) {
        if (draftBaseline && draftBaseline.version === version)
          options.onDirtyChange(draftBaseline.dirty)
        draftBaseline = null
      }
    },
    async execute(tool, input, executeOptions = {}) {
      try {
        live(executeOptions.signal)
        const { expectedVersion, roundId } = executeOptions
        const roundSelection = roundId ? roundSelections.get(roundId) : undefined
        if (expectedVersion !== undefined && expectedVersion !== version) {
          throw new Error(`文档已从版本 ${expectedVersion} 改为 ${version}，请重新读取后再操作`)
        }
        const args = asObject(input, `${tool} 参数`)
        const readTools = new Set<string>([
          'get_document_context',
          'read_blocks',
          'read_revisions',
          'read_comments',
          'read_notes',
          'list_styles',
        ])
        const mandatoryTracking = options.session?.protection.getAccess().mandatoryTracking === true
        if (
          mandatoryTracking &&
          !readTools.has(tool) &&
          !['insert_content', 'replace_selection', 'replace_blocks', 'apply_ops'].includes(tool)
        )
          throw new Error(FORCED_TRACKING_REASON)
        if (
          mandatoryTracking &&
          tool === 'apply_ops' &&
          (!Array.isArray(args.ops) ||
            args.ops.some(
              (op) => !op || typeof op !== 'object' || (op as JsonObject).op !== 'findReplace',
            ))
        )
          throw new Error(FORCED_TRACKING_REASON)
        const commentsOnly = options.session?.protection.getAccess().commentsOnly === true
        const commentTool = [
          'edit_comment',
          'reply_comment',
          'resolve_comment',
          'add_comment',
          'delete_comment',
        ].includes(tool)
        if (!readTools.has(tool) && !(commentsOnly && commentTool)) assertWrite()
        if (roundSelection && !readTools.has(tool) && roundSelection.writeVersion !== version) {
          throw new Error('发送后文档发生其他编辑，请重新读取当前画布后再执行写入')
        }
        if (tool === 'get_document_context') {
          const context = this.getContext()
          if (roundSelection) context.selection = roundSelection.selection
          if (roundSelection) roundSelection.writeVersion = version
          return result(`已读取当前文档（${context.blocks.length} 个块）`, false, context)
        }
        if (tool === 'read_blocks') {
          const start = asIndex(args.startBlockIndex, 'startBlockIndex')
          const end = asIndex(args.endBlockIndex, 'endBlockIndex')
          const offset = args.offset === undefined ? 0 : asIndex(args.offset, 'offset')
          if (start < 0 || end < start || offset < 0 || end - start > 500)
            throw new Error('块范围或读取偏移无效')
          const html: string[] = []
          for (let i = start; i <= end; i += 1) html.push(htmlOf(editor, blockAt(editor, i).node))
          const full = html.join('\n')
          const slice = full.slice(offset, offset + 24_000)
          if (roundSelection) roundSelection.writeVersion = version
          return result(`已读取第 ${start}–${end} 块`, false, {
            html: slice,
            offset,
            nextOffset: offset + slice.length < full.length ? offset + slice.length : null,
          })
        }
        if (tool === 'read_revisions') {
          allowedKeys(args, [], tool)
          const revisions = collectRevisions(editor.state.doc).map((range, index) => ({
            id: `r${index + 1}`,
            type: revisionType(range.kind),
            kind: range.kind,
            blockIndex: indexAtPosition(editor, range.from),
            author: range.author,
            date: range.date ?? null,
            from: range.from,
            to: range.to,
            text: editor.state.doc.textBetween(range.from, range.to, ' ').slice(0, 500),
          }))
          return result(`已读取 ${revisions.length} 处修订`, false, revisions)
        }
        if (tool === 'accept_changes' || tool === 'reject_changes') {
          allowedKeys(
            args,
            ['all', 'ids', 'author', 'type', 'blockIndex', 'blockRange', 'before'],
            tool,
          )
          if (args.all !== undefined && typeof args.all !== 'boolean')
            throw new Error('all 必须是布尔值')
          const revisions = collectRevisions(editor.state.doc)
          const ids = args.ids
          if (
            ids !== undefined &&
            (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string'))
          ) {
            throw new Error('ids 必须是修订 ID 数组')
          }
          if (args.author !== undefined) asString(args.author, 'author')
          if (
            args.type !== undefined &&
            !['insertion', 'deletion', 'formatting', 'move'].includes(String(args.type))
          )
            throw new Error('type 无效')
          const blockIndex =
            args.blockIndex === undefined ? null : asIndex(args.blockIndex, 'blockIndex')
          if (blockIndex !== null) blockAt(editor, blockIndex)
          const blockRange = args.blockRange
          if (
            blockRange !== undefined &&
            (!Array.isArray(blockRange) ||
              blockRange.length !== 2 ||
              !blockRange.every(Number.isSafeInteger))
          )
            throw new Error('blockRange 必须是两个块索引')
          if (
            Array.isArray(blockRange) &&
            (blockRange[0] < 0 ||
              blockRange[1] < blockRange[0] ||
              blockRange[1] >= editor.state.doc.childCount)
          )
            throw new Error('blockRange 超出范围')
          const before =
            args.before === undefined ? null : Date.parse(asString(args.before, 'before'))
          if (before !== null && !Number.isFinite(before)) throw new Error('before 必须是 ISO 日期')
          if (
            args.all !== true &&
            ids === undefined &&
            args.author === undefined &&
            args.type === undefined &&
            blockIndex === null &&
            blockRange === undefined &&
            before === null
          ) {
            throw new Error('请指定修订筛选条件，避免误改全部修订')
          }
          const idSet = ids === undefined ? null : new Set(ids)
          const selected = revisions.filter(
            (range, index) =>
              (idSet === null || idSet.has(`r${index + 1}`)) &&
              (args.author === undefined ||
                range.author.toLowerCase() === asString(args.author, 'author').toLowerCase()) &&
              (args.type === undefined || revisionType(range.kind) === args.type) &&
              (blockIndex === null || indexAtPosition(editor, range.from) === blockIndex) &&
              (blockRange === undefined ||
                (indexAtPosition(editor, range.from) >= blockRange[0] &&
                  indexAtPosition(editor, range.from) <= blockRange[1])) &&
              (before === null || (range.date !== undefined && Date.parse(range.date) < before)),
          )
          if (
            idSet &&
            [...idSet].some(
              (id) => !/^r[1-9]\d*$/.test(id) || Number(id.slice(1)) > revisions.length,
            )
          ) {
            throw new Error('修订 ID 已过期，请重新读取修订')
          }
          if (selected.length === 0) return result('没有匹配的修订', false)
          beforeWrite(roundId)
          applyRevisions(editor, selected, tool === 'accept_changes' ? 'accept' : 'reject')
          afterWrite(roundId)
          return result(
            `已${tool === 'accept_changes' ? '接受' : '拒绝'} ${selected.length} 处修订，尚未保存到库`,
            true,
          )
        }
        if (tool === 'read_comments') {
          const list = comments()
          const anchors = new Map<string, { blockIndex: number; text: string }>()
          editor.state.doc.forEach((block, _offset, blockIndex) => {
            block.descendants((node) => {
              if (!node.isText) return
              for (const mark of node.marks) {
                if (mark.type.name !== 'comment') continue
                for (const id of String(mark.attrs.ids).split(/\s+/).filter(Boolean)) {
                  const previous = anchors.get(id)
                  anchors.set(id, { blockIndex, text: (previous?.text ?? '') + (node.text ?? '') })
                }
              }
            })
          })
          return result(
            `已读取 ${list.length} 条批注`,
            false,
            list.map((item) => ({
              ...item,
              anchor: anchors.get(item.parentId ?? item.id) ?? null,
            })),
          )
        }
        if (tool === 'add_comment') {
          allowedKeys(
            args,
            ['blockIndex', 'comment', 'text', 'occurrence', 'author', 'initials'],
            tool,
          )
          if (commentsOnly) {
            const reason = options.session!.protection.getCommentAccess('').add
            if (reason) throw new Error(reason)
          }
          const blockIndex = asIndex(args.blockIndex, 'blockIndex')
          const body = asString(args.comment, 'comment').trim()
          if (!body) throw new Error('批注内容不能为空')
          const exact = args.text === undefined ? undefined : asString(args.text, 'text')
          const occurrence =
            args.occurrence === undefined ? 1 : asIndex(args.occurrence, 'occurrence')
          const anchor = anchorRange(editor, blockIndex, exact, occurrence)
          const markType = editor.schema.marks.comment
          if (!markType) throw new Error('编辑器缺少批注标记')
          let overlaps = false
          editor.state.doc.nodesBetween(anchor.from, anchor.to, (node) => {
            if (node.isText && node.marks.some((mark) => mark.type === markType)) overlaps = true
          })
          if (overlaps) throw new Error('锚点已包含其他批注，不能覆盖其标记')
          const list = comments()
          const id = nextCommentId(list)
          const item: CommentInfo = {
            id,
            text: body,
            author: args.author === undefined ? 'AI' : asString(args.author, 'author'),
            ...(args.initials === undefined
              ? {}
              : { initials: asString(args.initials, 'initials') }),
            date: new Date().toISOString(),
          }
          publishCommentTransaction(
            editor.state.tr.addMark(anchor.from, anchor.to, markType.create({ ids: id })),
            [...list, item],
            roundId,
          )
          return result(`已添加批注 ${id}，尚未保存到库`, true, { id, anchor })
        }
        // Manual toolbar action; deliberately absent from the model tool catalog.
        if (tool === 'edit_comment') {
          allowedKeys(args, ['id', 'text', 'done'], tool)
          const id = asString(args.id, 'id')
          const list = comments()
          if (!list.some((item) => item.id === id)) throw new Error(`找不到批注 ${id}，请重新读取`)
          const text = args.text === undefined ? undefined : asString(args.text, 'text').trim()
          if (text !== undefined && !text) throw new Error('批注内容不能为空')
          if (args.done !== undefined && typeof args.done !== 'boolean')
            throw new Error('done 必须是布尔值')
          if (text === undefined && args.done === undefined) throw new Error('没有要修改的批注内容')
          if (commentsOnly) {
            const access = options.session!.protection.getCommentAccess(id)
            const reason =
              text !== undefined
                ? access.editText
                : args.done === true
                  ? access.resolve
                  : access.reopen
            if (reason) throw new Error(reason)
          }
          const target = list.find((item) => item.id === id)!
          if (
            (text === undefined || text === target.text) &&
            (args.done === undefined || !!args.done === !!target.done)
          )
            return result('批注没有产生实际修改')
          updateSaveOptions(
            {
              comments: list.map((item) =>
                item.id === id
                  ? Object.assign({}, item, {
                      ...(text === undefined ? {} : { text }),
                      ...(args.done === undefined ? {} : { done: args.done === true }),
                    })
                  : item,
              ),
            },
            roundId,
            true,
          )
          return result('批注已更新，尚未保存到库', true)
        }
        if (tool === 'reply_comment') {
          allowedKeys(args, ['parentId', 'text', 'author'], tool)
          const parentId = asString(args.parentId, 'parentId')
          const body = asString(args.text, 'text').trim()
          if (!body) throw new Error('回复内容不能为空')
          const list = comments()
          const parent = list.find((item) => item.id === parentId)
          if (!parent) throw new Error(`找不到批注 ${parentId}，请重新读取`)
          const rootId = parent.parentId ?? parent.id
          if (commentsOnly) {
            const reason = options.session!.protection.getCommentAccess(rootId).reply
            if (reason) throw new Error(reason)
          }
          const id = nextCommentId(list)
          updateSaveOptions(
            {
              comments: [
                ...list,
                {
                  id,
                  parentId: rootId,
                  author: args.author === undefined ? 'AI' : asString(args.author, 'author'),
                  date: new Date().toISOString(),
                  text: body,
                },
              ],
            },
            roundId,
            true,
          )
          return result(`已回复批注 ${rootId}，尚未保存到库`, true, { id })
        }
        if (tool === 'resolve_comment') {
          allowedKeys(args, ['id'], tool)
          const id = asString(args.id, 'id')
          const list = comments()
          const target = list.find((item) => item.id === id)
          if (!target) throw new Error(`找不到批注 ${id}，请重新读取`)
          const rootId = target.parentId ?? target.id
          if (commentsOnly) {
            const reason = options.session!.protection.getCommentAccess(rootId).resolve
            if (reason) throw new Error(reason)
          }
          if (list.find((c) => c.id === rootId)?.done) return result('这条讨论已解决')
          updateSaveOptions(
            { comments: list.map((item) => (item.id === rootId ? { ...item, done: true } : item)) },
            roundId,
            true,
          )
          return result(`批注 ${rootId} 已解决，尚未保存到库`, true)
        }
        if (tool === 'delete_comment') {
          allowedKeys(args, ['id', 'withReplies'], tool)
          if (args.withReplies !== undefined && typeof args.withReplies !== 'boolean')
            throw new Error('withReplies 必须是布尔值')
          const id = asString(args.id, 'id')
          const list = comments()
          const target = list.find((item) => item.id === id)
          if (!target) throw new Error(`找不到批注 ${id}，请重新读取`)
          if (commentsOnly) {
            const reason = options.session!.protection.getCommentAccess(id).delete
            if (reason) throw new Error(reason)
          }
          const replies = list.filter((item) => item.parentId === id)
          if (replies.length && args.withReplies !== true)
            throw new Error('批注有回复；删除整条讨论需 withReplies: true')
          const deleted = new Set([
            id,
            ...(args.withReplies === true ? replies.map((item) => item.id) : []),
          ])
          const tr = editor.state.tr
          const markType = editor.schema.marks.comment
          if (markType)
            editor.state.doc.descendants((node, pos) => {
              if (!node.isText) return
              const mark = node.marks.find((item) => item.type === markType)
              if (!mark) return
              const remaining = String(mark.attrs.ids)
                .split(/\s+/)
                .filter((item) => item && !deleted.has(item))
              if (remaining.length === String(mark.attrs.ids).split(/\s+/).filter(Boolean).length)
                return
              tr.removeMark(pos, pos + node.nodeSize, markType)
              if (remaining.length)
                tr.addMark(pos, pos + node.nodeSize, markType.create({ ids: remaining.join(' ') }))
            })
          publishCommentTransaction(
            tr,
            list.filter((item) => !deleted.has(item.id)),
            roundId,
          )
          return result(`已删除 ${deleted.size} 条批注，尚未保存到库`, true)
        }
        if (tool === 'read_notes') {
          const refs = new Map<string, number>()
          editor.state.doc.forEach((block, _offset, blockIndex) => {
            block.descendants((node) => {
              if (node.type.name === 'docNoteRef')
                refs.set(`${node.attrs.kind}:${node.attrs.id}`, blockIndex)
            })
          })
          const list = (['footnote', 'endnote'] as const).flatMap((kind) =>
            notes(kind).map((note, index) => ({
              kind,
              id: note.id,
              number: index + 1,
              text: note.text,
              blockIndex: refs.get(`${kind}:${note.id}`) ?? null,
            })),
          )
          return result(`已读取 ${list.length} 条脚注或尾注`, false, list)
        }
        if (tool === 'insert_footnote' || tool === 'insert_endnote') {
          const kind = tool === 'insert_footnote' ? 'footnote' : 'endnote'
          const blockIndex = asIndex(args.blockIndex, 'blockIndex')
          const text = asString(args.text, 'text').trim()
          if (!text) throw new Error('注释内容不能为空')
          const block = blockAt(editor, blockIndex)
          if (!['docParagraph', 'docHeading', 'docListItem'].includes(block.node.type.name)) {
            throw new Error('只能在可编辑段落中插入注释')
          }
          // A toolbar panel captures the exact cursor/selection endpoint before
          // taking focus. Agent callers retain afterText / paragraph-end semantics.
          const at =
            args.position !== undefined
              ? asIndex(args.position, 'position')
              : args.afterText === undefined
                ? block.to - 1
                : anchorRange(editor, blockIndex, asString(args.afterText, 'afterText')).to
          if (at < block.from + 1 || at > block.to - 1)
            throw new Error('注释位置已不在目标段落，请重新定位')
          const list = notes(kind)
          const id = nextNumericId(list)
          if (!options.saveOptions) throw new Error('当前编辑器没有 DOCX 附加结构保存状态')
          beforeWrite(roundId)
          editor.view.dispatch(closeHistory(editor.state.tr))
          if (
            !editor.commands.insertContentAt(at, {
              type: 'docNoteRef',
              attrs: { kind, id, num: list.length + 1 },
            })
          ) {
            throw new Error('编辑器拒绝插入注释引用')
          }
          editor.view.dispatch(closeHistory(editor.state.tr))
          updateSaveOptions(
            { [kind === 'footnote' ? 'footnotes' : 'endnotes']: [...list, { id, text }] },
            roundId,
          )
          return result(
            `已插入${kind === 'footnote' ? '脚注' : '尾注'} ${id}，尚未保存到库`,
            true,
            { id },
          )
        }
        if (tool === 'delete_note') {
          const kind = args.kind
          if (kind !== 'footnote' && kind !== 'endnote')
            throw new Error('kind 必须是 footnote 或 endnote')
          const id = asString(args.id, 'id')
          const list = notes(kind)
          if (!list.some((note) => note.id === id)) throw new Error(`找不到 ${kind} ${id}`)
          const positions: number[] = []
          editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'docNoteRef' && node.attrs.kind === kind && node.attrs.id === id)
              positions.push(pos)
          })
          if (!positions.length) throw new Error('注释没有正文引用，拒绝只删除定义')
          const tr = editor.state.tr
          for (const pos of positions.toSorted((a, b) => b - a)) tr.delete(pos, pos + 1)
          beforeWrite(roundId)
          editor.view.dispatch(tr)
          updateSaveOptions(
            {
              [kind === 'footnote' ? 'footnotes' : 'endnotes']: list.filter(
                (note) => note.id !== id,
              ),
            },
            roundId,
          )
          return result(`已删除${kind === 'footnote' ? '脚注' : '尾注'} ${id}，尚未保存到库`, true)
        }
        if (tool === 'edit_note') {
          const id = asString(args.id, 'id')
          const find = asString(args.find, 'find')
          const replacement = asString(args.replace, 'replace')
          if (!find) throw new Error('find 不能为空')
          const kinds =
            args.kind === undefined
              ? (['footnote', 'endnote'] as const)
              : args.kind === 'footnote' || args.kind === 'endnote'
                ? ([args.kind] as const)
                : (() => {
                    throw new Error('kind 必须是 footnote 或 endnote')
                  })()
          const matching = kinds.flatMap((kind) =>
            notes(kind)
              .filter((note) => note.id === id)
              .map((note) => ({ kind, note })),
          )
          if (matching.length !== 1)
            throw new Error(
              matching.length ? 'ID 同时属于脚注和尾注，请指定 kind' : `找不到注释 ${id}`,
            )
          const { kind, note } = matching[0]!
          const list = notes(kind)
          const edited = replaceNoteText(note, find, replacement, args.matchCase !== false)
          updateSaveOptions(
            {
              [kind === 'footnote' ? 'footnotes' : 'endnotes']: list.map((item) =>
                item.id === id ? edited : item,
              ),
            },
            roundId,
          )
          return result(`已更新${kind === 'footnote' ? '脚注' : '尾注'} ${id}，尚未保存到库`, true)
        }
        if (tool === 'set_header_footer') {
          const kind = args.kind
          if (kind !== 'header' && kind !== 'footer')
            throw new Error('kind 必须是 header 或 footer')
          const view = args.view ?? 'default'
          if (view !== 'default' && view !== 'first' && view !== 'even') {
            throw new Error('view 必须是 default、first 或 even')
          }
          const raw = asString(args.text, 'text')
          const text = raw
            .replaceAll('{PAGE}', PAGE_MARK)
            .replaceAll('{NUMPAGES}', TOTAL_PAGES_MARK)
          const part = { text, pageNumber: raw.includes('{PAGE}') }
          const key =
            view === 'default'
              ? kind
              : (`${kind}${view === 'first' ? 'First' : 'Even'}` as keyof SaveOptions)
          updateSaveOptions(
            {
              [key]: part,
              ...(view === 'first' ? { titlePg: true } : {}),
              ...(view === 'even' ? { evenAndOddHeaders: true } : {}),
            },
            roundId,
          )
          return result(
            `已更新${kind === 'header' ? '页眉' : '页脚'}（${view}），尚未保存到库`,
            true,
          )
        }
        if (tool === 'set_page_setup') {
          allowedKeys(
            args,
            [
              'section',
              'blockIndex',
              'paper',
              'width',
              'height',
              'orientation',
              'margins',
              'columns',
              'titlePg',
              'pageNumberStart',
              'pageNumberFormat',
            ],
            tool,
          )
          if (!options.session || !options.saveOptions)
            throw new Error('当前文档没有可编辑的页面设置')
          const sections = currentSections(editor, options.session, options.saveOptions.current)
          const targets =
            args.section !== undefined
              ? [asIndex(args.section, 'section')]
              : args.blockIndex !== undefined
                ? [
                    sections.findIndex(
                      (section) =>
                        asIndex(args.blockIndex, 'blockIndex') <= section.info.lastBlockIndex,
                    ),
                  ]
                : sections.map((_section, index) => index)
          if (targets.some((index) => index < 0 || index >= sections.length))
            throw new Error('节索引或块索引不存在')
          if (args.blockIndex !== undefined) blockAt(editor, asIndex(args.blockIndex, 'blockIndex'))
          const plans = targets.map((index) => {
            const target = sections[index]!
            const patch = resolvePageSetup(args, target.info.settings)
            if (!target.ending) return { patch }
            let xml = patch.section
              ? applySectionSettings(target.ending.sectPr, patch.section)
              : target.ending.sectPr
            if (patch.titlePg !== undefined) xml = applyTitlePg(xml, patch.titlePg)
            if (patch.pgNumType)
              xml = applyPageNumType(xml, patch.pgNumType.fmt, patch.pgNumType.start)
            return {
              ending: target.ending,
              source: target.ending.source.replace(target.ending.sectPr, xml),
            }
          })
          beforeWrite(roundId)
          const tr = editor.state.tr
          for (const plan of plans) {
            if (!plan.ending) continue
            tr.setNodeMarkup(plan.ending.from, undefined, {
              ...plan.ending.node.attrs,
              docxIndex: null,
              genXml: plan.source,
            })
          }
          if (tr.docChanged) editor.view.dispatch(tr)
          const trailing = plans.find((plan) => plan.patch)?.patch
          if (trailing) {
            options.saveOptions.current = { ...options.saveOptions.current, ...trailing }
            if (!tr.docChanged) version += 1
          }
          options.onSaveOptionsChange?.()
          afterWrite(roundId)
          return result(`已更新 ${targets.length} 节页面设置，尚未保存到库`, true)
        }
        if (tool === 'insert_section_break') {
          allowedKeys(args, ['afterBlockIndex', 'type'], tool)
          if (!options.session || !options.saveOptions)
            throw new Error('当前文档没有可复制的节定义')
          const after = asIndex(args.afterBlockIndex, 'afterBlockIndex')
          if (after < -1 || after >= editor.state.doc.childCount)
            throw new Error('afterBlockIndex 超出范围')
          const type = args.type ?? 'nextPage'
          if (!['nextPage', 'continuous', 'evenPage', 'oddPage'].includes(String(type)))
            throw new Error('type 无效')
          const sections = currentSections(editor, options.session, options.saveOptions.current)
          const section =
            sections.find((candidate) => after < candidate.info.lastBlockIndex) ?? sections.at(-1)!
          const base = section.info.sectPrXml
          if (!base.includes('<w:sectPr')) throw new Error('源文档的节定义缺失')
          const xml = `<w:p><w:pPr>${base}</w:pPr></w:p>`
          const at = after === -1 ? 0 : blockAt(editor, after).to
          beforeWrite(roundId)
          const tr = editor.state.tr
          if (section.ending) {
            const ending = section.ending
            tr.setNodeMarkup(ending.from, undefined, {
              ...ending.node.attrs,
              docxIndex: null,
              genXml: ending.source.replace(
                ending.sectPr,
                applySectionStartType(
                  base,
                  type as 'nextPage' | 'continuous' | 'evenPage' | 'oddPage',
                ),
              ),
            })
          }
          tr.insert(
            tr.mapping.map(at),
            editor.schema.nodes.docProtected!.create({
              docxIndex: null,
              blockType: 'passthrough',
              label: 'Section break paragraph',
              genXml: xml,
            }),
          )
          editor.view.dispatch(tr)
          if (!section.ending) {
            options.saveOptions.current = {
              ...options.saveOptions.current,
              sectionStartType: type as 'nextPage' | 'continuous' | 'evenPage' | 'oddPage',
              trailingSectPr: applySectionStartType(
                base,
                type as 'nextPage' | 'continuous' | 'evenPage' | 'oddPage',
              ),
            }
          }
          options.onSaveOptionsChange?.()
          afterWrite(roundId)
          return result(`已插入 ${type} 分节符，尚未保存到库`, true)
        }
        if (tool === 'list_styles') {
          const parsed = options.session?.footnotes.parsed
          if (!parsed) throw new Error('样式表尚未加载')
          const map = new Map(
            [...parsed.styles].map(([id, style]) => [
              id,
              {
                styleId: id,
                name: style.name,
                type: style.type,
                basedOn: style.basedOn ?? null,
                headingLevel: style.headingLevel ?? null,
              },
            ]),
          )
          for (const upsert of options.saveOptions?.current.styleUpserts ?? []) {
            const previous = map.get(upsert.styleId)
            map.set(upsert.styleId, {
              styleId: upsert.styleId,
              name: upsert.name ?? previous?.name ?? upsert.styleId,
              type: upsert.type ?? previous?.type ?? 'paragraph',
              basedOn: upsert.basedOn === undefined ? (previous?.basedOn ?? null) : upsert.basedOn,
              headingLevel:
                upsert.pPr?.outlineLevel === undefined
                  ? (previous?.headingLevel ?? null)
                  : upsert.pPr.outlineLevel,
            })
          }
          return result(`已列出 ${map.size} 个样式`, false, [...map.values()])
        }
        // Host-only named manual command; not part of the model's 36-tool catalog.
        if (tool === 'apply_style') {
          allowedKeys(args, ['styleId', 'fromBlockIndex', 'toBlockIndex', 'from', 'to'], tool)
          const styleId = asString(args.styleId, 'styleId')
          const pending = options.saveOptions?.current.styleUpserts?.find(
            (item) => item.styleId === styleId,
          )
          const original = options.session?.footnotes.parsed.styles.get(styleId)
          if (!pending && !original) throw new Error('样式不存在，请先保存样式定义')
          const type = pending?.type ?? original?.type ?? 'paragraph'
          const tr = editor.state.tr
          if (type === 'character') {
            const from = asIndex(args.from, 'from'),
              to = asIndex(args.to, 'to')
            if (from < 0 || to <= from || to > editor.state.doc.content.size)
              throw new Error('请先选中要应用字符样式的文字')
            const mark = editor.schema.marks.docTextStyle
            if (!mark) throw new Error('编辑器缺少字符样式')
            // Keep direct text formatting and other docTextStyle attributes.
            editor.state.doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText) return
              const old = node.marks.find((item) => item.type === mark)
              if (old?.attrs.styleId === styleId) return
              tr.addMark(
                Math.max(from, pos),
                Math.min(to, pos + node.nodeSize),
                mark.create({ ...old?.attrs, styleId }),
              )
            })
          } else {
            const start = asIndex(args.fromBlockIndex, 'fromBlockIndex')
            const end =
              args.toBlockIndex === undefined ? start : asIndex(args.toBlockIndex, 'toBlockIndex')
            if (start < 0 || end < start || end >= editor.state.doc.childCount)
              throw new Error('样式应用范围无效')
            const targets = Array.from({ length: end - start + 1 }, (_, i) =>
              blockAt(editor, start + i),
            )
            if (type === 'table' && targets.some((item) => item.node.type.name !== 'docTable'))
              throw new Error('将光标放在原生表格中以应用表格样式')
            if (
              type === 'paragraph' &&
              targets.some(
                (item) =>
                  !['docParagraph', 'docHeading', 'docListItem'].includes(item.node.type.name),
              )
            )
              throw new Error('段落样式只能应用到正文、标题或列表')
            const key = type === 'table' ? 'tblStyleId' : 'styleId'
            const level = pendingHeadingLevel(
              styleId,
              (id) =>
                options.saveOptions?.current.styleUpserts?.find((item) => item.styleId === id),
              (id) => options.session?.footnotes.parsed.styles.get(id),
            )
            for (const target of targets) {
              const nextType =
                type !== 'paragraph' || target.node.type.name === 'docListItem'
                  ? target.node.type
                  : level
                    ? editor.schema.nodes.docHeading
                    : editor.schema.nodes.docParagraph
              const attrs = { ...target.node.attrs, [key]: styleId, ...(level ? { level } : {}) }
              if (
                target.node.attrs[key] !== styleId ||
                nextType !== target.node.type ||
                (level && target.node.attrs.level !== level)
              )
                tr.setNodeMarkup(target.from, nextType, attrs)
            }
          }
          if (!tr.docChanged) return result('选区样式未变化', false)
          beforeWrite(roundId)
          editor.view.dispatch(tr)
          afterWrite(roundId)
          return result('样式已应用，尚未保存到库', true)
        }
        if (tool === 'define_style') {
          allowedKeys(
            args,
            ['styleId', 'name', 'type', 'basedOn', 'next', 'quickFormat', 'paragraph', 'run'],
            tool,
          )
          const styleId = asString(args.styleId, 'styleId')
          if (!/^[A-Za-z0-9_-]{1,64}$/.test(styleId))
            throw new Error('styleId 只能含字母、数字、-、_，长度 1–64')
          const currentStyle =
            options.saveOptions?.current.styleUpserts?.find((item) => item.styleId === styleId) ??
            options.session?.footnotes.parsed.styles.get(styleId)
          if (args.type !== undefined && currentStyle?.type && args.type !== currentStyle.type)
            throw new Error('不能更改现有样式的类型')
          const styleType = currentStyle?.type ?? args.type ?? 'paragraph'
          for (const key of ['basedOn', 'next'] as const) {
            if (args[key] === undefined || args[key] === null) continue
            const id = asString(args[key], key)
            const target =
              options.saveOptions?.current.styleUpserts?.find((item) => item.styleId === id) ??
              options.session?.footnotes.parsed.styles.get(id)
            if (!target || (target.type ?? 'paragraph') !== styleType)
              throw new Error(`${key} 必须是文档中同类型的样式`)
          }
          const upsert: StyleUpsert = { styleId }
          if (args.name !== undefined) upsert.name = asString(args.name, 'name')
          if (args.type !== undefined) {
            if (!['paragraph', 'character', 'table'].includes(String(args.type)))
              throw new Error('type 无效')
            upsert.type = args.type as StyleUpsert['type']
          }
          if (args.basedOn !== undefined)
            upsert.basedOn = args.basedOn === null ? null : asString(args.basedOn, 'basedOn')
          if (args.next !== undefined)
            upsert.next = args.next === null ? null : asString(args.next, 'next')
          if (args.quickFormat !== undefined) {
            if (typeof args.quickFormat !== 'boolean') throw new Error('quickFormat 必须是布尔值')
            upsert.quickFormat = args.quickFormat
          }
          if (args.paragraph !== undefined) {
            const paragraph = asObject(args.paragraph, 'paragraph')
            allowedKeys(
              paragraph,
              [
                'align',
                'spaceBefore',
                'spaceAfter',
                'lineSpacing',
                'indentLeft',
                'indentRight',
                'firstLineIndent',
                'keepNext',
                'keepLines',
                'pageBreakBefore',
                'outlineLevel',
              ],
              'paragraph',
            )
            const pPr: NonNullable<StyleUpsert['pPr']> = {}
            if (paragraph.align !== undefined) {
              if (!['left', 'center', 'right', 'justify', null].includes(paragraph.align as never))
                throw new Error('paragraph.align 无效')
              pPr.align = paragraph.align as typeof pPr.align
            }
            const lengths = {
              spaceBefore: 'spaceBeforeTwips',
              spaceAfter: 'spaceAfterTwips',
              indentLeft: 'indentLeftTwips',
              indentRight: 'indentRightTwips',
              firstLineIndent: 'firstLineTwips',
            } as const
            for (const [from, to] of Object.entries(lengths)) {
              if (paragraph[from] !== undefined)
                Object.assign(pPr, { [to]: styleTwips(paragraph[from], `paragraph.${from}`) })
            }
            if (paragraph.lineSpacing !== undefined) {
              if (
                paragraph.lineSpacing !== null &&
                (typeof paragraph.lineSpacing !== 'number' || paragraph.lineSpacing <= 0)
              )
                throw new Error('lineSpacing 必须是正数或 null')
              pPr.lineSpacing = paragraph.lineSpacing as number | null
            }
            for (const key of ['keepNext', 'keepLines', 'pageBreakBefore'] as const) {
              if (paragraph[key] === undefined) continue
              if (typeof paragraph[key] !== 'boolean') throw new Error(`${key} 必须是布尔值`)
              pPr[key] = paragraph[key]
            }
            if (paragraph.outlineLevel !== undefined) {
              if (
                paragraph.outlineLevel !== null &&
                (!Number.isSafeInteger(paragraph.outlineLevel) ||
                  Number(paragraph.outlineLevel) < 1 ||
                  Number(paragraph.outlineLevel) > 9)
              )
                throw new Error('outlineLevel 必须在 1–9 之间或 null')
              pPr.outlineLevel = paragraph.outlineLevel as number | null
            }
            upsert.pPr = pPr
          }
          if (args.run !== undefined) {
            const run = asObject(args.run, 'run')
            allowedKeys(
              run,
              [
                'bold',
                'italic',
                'underline',
                'strike',
                'caps',
                'smallCaps',
                'color',
                'highlight',
                'fontSize',
                'fontFamily',
                'eastAsiaFontFamily',
              ],
              'run',
            )
            const rPr: NonNullable<StyleUpsert['rPr']> = {}
            for (const key of [
              'bold',
              'italic',
              'underline',
              'strike',
              'caps',
              'smallCaps',
            ] as const) {
              if (run[key] === undefined) continue
              if (typeof run[key] !== 'boolean') throw new Error(`run.${key} 必须是布尔值`)
              rPr[key] = run[key]
            }
            if (run.color !== undefined) rPr.color = colorHex(run.color, 'run.color')
            if (run.highlight !== undefined)
              rPr.highlight =
                run.highlight === null ? null : asString(run.highlight, 'run.highlight')
            if (run.fontSize !== undefined) {
              if (
                run.fontSize !== null &&
                (typeof run.fontSize !== 'number' || run.fontSize <= 0 || run.fontSize > 400)
              )
                throw new Error('run.fontSize 无效')
              rPr.sizeHalfPoints = run.fontSize === null ? null : Math.round(run.fontSize * 2)
            }
            if (run.fontFamily !== undefined)
              rPr.font = run.fontFamily === null ? null : asString(run.fontFamily, 'run.fontFamily')
            if (run.eastAsiaFontFamily !== undefined)
              rPr.eastAsiaFont =
                run.eastAsiaFontFamily === null
                  ? null
                  : asString(run.eastAsiaFontFamily, 'run.eastAsiaFontFamily')
            upsert.rPr = rPr
          }
          const existing = options.saveOptions?.current.styleUpserts ?? []
          const previous = existing.find((item) => item.styleId === styleId)
          const merged: StyleUpsert = {
            ...previous,
            ...upsert,
            ...(previous?.pPr || upsert.pPr ? { pPr: { ...previous?.pPr, ...upsert.pPr } } : {}),
            ...(previous?.rPr || upsert.rPr ? { rPr: { ...previous?.rPr, ...upsert.rPr } } : {}),
          }
          const parents = new Map(
            [...(options.session?.footnotes.parsed.styles ?? new Map())].map(([id, style]) => [
              id,
              style.basedOn,
            ]),
          )
          for (const item of existing)
            if (item.basedOn !== undefined) parents.set(item.styleId, item.basedOn ?? undefined)
          if (merged.basedOn !== undefined) parents.set(styleId, merged.basedOn ?? undefined)
          const visited = new Set<string>([styleId])
          let parent = parents.get(styleId)
          while (parent) {
            if (visited.has(parent)) throw new Error('样式不能循环继承，请选择其他基础样式')
            visited.add(parent)
            parent = parents.get(parent)
          }
          updateSaveOptions(
            { styleUpserts: [...existing.filter((item) => item.styleId !== styleId), merged] },
            roundId,
          )
          return result(`已定义样式 ${styleId}，尚未保存到库`, true)
        }
        if (tool === 'set_watermark') {
          allowedKeys(
            args,
            [
              'text',
              'image',
              'dataUrl',
              'fontFamily',
              'color',
              'opacity',
              'diagonal',
              'bold',
              'italic',
              'scale',
              'washout',
            ],
            tool,
          )
          if (args.image !== undefined || args.dataUrl !== undefined) {
            if (args.image === null && args.dataUrl === undefined && args.text === undefined) {
              updateSaveOptions({ watermark: null }, roundId)
              return result('水印已移除，尚未保存到库', true)
            }
            if (args.text !== undefined && args.text !== null)
              throw new Error('文字水印和图片水印不能同时设置')
            const dataUrl = asString(args.dataUrl, 'dataUrl')
            const match = /^data:(image\/(?:png|jpeg|gif));base64,([A-Za-z0-9+/]+={0,2})$/s.exec(
              dataUrl,
            )
            if (!match || dataUrl.length > 28_000_000)
              throw new Error('图片水印必须是 20 MB 内的 PNG、JPEG 或 GIF')
            const startedAt = version
            const natural = await dimensionsOf(dataUrl)
            live(executeOptions.signal)
            if (version !== startedAt)
              throw new Error('图片处理期间文档已修改，请重新读取后再设置水印')
            const spec: {
              image: {
                base64: string
                mime: 'image/png' | 'image/jpeg' | 'image/gif'
                widthPx: number
                heightPx: number
              }
              scale?: number
              washout?: boolean
            } = {
              image: {
                base64: match[2]!,
                mime: match[1] as 'image/png' | 'image/jpeg' | 'image/gif',
                widthPx: natural.width,
                heightPx: natural.height,
              },
            }
            if (args.scale !== undefined) {
              if (typeof args.scale !== 'number' || args.scale <= 0 || args.scale > 1000)
                throw new Error('scale 必须在 0–1000 之间')
              spec.scale = args.scale
            }
            if (args.washout !== undefined) {
              if (typeof args.washout !== 'boolean') throw new Error('washout 必须是布尔值')
              spec.washout = args.washout
            }
            updateSaveOptions({ watermark: spec }, roundId)
            return result('图片水印已设置，尚未保存到库', true)
          }
          if (args.text === undefined) throw new Error('text 必填；null 表示清除水印')
          if (args.text === null) {
            updateSaveOptions({ watermark: null }, roundId)
            return result('水印已移除，尚未保存到库', true)
          }
          const text = asString(args.text, 'text').trim()
          if (!text) throw new Error('水印文字不能为空；清除请传 null')
          const spec: {
            text: string
            fontFamily?: string
            colorHex?: string
            opacity?: number
            diagonal?: boolean
            bold?: boolean
            italic?: boolean
          } = { text }
          if (args.fontFamily !== undefined)
            spec.fontFamily = asString(args.fontFamily, 'fontFamily')
          if (args.color !== undefined) spec.colorHex = colorHex(args.color, 'color') ?? undefined
          if (args.opacity !== undefined) {
            if (typeof args.opacity !== 'number' || args.opacity < 0 || args.opacity > 1)
              throw new Error('opacity 必须在 0–1 之间')
            spec.opacity = args.opacity
          }
          for (const key of ['diagonal', 'bold', 'italic'] as const) {
            if (args[key] === undefined) continue
            if (typeof args[key] !== 'boolean') throw new Error(`${key} 必须是布尔值`)
            spec[key] = args[key]
          }
          updateSaveOptions({ watermark: spec }, roundId)
          return result(`文字水印“${text}”已设置，尚未保存到库`, true)
        }
        if (tool === 'insert_picture') {
          allowedKeys(
            args,
            ['url', 'dataUrl', 'width', 'height', 'float', 'altText', 'afterBlockIndex'],
            tool,
          )
          const dataUrl = asString(args.dataUrl, 'dataUrl')
          const match = /^data:(image\/(?:png|jpeg|gif));base64,([A-Za-z0-9+/]+={0,2})$/s.exec(
            dataUrl,
          )
          if (!match || dataUrl.length > 28_000_000)
            throw new Error('图片必须是 20 MB 内的 PNG、JPEG 或 GIF')
          const after =
            args.afterBlockIndex === undefined
              ? editor.state.doc.childCount - 1
              : asIndex(args.afterBlockIndex, 'afterBlockIndex')
          if (after < -1 || after >= editor.state.doc.childCount)
            throw new Error('afterBlockIndex 超出范围')
          const widthEmu = args.width === undefined ? null : emu(args.width, 'width')
          const heightEmu = args.height === undefined ? null : emu(args.height, 'height')
          if ((widthEmu !== null && widthEmu <= 0) || (heightEmu !== null && heightEmu <= 0))
            throw new Error('图片宽高必须为正数')
          const float = args.float === undefined ? null : asObject(args.float, 'float')
          let wrap: NewImage['wrap'] | undefined
          let posOffsetEmu: NewImage['posOffsetEmu'] | undefined
          if (float) {
            allowedKeys(float, ['anchor', 'x', 'y', 'wrap'], 'float')
            const anchor = float.anchor ?? 'paragraph'
            if (!['paragraph', 'page', 'margin'].includes(String(anchor)))
              throw new Error('float.anchor 无效')
            const mode = float.wrap ?? 'square'
            const map = {
              square: 'square-left',
              tight: 'tight-left',
              topAndBottom: 'topBottom',
              behind: 'behind',
              inFront: 'front',
            } as const
            if (!((mode as string) in map)) throw new Error('float.wrap 无效')
            wrap = map[mode as keyof typeof map]
            posOffsetEmu = {
              x: emu(float.x, 'float.x'),
              y: emu(float.y, 'float.y'),
              ...(anchor === 'paragraph' ? {} : { relativeTo: anchor as 'page' | 'margin' }),
            }
          }
          const startedAt = version
          const natural = await dimensionsOf(dataUrl)
          live(executeOptions.signal)
          if (version !== startedAt) throw new Error('图片处理期间文档已修改，请重新读取后再插入')
          if (
            natural.width <= 0 ||
            natural.height <= 0 ||
            natural.width * natural.height > 100_000_000
          )
            throw new Error('图片像素过多或无效')
          const ratio = natural.width / natural.height
          const widthPx =
            widthEmu && heightEmu
              ? pxFromEmu(widthEmu)
              : widthEmu
                ? pxFromEmu(widthEmu)
                : heightEmu
                  ? Math.max(1, Math.round(pxFromEmu(heightEmu) * ratio))
                  : Math.min(480, natural.width)
          const heightPx =
            widthEmu && heightEmu
              ? pxFromEmu(heightEmu)
              : heightEmu
                ? pxFromEmu(heightEmu)
                : Math.max(1, Math.round(widthPx / ratio))
          const genImage: NewImage = {
            base64: match[2]!,
            mime: match[1] as NewImage['mime'],
            widthPx,
            heightPx,
            ...(args.altText === undefined ? {} : { altText: asString(args.altText, 'altText') }),
            ...(wrap ? { wrap, posOffsetEmu } : {}),
          }
          const at = after === -1 ? 0 : blockAt(editor, after).to
          beforeWrite(roundId)
          if (
            !editor.commands.insertContentAt(at, {
              type: 'docProtected',
              attrs: {
                docxIndex: null,
                blockType: 'image',
                label: 'Picture',
                imageDataUrl: dataUrl,
                imageWidthPx: widthPx,
                imageHeightPx: heightPx,
                genImage,
                ...(wrap
                  ? {
                      imageWrap: wrap,
                      imageOffsetXEmu: posOffsetEmu!.x,
                      imageOffsetYEmu: posOffsetEmu!.y,
                      imageRelV: posOffsetEmu!.relativeTo ?? null,
                    }
                  : {}),
              },
            })
          )
            throw new Error('编辑器拒绝插入图片')
          afterWrite(roundId)
          return result(`图片已插入画布（${widthPx}×${heightPx}），尚未保存到库`, true)
        }
        if (tool === 'insert_text_box') {
          allowedKeys(
            args,
            [
              'afterBlockIndex',
              'text',
              'width',
              'height',
              'x',
              'y',
              'anchor',
              'wrap',
              'fill',
              'borderColor',
              'fontSize',
              'align',
              'bold',
              'color',
            ],
            tool,
          )
          const boxText = asString(args.text, 'text')
          if (!boxText.trim() || boxText.length > 20_000)
            throw new Error('文本框文字不能为空或超过 2 万字符')
          const widthEmu = emu(args.width, 'width')
          const heightEmu = emu(args.height, 'height')
          const xEmu = emu(args.x, 'x')
          const yEmu = emu(args.y, 'y')
          if (widthEmu <= 0 || heightEmu <= 0) throw new Error('文本框宽高必须为正数')
          const anchor = args.anchor ?? 'paragraph'
          if (anchor !== 'paragraph' && anchor !== 'page')
            throw new Error('anchor 必须为 paragraph 或 page')
          const wrap = args.wrap ?? (anchor === 'page' ? 'none' : 'topAndBottom')
          if (wrap !== 'none' && wrap !== 'topAndBottom') throw new Error('wrap 无效')
          const fill =
            args.fill === undefined ? 'FFFFFF' : (colorHex(args.fill, 'fill') ?? undefined)
          const border =
            args.borderColor === undefined
              ? '000000'
              : (colorHex(args.borderColor, 'borderColor') ?? undefined)
          const align = args.align === undefined ? undefined : asString(args.align, 'align')
          if (align !== undefined && !['left', 'center', 'right', 'justify'].includes(align))
            throw new Error('align 无效')
          const fontSize = args.fontSize === undefined ? undefined : Number(args.fontSize)
          if (
            fontSize !== undefined &&
            (!Number.isFinite(fontSize) || fontSize < 0.5 || fontSize > 1638)
          )
            throw new Error('fontSize 无效')
          if (args.bold !== undefined && typeof args.bold !== 'boolean')
            throw new Error('bold 必须是布尔值')
          const color =
            args.color === undefined ? undefined : (colorHex(args.color, 'color') ?? undefined)
          const paragraphs = boxText.split('\n').map((line) => ({
            runs: [
              {
                text: line,
                ...(fontSize === undefined ? {} : { sizeHalfPoints: Math.round(fontSize * 2) }),
                ...(args.bold ? { bold: true } : {}),
                ...(color ? { color } : {}),
              },
            ],
            ...(align
              ? { format: { align: align as 'left' | 'center' | 'right' | 'justify' } }
              : {}),
          }))
          const xml = buildAnchoredTextboxParagraphXml({
            anchor,
            xEmu,
            yEmu,
            widthEmu,
            heightEmu,
            paragraphs,
            id: Math.floor(Math.random() * 900000) + 100000,
            ...(fill ? { fillHex: fill } : {}),
            ...(border ? { borderHex: border } : {}),
            wrap,
          })
          const widthPx = pxFromEmu(widthEmu)
          const heightPx = pxFromEmu(heightEmu)
          const display: TextboxDisplay = {
            widthPx,
            heightPx,
            paras: paragraphs.map((p) => ({
              runs: p.runs,
              ...(align ? { align: align as 'left' | 'center' | 'right' | 'justify' } : {}),
            })),
            offsetXEmu: xEmu,
            offsetYEmu: yEmu,
            ...(fill ? { fill } : {}),
            ...(border ? { borderColor: border } : {}),
            ...(wrap === 'none'
              ? { floating: true }
              : {
                  bandTopPx: Math.round(yEmu / 9525),
                  bandBottomPx: Math.round((yEmu + heightEmu) / 9525),
                }),
            ...(anchor === 'page' ? { pagePinned: true, floating: true } : {}),
          }
          const after =
            args.afterBlockIndex === undefined
              ? editor.state.doc.childCount - 1
              : asIndex(args.afterBlockIndex, 'afterBlockIndex')
          if (after < -1 || after >= editor.state.doc.childCount)
            throw new Error('afterBlockIndex 超出范围')
          const at = after === -1 ? 0 : blockAt(editor, after).to
          beforeWrite(roundId)
          if (
            !editor.commands.insertContentAt(at, {
              type: 'docProtected',
              attrs: {
                docxIndex: null,
                blockType: 'passthrough',
                label: 'Text box',
                previewText: boxText.replace(/\s+/g, ' ').trim(),
                genXml: xml,
                textboxes: [display],
              },
            })
          )
            throw new Error('编辑器拒绝插入文本框')
          afterWrite(roundId)
          return result('文本框已插入画布，尚未保存到库', true, { widthPx, heightPx })
        }
        if (tool === 'insert_image' || tool === 'generate_image') {
          const dataUrl = asString(args.dataUrl, 'dataUrl')
          const match = /^data:(image\/(?:png|jpeg|gif));base64,([A-Za-z0-9+/]+={0,2})$/s.exec(
            dataUrl,
          )
          if (!match) throw new Error('只支持 PNG、JPEG、GIF 的 base64 图片')
          if (dataUrl.length > 28_000_000) throw new Error('图片超过 20 MB 限制')
          if (args.mimeType !== undefined && args.mimeType !== match[1])
            throw new Error('图片 MIME 与数据不一致')
          const widthLimit =
            args.maxWidthPx === undefined ? 480 : asIndex(args.maxWidthPx, 'maxWidthPx')
          if (widthLimit < 1 || widthLimit > 4096) throw new Error('maxWidthPx 必须在 1–4096 之间')
          const after =
            args.afterBlockIndex === undefined
              ? undefined
              : asIndex(args.afterBlockIndex, 'afterBlockIndex')
          const expectedAtStart = version
          const natural = await dimensionsOf(dataUrl)
          live(executeOptions.signal)
          if (
            version !== expectedAtStart ||
            (expectedVersion !== undefined && expectedVersion !== version)
          ) {
            throw new Error('图片处理期间文档已修改，请重新读取后再插入')
          }
          if (
            natural.width <= 0 ||
            natural.height <= 0 ||
            natural.width * natural.height > 100_000_000
          ) {
            throw new Error('图片尺寸无效或像素过多')
          }
          const scale = Math.min(1, widthLimit / natural.width)
          const widthPx = Math.round(natural.width * scale)
          const heightPx = Math.round(natural.height * scale)
          const cursor = roundSelection?.selection.to ?? frozen?.to ?? editor.state.selection.to
          const resolved = editor.state.doc.resolve(cursor)
          const at =
            after === undefined
              ? resolved.depth
                ? resolved.after(1)
                : cursor
              : after === -1
                ? 0
                : blockAt(editor, after).to
          beforeWrite(roundId)
          if (
            !editor.commands.insertContentAt(at, {
              type: 'docProtected',
              attrs: {
                docxIndex: null,
                blockType: 'image',
                label: tool === 'generate_image' ? 'AI image' : 'Web image',
                imageDataUrl: dataUrl,
                imageWidthPx: widthPx,
                imageHeightPx: heightPx,
                genImage: { base64: match[2]!, mime: match[1]!, widthPx, heightPx },
              },
            })
          )
            throw new Error('编辑器拒绝插入图片')
          afterWrite(roundId)
          return result('图片已插入画布，尚未保存到库', true, { widthPx, heightPx })
        }
        if (tool === 'insert_chart') {
          allowedKeys(args, ['kind', 'title', 'categories', 'series', 'afterBlockIndex'], tool)
          if (!['bar', 'line', 'pie'].includes(String(args.kind)))
            throw new Error('图表 kind 必须为 bar、line 或 pie')
          if (
            !Array.isArray(args.categories) ||
            !args.categories.length ||
            args.categories.length > 200 ||
            !args.categories.every((item) => typeof item === 'string')
          )
            throw new Error('categories 必须是 1–200 个字符串')
          if (!Array.isArray(args.series) || !args.series.length || args.series.length > 20)
            throw new Error('series 必须是 1–20 个数据系列')
          const categories = args.categories as string[]
          const series = args.series.map((seriesInput, i) => {
            const item = asObject(seriesInput, `series[${i}]`)
            allowedKeys(item, ['name', 'values'], `series[${i}]`)
            if (
              !Array.isArray(item.values) ||
              item.values.length !== categories.length ||
              item.values.some(
                (value) => value !== null && (typeof value !== 'number' || !Number.isFinite(value)),
              )
            )
              throw new Error(`series[${i}].values 与分类数不符或含无效数字`)
            return {
              name:
                item.name === undefined
                  ? `Series ${i + 1}`
                  : asString(item.name, `series[${i}].name`),
              values: item.values as (number | null)[],
            }
          })
          const spec: NewChart = {
            kind: args.kind as NewChart['kind'],
            title: args.title === undefined ? 'Chart title' : asString(args.title, 'title'),
            categories,
            series,
          }
          const display: ChartDisplay = { ...spec, partPath: '' }
          const after =
            args.afterBlockIndex === undefined
              ? undefined
              : asIndex(args.afterBlockIndex, 'afterBlockIndex')
          const cursor = roundSelection?.selection.to ?? frozen?.to ?? editor.state.selection.to
          const resolved = editor.state.doc.resolve(cursor)
          const at =
            after === undefined
              ? resolved.depth
                ? resolved.after(1)
                : cursor
              : after === -1
                ? 0
                : blockAt(editor, after).to
          beforeWrite(roundId)
          if (
            !editor.commands.insertContentAt(at, {
              type: 'docProtected',
              attrs: {
                docxIndex: null,
                blockType: 'chart',
                label: 'Chart',
                genChart: spec,
                chartDisplay: display,
              },
            })
          )
            throw new Error('编辑器拒绝插入图表')
          afterWrite(roundId)
          return result(`已插入${spec.kind}图表，尚未保存到库`, true)
        }
        if (tool === 'edit_chart') {
          allowedKeys(args, ['blockIndex', 'title', 'categories', 'series'], tool)
          const block = blockAt(editor, asIndex(args.blockIndex, 'blockIndex'))
          const display =
            block.node.type.name === 'docProtected'
              ? (block.node.attrs.chartDisplay as ChartDisplay | null)
              : null
          if (!display) throw new Error('目标块不是可编辑图表')
          const next: ChartDisplay = structuredClone(display)
          if (args.title !== undefined) next.title = asString(args.title, 'title')
          if (args.categories !== undefined) {
            if (
              !Array.isArray(args.categories) ||
              args.categories.length !== next.categories.length
            )
              throw new Error('分类数量必须与原图表相同')
            args.categories.forEach((value, i) => {
              if (value !== null) next.categories[i] = asString(value, `categories[${i}]`)
            })
          }
          if (args.series !== undefined) {
            if (!Array.isArray(args.series)) throw new Error('series 必须是数组')
            for (const seriesInput of args.series) {
              const item = asObject(seriesInput, 'series[]')
              allowedKeys(item, ['index', 'name', 'values'], 'series[]')
              const index = asIndex(item.index, 'series.index')
              const original = next.series[index]
              if (!original) throw new Error('series.index 超出范围')
              if (item.name !== undefined) original.name = asString(item.name, 'series.name')
              if (item.values !== undefined) {
                if (!Array.isArray(item.values) || item.values.length !== original.values.length)
                  throw new Error('数值数量必须与原系列相同')
                item.values.forEach((value, i) => {
                  if (value === null) return
                  if (typeof value !== 'number' || !Number.isFinite(value))
                    throw new Error('图表数值必须是有限数字')
                  if (display.partPath && display.series[index]?.values[i] === null)
                    throw new Error('原生图表空数据点不能更新')
                  original.values[i] = value
                })
              }
            }
          }
          const gen = block.node.attrs.genChart as NewChart | null
          beforeWrite(roundId)
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(block.from, undefined, {
              ...block.node.attrs,
              chartDisplay: next,
              genChart: gen
                ? {
                    kind: gen.kind,
                    title: next.title,
                    categories: next.categories,
                    series: next.series,
                  }
                : null,
            }),
          )
          afterWrite(roundId)
          return result('图表数据已更新，尚未保存到库', true)
        }
        if (tool === 'insert_content') {
          const html = asString(args.html, 'html')
          if (!html.trim()) throw new Error('插入内容不能为空')
          const after =
            args.afterBlockIndex === undefined
              ? undefined
              : asIndex(args.afterBlockIndex, 'afterBlockIndex')
          const at =
            after === undefined
              ? (roundSelection?.selection.to ?? frozen?.to ?? editor.state.selection.to)
              : after === -1
                ? 0
                : blockAt(editor, after).to
          if (mandatoryTracking) {
            const changed = publishTrackedText(
              editor.state.tr.replaceWith(at, at, forcedText(html)),
              roundId,
            )
            return result(
              changed ? '文字已作为修订插入，尚未保存到库' : '操作没有产生实际修改',
              changed,
            )
          }
          beforeWrite(roundId)
          if (!editor.commands.insertContentAt(at, html)) throw new Error('编辑器拒绝插入内容')
          afterWrite(roundId)
          return result('内容已插入画布，尚未保存到库', true)
        }
        if (tool === 'replace_blocks') {
          const start = asIndex(args.startBlockIndex, 'startBlockIndex')
          const end = asIndex(args.endBlockIndex, 'endBlockIndex')
          const html = asString(args.html, 'html')
          if (end < start || !html.trim()) throw new Error('替换范围或内容无效')
          const from = blockAt(editor, start).from
          const to = blockAt(editor, end).to
          if (mandatoryTracking) {
            if (start !== end) throw new Error(FORCED_TRACKING_REASON)
            const block = blockAt(editor, start)
            const changed = publishTrackedText(
              editor.state.tr.replaceWith(block.from + 1, block.to - 1, forcedText(html)),
              roundId,
            )
            return result(
              changed ? '段内文字已作为修订替换，尚未保存到库' : '操作没有产生实际修改',
              changed,
            )
          }
          const nodes = replacementNodes(editor, start, end, html)
          if (!nodes.length) throw new Error('替换内容不能解析为文档块')
          beforeWrite(roundId)
          editor.view.dispatch(editor.state.tr.replaceWith(from, to, nodes))
          afterWrite(roundId)
          return result(`第 ${start}–${end} 块已替换，尚未保存到库`, true)
        }
        if (tool === 'replace_selection') {
          const html = asString(args.html, 'html')
          const sel = roundSelection?.selection ?? frozen ?? selectionOf(editor)
          if (sel.from === sel.to) throw new Error('发送时没有选中文字')
          const selectionVersion = roundSelection?.version ?? frozenVersion
          if (
            selectionVersion !== null &&
            selectionVersion !== undefined &&
            selectionVersion !== version
          ) {
            throw new Error('发送后文档已修改，选区可能过期，请重新选择')
          }
          if (sel.to > editor.state.doc.content.size) throw new Error('选区已失效，请重新选择')
          if (
            editor.state.doc.resolve(sel.from).parent !== editor.state.doc.resolve(sel.to).parent
          ) {
            throw new Error('选区跨越多个块，请改用 replace_blocks')
          }
          if (mandatoryTracking) {
            const changed = publishTrackedText(
              editor.state.tr.replaceWith(sel.from, sel.to, forcedText(html)),
              roundId,
            )
            return result(
              changed ? '选中文字已作为修订替换，尚未保存到库' : '操作没有产生实际修改',
              changed,
            )
          }
          beforeWrite(roundId)
          if (!editor.commands.insertContentAt({ from: sel.from, to: sel.to }, html))
            throw new Error('编辑器拒绝替换选区')
          afterWrite(roundId)
          return result('选中文字已替换，尚未保存到库', true)
        }
        if (tool === 'apply_ops') {
          const ops = args.ops
          if (!Array.isArray(ops) || ops.length < 1 || ops.length > 50) {
            throw new Error('ops 必须包含 1–50 个操作')
          }
          // Compile every op before touching the editor. A failed op rejects the entire batch.
          const plans = ops.map((op, index) =>
            planOp(
              editor,
              op,
              index,
              options.headingLevels ?? options.session?.headingLevels,
              roundSelection?.selection ?? frozen ?? selectionOf(editor),
              options.session?.footnotes.parsed.headingStyleIds,
            ),
          )
          if (
            ops.length > 1 &&
            ops.some((op) =>
              ['deleteBlocks', 'moveBlocks', 'insertToc'].includes((op as JsonObject).op as string),
            )
          ) {
            throw new Error('移动、删除和插入目录必须单独执行，避免同批索引漂移')
          }
          if (args.dryRun === true)
            return result(
              '操作已验证，未修改文档',
              false,
              plans.map((p) => p.summary),
            )
          const tr = editor.state.tr
          for (const plan of plans) plan.apply(tr)
          if (!tr.docChanged) return result('操作没有产生实际修改', false)
          if (mandatoryTracking) {
            const changed = publishTrackedText(tr, roundId)
            return result(
              changed ? '文字替换已记为修订，尚未保存到库' : '操作没有产生实际修改',
              changed,
            )
          }
          beforeWrite(roundId)
          editor.view.dispatch(tr)
          afterWrite(roundId)
          return result(
            `已执行 ${plans.length} 个操作，尚未保存到库`,
            true,
            plans.map((p) => p.summary),
          )
        }
        if ((DOCX_AGENT_TOOL_NAMES as readonly string[]).includes(tool)) {
          throw new Error(`${tool} 尚未接入可验证的 DOCX 保存路径，未修改文档`)
        }
        throw new Error(`未知 DOCX 工具：${tool}`)
      } finally {
        restoreRevision()
      }
    },
    undoRound(roundId) {
      live()
      const protection = options.session?.protection
      if (!protection?.getAccess().commentsOnly) assertWrite()
      const round = rounds.get(roundId)
      if (!round || round.lastVersion !== version) return false
      if (protection?.getAccess().commentsOnly) {
        if (!round.commentsOnly || round.protectionEpoch !== protection.getAccess().epoch)
          return false
        protection.assertCommentMutation(round.content, round.saveOptions)
        const target = editor.schema.nodeFromJSON(round.content)
        if (editor.state.doc.eq(target)) version += 1
        else {
          const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, target.content)
          const accepted = protection.runCommentTransaction(
            round.content,
            round.saveOptions,
            () => {
              editor.view.dispatch(tr)
              return editor.state.doc.eq(target)
            },
          )
          if (!accepted) return false
        }
      } else if (protection?.getAccess().mandatoryTracking) {
        if (round.protectionEpoch !== protection.getAccess().epoch) return false
        const target = editor.schema.nodeFromJSON(round.content)
        const restored = protection.trackingPolicy()!.restore(round.content, () => {
          editor.view.dispatch(
            editor.state.tr
              .replaceWith(0, editor.state.doc.content.size, target.content)
              .setMeta(TRACK_IGNORE, true),
          )
          return editor.state.doc.eq(target)
        })
        if (!restored) return false
        restoreRevision()
      } else {
        assertWrite()
        if (!editor.commands.setContent(round.content)) return false
      }
      if (options.saveOptions) {
        options.saveOptions.current = structuredClone(round.saveOptions)
        options.onSaveOptionsChange?.()
      }
      options.onDirtyChange(round.dirtyBefore)
      rounds.delete(roundId)
      roundSelections.delete(roundId)
      return true
    },
    markSaved() {
      live()
      rounds.clear()
      if (draftBaseline) draftBaseline = { dirty: false, version }
    },
    dispose() {
      if (disposed) return
      disposed = true
      editor.off('transaction', onTransaction)
      unsubscribeProtection?.()
      rounds.clear()
      frozen = null
      frozenVersion = null
      roundSelections.clear()
      restoreRevision()
      for (const draft of drafts.values()) draft.element.remove()
      drafts.clear()
      draftBaseline = null
    },
  }
}

type OpPlan = { summary: string; apply(tr: Transaction): void }

const FONT_FIELDS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'highlight',
  'fontSize',
  'fontFamily',
  'baseline',
  'link',
] as const
function planFontOp(
  editor: Editor,
  op: JsonObject,
  name: 'setFont' | 'setMatchedFont',
  selection: DocxAgentSelection,
): OpPlan {
  allowedKeys(op, ['op', 'target', 'text', 'matchCase', ...FONT_FIELDS], name)
  if (!FONT_FIELDS.some((field) => Object.hasOwn(op, field)))
    throw new Error(`${name} 没有字体字段`)
  for (const field of ['bold', 'italic', 'underline', 'strike'] as const) {
    if (op[field] !== undefined && typeof op[field] !== 'boolean')
      throw new Error(`${field} 必须是布尔值`)
  }
  if (op.color !== undefined) colorHex(op.color, 'color')
  if (op.highlight !== undefined && op.highlight !== null && typeof op.highlight !== 'string')
    throw new Error('highlight 无效')
  if (
    op.fontSize !== undefined &&
    op.fontSize !== null &&
    (typeof op.fontSize !== 'number' || op.fontSize < 1 || op.fontSize > 1638)
  )
    throw new Error('fontSize 无效')
  if (op.fontFamily !== undefined && op.fontFamily !== null && typeof op.fontFamily !== 'string')
    throw new Error('fontFamily 无效')
  if (
    op.baseline !== undefined &&
    !['superscript', 'subscript', 'none', null].includes(op.baseline as never)
  )
    throw new Error('baseline 无效')
  if (op.link !== undefined && op.link !== null) {
    const link = asObject(op.link, 'link')
    allowedKeys(link, ['url'], 'link')
    const url = asString(link.url, 'link.url')
    if (!/^https?:\/\//i.test(url)) throw new Error('link.url 只支持 HTTP(S)')
  }
  if (name === 'setMatchedFont') {
    if (!asString(op.text, 'text')) throw new Error('text 不能为空')
    if (op.matchCase !== undefined && typeof op.matchCase !== 'boolean')
      throw new Error('matchCase 必须是布尔值')
  } else if (op.text !== undefined || op.matchCase !== undefined)
    throw new Error('setFont 不支持 text/matchCase')
  const target = op.target === undefined ? null : asObject(op.target, 'target')
  if (target)
    allowedKeys(
      target,
      ['blockIndexes', 'nodeType', 'headingLevel', 'containsText', 'matchCase', 'scope', 'range'],
      'target',
    )
  if (name === 'setFont' && !target) throw new Error('setFont 需要 target')
  const indexes = target?.blockIndexes
  if (indexes !== undefined && (!Array.isArray(indexes) || !indexes.every(Number.isSafeInteger)))
    throw new Error('target.blockIndexes 无效')
  if (
    target?.nodeType !== undefined &&
    !['docParagraph', 'docHeading', 'docListItem', 'table', 'image'].includes(
      String(target.nodeType),
    )
  )
    throw new Error('target.nodeType 无效')
  if (
    target?.headingLevel !== undefined &&
    (!Number.isSafeInteger(target.headingLevel) ||
      Number(target.headingLevel) < 1 ||
      Number(target.headingLevel) > 6)
  )
    throw new Error('target.headingLevel 无效')
  if (target?.containsText !== undefined && typeof target.containsText !== 'string')
    throw new Error('target.containsText 必须是字符串')
  if (target?.matchCase !== undefined && typeof target.matchCase !== 'boolean')
    throw new Error('target.matchCase 必须是布尔值')
  if (target?.scope !== undefined && target.scope !== 'selection' && target.scope !== 'document')
    throw new Error('target.scope 无效')
  const explicitRange = target?.range === undefined ? null : asObject(target.range, 'target.range')
  if (explicitRange) {
    allowedKeys(explicitRange, ['from', 'to'], 'target.range')
    const from = asIndex(explicitRange.from, 'target.range.from')
    const to = asIndex(explicitRange.to, 'target.range.to')
    if (from < 0 || to < from || to > editor.state.doc.content.size)
      throw new Error('target.range 超出文档范围')
  }
  if (
    name === 'setFont' &&
    target &&
    ![
      indexes !== undefined,
      target.nodeType !== undefined,
      target.headingLevel !== undefined,
      target.containsText !== undefined,
      target.scope === 'selection',
      explicitRange !== null,
    ].some(Boolean)
  )
    throw new Error('setFont 目标至少需要一个筛选条件')
  const allowed = indexes === undefined ? null : new Set(indexes as number[])
  if (allowed) for (const index of allowed) blockAt(editor, index)
  const clip = explicitRange
    ? { from: Number(explicitRange.from), to: Number(explicitRange.to) }
    : target?.scope === 'selection'
      ? selection
      : null
  const needle = name === 'setMatchedFont' ? asString(op.text, 'text') : null
  const ranges: Array<{ from: number; to: number; marks: PmNode['marks'] }> = []
  editor.state.doc.forEach((block, offset, index) => {
    if (allowed && !allowed.has(index)) return
    if (target?.nodeType === 'image') return
    if (target?.nodeType === 'table' && block.type.name !== 'docTable') return
    if (target?.nodeType && target.nodeType !== 'table' && block.type.name !== target.nodeType)
      return
    if (
      target?.headingLevel !== undefined &&
      (block.type.name !== 'docHeading' || Number(block.attrs.level) !== target.headingLevel)
    )
      return
    if (target?.containsText !== undefined) {
      const hay =
        target.matchCase === false ? block.textContent.toLocaleLowerCase() : block.textContent
      const search =
        target.matchCase === false
          ? String(target.containsText).toLocaleLowerCase()
          : String(target.containsText)
      if (!hay.includes(search)) return
    }
    if (
      clip &&
      (offset + block.nodeSize <= clip.from || offset >= clip.to) &&
      clip.from !== clip.to
    )
      return
    if (
      clip &&
      clip.from === clip.to &&
      (clip.from < offset || clip.from > offset + block.nodeSize)
    )
      return
    if (!['docParagraph', 'docHeading', 'docListItem', 'docTable'].includes(block.type.name)) {
      if (allowed && !target?.nodeType) throw new Error(`${name} 的目标包含不可编辑块`)
      return
    }
    block.descendants((node, relative) => {
      if (!node.isText || !node.text || node.marks.some((mark) => mark.type.name === 'del')) return
      const from = offset + relative + 1
      const clippedFrom = clip && clip.from !== clip.to ? Math.max(from, clip.from) : from
      const clippedTo =
        clip && clip.from !== clip.to
          ? Math.min(from + node.text.length, clip.to)
          : from + node.text.length
      if (clippedFrom >= clippedTo) return
      if (!needle) {
        ranges.push({ from: clippedFrom, to: clippedTo, marks: node.marks })
        return
      }
      const hay = op.matchCase === false ? node.text.toLocaleLowerCase() : node.text
      const search = op.matchCase === false ? needle.toLocaleLowerCase() : needle
      let at = 0
      while ((at = hay.indexOf(search, at)) >= 0) {
        if (from + at >= clippedFrom && from + at + needle.length <= clippedTo)
          ranges.push({ from: from + at, to: from + at + needle.length, marks: node.marks })
        at += needle.length
      }
    })
  })
  if (ranges.length > 10_000) throw new Error('字体匹配超过 10000 处，请缩小范围')
  const patch: Record<string, unknown> = {}
  if (op.color !== undefined) patch.color = colorHex(op.color, 'color')
  if (op.highlight !== undefined) patch.highlight = op.highlight
  if (op.fontSize !== undefined)
    patch.sizeHalfPoints = op.fontSize === null ? null : Math.round((op.fontSize as number) * 2)
  if (op.fontFamily !== undefined) patch.fontAscii = op.fontFamily
  if (op.baseline !== undefined) patch.vertAlign = op.baseline === 'none' ? null : op.baseline
  return {
    summary: `${name} 匹配 ${ranges.length} 段文字`,
    apply(tr) {
      for (const range of ranges) {
        for (const field of ['bold', 'italic', 'underline', 'strike'] as const) {
          if (op[field] === undefined) continue
          const mark = editor.schema.marks[field]
          if (!mark) throw new Error(`编辑器缺少 ${field} 标记`)
          if (op[field]) tr.addMark(range.from, range.to, mark.create())
          else tr.removeMark(range.from, range.to, mark)
        }
        if (op.link !== undefined) {
          const mark = editor.schema.marks.link
          if (!mark) throw new Error('编辑器缺少链接标记')
          if (op.link === null) tr.removeMark(range.from, range.to, mark)
          else
            tr.addMark(
              range.from,
              range.to,
              mark.create({ href: (op.link as { url: string }).url, rId: null }),
            )
        }
        if (Object.keys(patch).length) {
          const mark = editor.schema.marks.docTextStyle
          if (!mark) throw new Error('编辑器缺少字体标记')
          const existing = range.marks.find((candidate) => candidate.type === mark)?.attrs ?? {}
          tr.addMark(range.from, range.to, mark.create({ ...existing, ...patch }))
        }
      }
    },
  }
}

function allowedKeys(value: JsonObject, keys: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key))
  if (unknown.length) throw new Error(`${label} 不支持字段：${unknown.join('、')}`)
}

function planOp(
  editor: Editor,
  input: unknown,
  index: number,
  headingLevels?: readonly number[],
  selection?: DocxAgentSelection,
  headingStyleIds?: ReadonlyMap<number, string>,
): OpPlan {
  const op = asObject(input, `ops[${index}]`)
  const name = asString(op.op, `ops[${index}].op`)
  if (!(DOCX_AGENT_OP_NAMES as readonly string[]).includes(name))
    throw new Error(`未知操作：${name}`)
  if (name === 'setFont' || name === 'setMatchedFont')
    return planFontOp(editor, op, name, selection ?? selectionOf(editor))
  if (name === 'setImageProperties') {
    allowedKeys(op, ['op', 'target', 'widthPx', 'heightPx', 'align'], name)
    const target = asObject(op.target, 'target')
    allowedKeys(target, ['blockIndexes', 'nodeType'], 'target')
    if (target.nodeType !== undefined && target.nodeType !== 'image')
      throw new Error('setImageProperties 只支持图片')
    if (!Array.isArray(target.blockIndexes) || !target.blockIndexes.length)
      throw new Error('图片目标需要 blockIndexes')
    const blocks = target.blockIndexes.map((value) =>
      blockAt(editor, asIndex(value, 'blockIndexes[]')),
    )
    if (
      blocks.some(
        (block) =>
          block.node.type.name !== 'docProtected' || block.node.attrs.blockType !== 'image',
      )
    )
      throw new Error('目标包含非图片块')
    if (op.widthPx === undefined && op.heightPx === undefined && op.align === undefined)
      throw new Error('没有图片属性')
    for (const key of ['widthPx', 'heightPx'] as const) {
      const value = op[key]
      if (
        value !== undefined &&
        value !== null &&
        (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 4096)
      )
        throw new Error(`${key} 必须为 1–4096 像素或 null`)
    }
    if (op.align !== undefined && !['left', 'center', 'right', null].includes(op.align as never))
      throw new Error('align 无效')
    return {
      summary: `设置 ${blocks.length} 张图片属性`,
      apply(tr) {
        for (const block of blocks) {
          const attrs = { ...block.node.attrs }
          const oldW = Number(attrs.imageWidthPx) || 0
          const oldH = Number(attrs.imageHeightPx) || 0
          const width = typeof op.widthPx === 'number' ? Math.round(op.widthPx) : null
          const height = typeof op.heightPx === 'number' ? Math.round(op.heightPx) : null
          if (width && height) {
            attrs.imageWidthPx = width
            attrs.imageHeightPx = height
          } else if (width && oldW && oldH) {
            attrs.imageWidthPx = width
            attrs.imageHeightPx = Math.round((width * oldH) / oldW)
          } else if (height && oldW && oldH) {
            attrs.imageHeightPx = height
            attrs.imageWidthPx = Math.round((height * oldW) / oldH)
          } else if (width || height) throw new Error('原图尺寸缺失，必须同时提供宽高')
          if (op.align !== undefined) attrs.imageAlign = op.align
          tr.setNodeMarkup(block.from, undefined, attrs)
        }
      },
    }
  }
  if (name === 'moveBlocks') {
    allowedKeys(op, ['op', 'blockIndexes', 'afterBlockIndex'], name)
    if (!Array.isArray(op.blockIndexes) || !op.blockIndexes.length)
      throw new Error('moveBlocks.blockIndexes 无效')
    const indexes = op.blockIndexes.map((value) => asIndex(value, 'blockIndexes[]'))
    if (new Set(indexes).size !== indexes.length) throw new Error('blockIndexes 不能重复')
    const after = asIndex(op.afterBlockIndex, 'afterBlockIndex')
    const count = editor.state.doc.childCount
    if (indexes.some((value) => value < 0 || value >= count) || after < -1 || after >= count)
      throw new Error('移动范围超出文档')
    if (indexes.includes(after)) throw new Error('移动目标不能位于待移动块内')
    return {
      summary: `移动 ${indexes.length} 个块`,
      apply(tr) {
        const set = new Set(indexes)
        const all: Array<{ index: number; node: PmNode }> = []
        tr.doc.forEach((node, _offset, i) => all.push({ index: i, node }))
        const moved = all.filter((item) => set.has(item.index)).map((item) => item.node)
        const rest = all.filter((item) => !set.has(item.index))
        const insertAt = after === -1 ? 0 : rest.findIndex((item) => item.index === after) + 1
        tr.replaceWith(0, tr.doc.content.size, [
          ...rest.slice(0, insertAt).map((item) => item.node),
          ...moved,
          ...rest.slice(insertAt).map((item) => item.node),
        ])
      },
    }
  }
  if (name === 'insertToc') {
    allowedKeys(op, ['op', 'afterBlockIndex'], name)
    const after = asIndex(op.afterBlockIndex, 'afterBlockIndex')
    if (after < -1 || after >= editor.state.doc.childCount)
      throw new Error('afterBlockIndex 超出文档')
    const entries: Array<{ level: number; text: string }> = []
    editor.state.doc.forEach((node) => {
      if (node.type.name === 'docHeading' && node.textContent.trim())
        entries.push({
          level: Number(node.attrs.level) || 1,
          text: node.textContent,
        })
    })
    if (!entries.length) throw new Error('文档没有标题，无法插入目录')
    const type = editor.schema.nodes.docProtected
    if (!type) throw new Error('编辑器缺少目录字段节点')
    const nodes = generateTocFieldXml(entries).map((xml, i) =>
      type.create({
        docxIndex: null,
        blockType: 'passthrough',
        label: 'TOC field',
        genXml: xml,
        fieldDisplay: {
          kind: 'tocLine',
          left: entries[i]!.text,
          right: '',
          level: entries[i]!.level,
        },
      }),
    )
    return {
      summary: `插入 ${nodes.length} 行目录字段`,
      apply(tr) {
        let at = 0
        if (after >= 0)
          tr.doc.forEach((node, offset, i) => {
            if (i === after) at = offset + node.nodeSize
          })
        tr.insert(at, nodes)
      },
    }
  }
  if (name === 'findReplace') {
    allowedKeys(op, ['op', 'target', 'find', 'replace', 'matchCase'], name)
    const find = asString(op.find, 'find')
    const replacement = asString(op.replace, 'replace')
    if (!find) throw new Error('find 不能为空')
    if (op.matchCase !== undefined && typeof op.matchCase !== 'boolean')
      throw new Error('matchCase 必须是布尔值')
    const target = op.target === undefined ? null : asObject(op.target, 'target')
    if (target) allowedKeys(target, ['blockIndexes'], 'target')
    const indexes = target?.blockIndexes
    if (
      indexes !== undefined &&
      (!Array.isArray(indexes) || !indexes.every(Number.isSafeInteger))
    ) {
      throw new Error('target.blockIndexes 必须是整数数组')
    }
    const allowed = indexes === undefined ? null : new Set(indexes as number[])
    const matches: Array<{ from: number; to: number; marks: PmNode['marks'] }> = []
    editor.state.doc.forEach((block, offset, blockIndex) => {
      if (allowed && !allowed.has(blockIndex)) return
      block.descendants((node, relative) => {
        if (!node.isText || !node.text) return
        const haystack = op.matchCase ? node.text : node.text.toLocaleLowerCase()
        const needle = op.matchCase ? find : find.toLocaleLowerCase()
        let at = 0
        while ((at = haystack.indexOf(needle, at)) !== -1) {
          matches.push({
            from: offset + relative + at + 1,
            to: offset + relative + at + find.length + 1,
            marks: node.marks,
          })
          at += find.length
        }
      })
    })
    if (matches.length > 10_000) throw new Error('匹配超过 10000 处，请缩小目标范围')
    return {
      summary: `查找替换 ${matches.length} 处`,
      apply(tr) {
        for (const match of matches.toReversed()) {
          const from = tr.mapping.map(match.from)
          const to = tr.mapping.map(match.to)
          tr.replaceWith(
            from,
            to,
            replacement ? tr.doc.type.schema.text(replacement, match.marks) : [],
          )
        }
      },
    }
  }
  const target = asObject(op.target, `ops[${index}].target`)
  allowedKeys(target, ['blockIndexes'], 'target')
  if (!Array.isArray(target.blockIndexes) || target.blockIndexes.length === 0) {
    throw new Error(`${name} 需要 target.blockIndexes；文档未修改`)
  }
  const blocks = target.blockIndexes.map((value) =>
    blockAt(editor, asIndex(value, 'blockIndexes[]')),
  )
  if (new Set(target.blockIndexes).size !== target.blockIndexes.length)
    throw new Error('blockIndexes 不能重复')
  for (const block of blocks) {
    if (!['docParagraph', 'docHeading', 'docListItem'].includes(block.node.type.name)) {
      throw new Error(`${name} 的目标包含不可编辑块；文档未修改`)
    }
  }
  if (name === 'setParagraphAttrs') {
    allowedKeys(op, ['op', 'target', 'attrs'], name)
    const attrs = asObject(op.attrs, 'attrs')
    if (!Object.keys(attrs).length) throw new Error('attrs 不能为空')
    const allowed = new Set([
      'align',
      'lineSpacing',
      'lineRule',
      'lineRawTwips',
      'snapToGrid',
      'indentLeft',
      'indentRight',
      'indentFirstLine',
      'spaceBefore',
      'spaceAfter',
      'spaceBeforeAuto',
      'spaceAfterAuto',
      'contextualSpacing',
      'pageBreakBefore',
      'bidi',
      'shadingFill',
      'borders',
    ])
    for (const [key, value] of Object.entries(attrs)) {
      if (!allowed.has(key)) throw new Error(`不能设置段落属性 ${key}`)
      if (
        [
          'lineSpacing',
          'lineRawTwips',
          'indentLeft',
          'indentRight',
          'indentFirstLine',
          'spaceBefore',
          'spaceAfter',
        ].includes(key)
      ) {
        if (value !== null && (typeof value !== 'number' || !Number.isFinite(value)))
          throw new Error(`${key} 必须是有限数字或 null`)
      } else if (
        [
          'snapToGrid',
          'spaceBeforeAuto',
          'spaceAfterAuto',
          'contextualSpacing',
          'pageBreakBefore',
          'bidi',
        ].includes(key)
      ) {
        if (value !== null && typeof value !== 'boolean')
          throw new Error(`${key} 必须是布尔值或 null`)
      } else if (
        key === 'align' &&
        !['left', 'center', 'right', 'justify', null].includes(value as never)
      )
        throw new Error('align 无效')
      else if (key === 'lineRule' && !['auto', 'atLeast', 'exact', null].includes(value as never))
        throw new Error('lineRule 无效')
      else if (key === 'shadingFill' && value !== null)
        attrs.shadingFill = colorHex(value, 'shadingFill')
      else if (
        key === 'borders' &&
        value !== null &&
        (typeof value !== 'string' || !/^[tblr]*$/.test(value))
      )
        throw new Error('borders 无效')
    }
    return {
      summary: `设置 ${blocks.length} 个段落属性`,
      apply(tr) {
        for (const block of blocks)
          tr.setNodeMarkup(block.from, undefined, { ...block.node.attrs, ...attrs })
      },
    }
  }
  if (name === 'setOutlineLevel') {
    allowedKeys(op, ['op', 'target', 'level'], name)
    const level = asIndex(op.level, 'level')
    if (level < 0 || level > 9) throw new Error('level 必须在 0–9 之间')
    if (
      blocks.some(
        (block) =>
          block.node.type.name === 'docListItem' ||
          (block.node.type.name === 'docHeading' && !block.node.attrs.outlineOnly),
      )
    ) {
      throw new Error('显式大纲级别只支持普通段落和显式大纲标题')
    }
    return {
      summary: `设置 ${blocks.length} 个块的大纲级别`,
      apply(tr) {
        for (const block of blocks) {
          if (
            block.node.type.name === 'docHeading' &&
            block.node.attrs.outlineOnly &&
            block.node.attrs.level === level
          )
            continue
          if (level === 0)
            tr.setNodeMarkup(block.from, editor.schema.nodes.docParagraph, {
              ...block.node.attrs,
              level: null,
              outlineOnly: null,
            })
          else
            tr.setNodeMarkup(block.from, editor.schema.nodes.docHeading, {
              ...block.node.attrs,
              level,
              outlineOnly: true,
            })
        }
      },
    }
  }
  if (name === 'setHeadingLevel') {
    allowedKeys(op, ['op', 'target', 'level'], name)
    const level = asIndex(op.level, 'level')
    if (level < 0 || level > 9) throw new Error('level 必须为 0–9')
    if (blocks.some((block) => block.node.type.name === 'docListItem'))
      throw new Error('编号标题请通过列表与样式工具调整层级')
    if (level > 0 && headingLevels && !headingLevels.includes(level)) {
      throw new Error(`文档没有 Heading${level} 样式，不能可靠保存此标题级别`)
    }
    const type = editor.schema.nodes[level === 0 ? 'docParagraph' : 'docHeading']
    if (!type) throw new Error('编辑器缺少段落 schema')
    return {
      summary: `设置 ${blocks.length} 个块的标题级别为 ${level}`,
      apply(tr) {
        for (const block of blocks) {
          if (
            block.node.type === type &&
            Number(block.node.attrs.level ?? 0) === level &&
            !block.node.attrs.outlineOnly &&
            (level > 0 || block.node.attrs.styleId == null)
          )
            continue
          tr.setNodeMarkup(block.from, type, {
            ...block.node.attrs,
            level: level || null,
            outlineOnly: null,
            styleId: level ? (headingStyleIds?.get(level) ?? null) : null,
          })
        }
      },
    }
  }
  if (name === 'deleteBlocks') {
    allowedKeys(op, ['op', 'target'], name)
    if (blocks.length >= editor.state.doc.childCount) throw new Error('不能删除文档里的所有块')
    const sorted = blocks.toSorted((a, b) => b.from - a.from)
    return {
      summary: `删除 ${blocks.length} 个块`,
      apply(tr) {
        for (const block of sorted) tr.delete(tr.mapping.map(block.from), tr.mapping.map(block.to))
      },
    }
  }
  if (name === 'clearList') {
    allowedKeys(op, ['op', 'target'], name)
    const type = editor.schema.nodes.docParagraph
    if (!type) throw new Error('编辑器缺少段落 schema')
    return {
      summary: `清除 ${blocks.length} 个列表块`,
      apply(tr) {
        for (const block of blocks) {
          if (block.node.type.name === 'docListItem')
            tr.setNodeMarkup(block.from, type, {
              ...block.node.attrs,
              styleId: null,
            })
        }
      },
    }
  }
  if (name === 'setList') {
    allowedKeys(op, ['op', 'target', 'kind'], name)
    const kind = op.kind === undefined ? 'bullet' : op.kind
    if (kind !== 'bullet' && kind !== 'number') throw new Error('kind 必须是 bullet 或 number')
    const existingKind = kind === 'number' ? 'ordered' : 'bullet'
    let numId: string | null = null
    editor.state.doc.forEach((node) => {
      if (numId === null && node.type.name === 'docListItem' && node.attrs.kind === existingKind) {
        numId = typeof node.attrs.numId === 'string' ? node.attrs.numId : null
      }
    })
    if (numId === null) throw new Error('文档没有可复用的列表编号定义；不能保存新列表')
    if (blocks.some((block) => block.node.type.name === 'docHeading')) {
      throw new Error('标题块不能直接转换为列表')
    }
    const type = editor.schema.nodes.docListItem
    if (!type) throw new Error('编辑器缺少列表 schema')
    return {
      summary: `设置 ${blocks.length} 个列表块`,
      apply(tr) {
        for (const block of blocks) {
          if (block.node.type.name === 'docHeading') continue
          tr.setNodeMarkup(block.from, type, {
            ...block.node.attrs,
            kind: existingKind,
            numId,
            ilvl: 0,
            styleId: null,
          })
        }
      },
    }
  }
  if (name === 'stepIndent' || name === 'stepHangingIndent') {
    allowedKeys(op, ['op', 'target', 'delta'], name)
    const delta = op.delta
    if (delta !== 1 && delta !== -1) throw new Error('delta 必须是 1 或 -1')
    return {
      summary: `${name} ${blocks.length} 个块`,
      apply(tr) {
        for (const block of blocks) {
          const attrs = { ...block.node.attrs }
          if (name === 'stepIndent' && block.node.type.name === 'docListItem') {
            attrs.ilvl = Math.max(0, Math.min(8, (Number(attrs.ilvl) || 0) + delta))
          } else if (name === 'stepIndent') {
            const current = Number(attrs.indentLeft) || 0
            attrs.indentLeft =
              delta > 0
                ? Math.floor(current / 720) * 720 + 720
                : Math.max(Math.ceil(current / 720) * 720 - 720, 0)
          } else {
            attrs.indentFirstLine = Math.max(
              -2880,
              Math.min(2880, (Number(attrs.indentFirstLine) || 0) - delta * 360),
            )
          }
          tr.setNodeMarkup(block.from, undefined, attrs)
        }
      },
    }
  }
  if (name === 'setParagraphFormat') {
    const keys = [
      'align',
      'lineSpacing',
      'indentLeft',
      'indentRight',
      'indentFirstLine',
      'spaceBefore',
      'spaceAfter',
      'pageBreakBefore',
      'shadingFill',
      'borders',
    ]
    const patch = Object.fromEntries(
      keys.filter((key) => Object.hasOwn(op, key)).map((key) => [key, op[key]]),
    )
    allowedKeys(op, ['op', 'target', ...keys], name)
    if (Object.keys(patch).length === 0) throw new Error('setParagraphFormat 需要至少一个格式字段')
    for (const [key, value] of Object.entries(patch)) {
      if (
        key === 'align' &&
        !['left', 'center', 'right', 'justify', null].includes(value as never)
      ) {
        throw new Error('align 必须是 left、center、right、justify 或 null')
      }
      if (
        [
          'lineSpacing',
          'indentLeft',
          'indentRight',
          'indentFirstLine',
          'spaceBefore',
          'spaceAfter',
        ].includes(key) &&
        value !== null &&
        (typeof value !== 'number' || !Number.isFinite(value))
      ) {
        throw new Error(`${key} 必须是有限数字或 null`)
      }
      if (key === 'pageBreakBefore' && typeof value !== 'boolean')
        throw new Error('pageBreakBefore 必须是布尔值')
      if (['shadingFill', 'borders'].includes(key) && value !== null && typeof value !== 'string') {
        throw new Error(`${key} 必须是字符串或 null`)
      }
    }
    return {
      summary: `设置 ${blocks.length} 个段落的格式`,
      apply(tr) {
        for (const block of blocks)
          tr.setNodeMarkup(block.from, undefined, {
            ...block.node.attrs,
            ...patch,
            ...(Object.hasOwn(patch, 'lineSpacing') ? { lineRule: null, lineRawTwips: null } : {}),
          })
      },
    }
  }
  throw new Error(`${name} 尚未接入可验证的编辑和保存路径；整个批次未修改文档`)
}
