import { Extension, type Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import type { Node as PmNode } from '@tiptap/pm/model'
import { NodeSelection, type Transaction } from '@tiptap/pm/state'
import {
  generateCaptionXml,
  generateIndexFieldXml,
  generateTocFieldXml,
} from '../../vendor/packages/docx-engine/src/generate.js'
import { bibliographyLine, citationText } from '../../vendor/packages/docx-engine/src/sources.js'
import { escapeXmlText } from '../../vendor/packages/docx-engine/src/xml-utils.js'
import type { SourceInfo } from '../../vendor/packages/docx-engine/src/types.js'
import type { DocxSession } from '../docx.js'
import {
  REFERENCE_SOURCES_ATTR,
  referenceSourcesAttr,
  invalidReferenceText,
} from '../docx-reference-save.js'

export const DocxReferencesExtension = Extension.create({
  name: 'mimirReferences',
  addGlobalAttributes() {
    return [
      {
        types: ['doc'],
        attributes: { [REFERENCE_SOURCES_ATTR]: { default: null, rendered: false } },
      },
    ]
  },
})
export const SOURCE_TYPES = [
  { value: 'Book', label: '图书' },
  { value: 'JournalArticle', label: '期刊文章' },
  { value: 'InternetSite', label: '网站' },
  { value: 'Report', label: '报告' },
  { value: 'Misc', label: '其他' },
]
export function referenceSources(
  doc: PmNode,
  session: DocxSession,
  pending?: SourceInfo[],
): SourceInfo[] {
  return structuredClone(
    referenceSourcesAttr(doc) ?? pending ?? session.footnotes.parsed.sources ?? [],
  )
}
export interface ReferenceTarget {
  doc: PmNode
  from: number
  to: number
  after: number
}
export function referenceTarget(editor: Editor): ReferenceTarget {
  const { doc, selection } = editor.state
  const index = Math.min(
    (selection instanceof NodeSelection ? selection.$from : selection.$to).index(0),
    doc.childCount - 1,
  )
  let after = 0
  doc.forEach((node, offset, childIndex) => {
    if (childIndex === index) after = offset + node.nodeSize
  })
  return { doc, from: selection.from, to: selection.to, after }
}
function xmlOf(node: PmNode, session: DocxSession): string {
  return String(
    node.attrs.genXml ??
      session.blocks.find((block) => block.docxIndex === node.attrs.docxIndex)?.originalXml ??
      '',
  )
}
export function referenceHeadings(doc: PmNode): { level: number; text: string; pos: number }[] {
  const entries: { level: number; text: string; pos: number }[] = []
  doc.forEach((node, pos) => {
    if (node.type.name === 'docHeading' && node.textContent.trim())
      entries.push({
        level: Math.max(1, Math.min(9, Number(node.attrs.level) || 1)),
        text: node.textContent,
        pos,
      })
  })
  return entries
}
export interface ReferenceToc {
  from: number
  to: number
  label: string
  pageBreak: boolean
}
/** Replace only complete protected TOCs, never a paragraph containing outside text. */
export function referenceTocs(doc: PmNode, session: DocxSession): ReferenceToc[] {
  const result: ReferenceToc[] = []
  let from = -1,
    depth = 0,
    instruction = '',
    safe = true,
    pageBreak = false
  doc.forEach((node, offset) => {
    const xml = xmlOf(node, session)
    if (from < 0 && !/<w:fldChar\b[^>]*w:fldCharType="begin"/.test(xml)) return
    if (from < 0) {
      from = offset
      instruction = ''
      safe = true
      pageBreak = false
    }
    if (node.type.name !== 'docProtected' || node.attrs.blockType !== 'passthrough') safe = false
    if (
      /<w:(?:drawing|object|pict|bookmarkStart|bookmarkEnd|commentRangeStart|commentRangeEnd|sdt)\b/.test(
        xml,
      )
    )
      safe = false
    const contentXml = xml.replace(
      /<w:pPr\b[^>]*\/>|<w:pPr\b(?![^>]*\/>)[^>]*>[\s\S]*?<\/w:pPr>/g,
      '',
    )
    for (const match of contentXml.matchAll(
      /<w:fldChar\b[^>]*>|<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>|<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:(?:br|tab|sym|footnoteReference|endnoteReference)\b[^>]*>/g,
    )) {
      const token = match[0]
      if (token.startsWith('<w:fldChar')) {
        const kind = /w:fldCharType="([^"]+)"/.exec(token)?.[1]
        if (kind === 'begin') depth++
        else if (kind === 'end') depth--
        if (depth < 0) safe = false
      } else if (token.startsWith('<w:instrText') && depth === 1)
        instruction += token.replace(/<[^>]*>/g, '')
      else if (/^<w:t(?:\s|>)/.test(token) && depth === 0 && token.replace(/<[^>]*>/g, ''))
        safe = false
      else if (
        depth === 0 &&
        /^<w:(?:br|tab|sym|footnoteReference|endnoteReference)\b/.test(token) &&
        !/w:type="page"/.test(token)
      )
        safe = false
    }
    pageBreak ||= /<w:br\b[^>]*w:type="page"/.test(xml)
    if (depth <= 0) {
      if (safe && /^\s*TOC(?:\s|\\)/.test(instruction))
        result.push({
          from,
          to: offset + node.nodeSize,
          label: node.attrs.previewText || `目录 ${result.length + 1}`,
          pageBreak,
        })
      from = -1
      depth = 0
    }
  })
  return result
}
export function referenceTerms(doc: PmNode): string[] {
  const terms = new Set<string>()
  doc.descendants((node) => {
    if (node.type.name === 'docXeMark') terms.add(String(node.attrs.term))
  })
  return [...terms].filter(Boolean).toSorted((a, b) => a.localeCompare(b, 'zh-CN'))
}
export function nextCaptionNumber(doc: PmNode, session: DocxSession, label: string): number {
  let count = 0,
    previousEnd = -1,
    previousInstruction = ''
  doc.descendants((node, pos) => {
    if (node.type.name === 'docProtected') {
      for (const match of xmlOf(node, session).matchAll(
        /<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/g,
      ))
        if (/^\s*SEQ\s+(\S+)/.exec(match[1]!)?.[1] === label) count++
    }
    const instruction = String(
      node.marks.find((mark) => mark.type.name === 'instrField')?.attrs.instr ?? '',
    )
    if (
      /^\s*SEQ\s+(\S+)/.exec(instruction)?.[1] === label &&
      (pos !== previousEnd || instruction !== previousInstruction)
    )
      count++
    if (node.isText) {
      previousEnd = pos + node.nodeSize
      previousInstruction = instruction
    }
  })
  return count + 1
}
export function validateSource(source: SourceInfo, existing = false): void {
  referenceSourcesAttr({ attrs: { [REFERENCE_SOURCES_ATTR]: [source] } })
  if (!existing && !/^[\p{L}\p{N}_-]{1,80}$/u.test(source.tag))
    throw new Error('标签请使用 1–80 个字母、数字、下划线或连字符')
  if (!source.title.trim() || !source.type.trim()) throw new Error('请填写来源标题与类型')
}
function citationInstruction(source: SourceInfo): string {
  if (
    source.tag.includes('"') ||
    source.tag.includes('\\') ||
    invalidReferenceText(source.tag, true)
  )
    throw new Error('该来源标签不能安全用于引文域，请在 Word 中调整标签')
  const tag = /^[\p{L}\p{N}_-]+$/u.test(source.tag) ? source.tag : `"${source.tag}"`
  return `CITATION ${tag} \\l 2052`
}
export type ReferenceAction =
  | { kind: 'toc'; region?: ReferenceToc }
  | { kind: 'caption'; label: string; text: string }
  | { kind: 'source'; source: SourceInfo; insertCitation?: boolean }
  | { kind: 'citation'; tag: string }
  | { kind: 'bibliography' }
  | { kind: 'mark'; term: string }
  | { kind: 'index' }
  | { kind: 'field'; instruction: string; result: string }

export function applyReference(
  editor: Editor,
  session: DocxSession,
  target: ReferenceTarget,
  action: ReferenceAction,
  pending?: SourceInfo[],
): ReferenceTarget {
  if (editor.isDestroyed || editor.state.doc !== target.doc)
    throw new Error('文档已变化，请重新打开引用面板')
  const { schema } = editor.state
  let tr: Transaction = closeHistory(editor.state.tr)
  const inline = (text: string, instruction?: string) => {
    const $pos = tr.doc.resolve(target.to)
    if (!$pos.parent.inlineContent) throw new Error('请将光标放在正文文字中，再打开此面板')
    tr.insert(
      target.to,
      schema.text(
        text,
        instruction ? [schema.marks.instrField!.create({ instr: instruction, dirty: true })] : [],
      ),
    )
  }
  const protectedNode = (xml: string, label: string, fieldDisplay?: Record<string, unknown>) =>
    schema.nodes.docProtected!.create({
      docxIndex: null,
      blockType: 'passthrough',
      label,
      genXml: xml,
      fieldDisplay: fieldDisplay ?? { kind: 'text', left: label },
      previewText: label,
    })
  const sources = referenceSources(target.doc, session, pending)
  if (action.kind === 'source') {
    const index = sources.findIndex((source) => source.tag === action.source.tag)
    validateSource(action.source, index >= 0)
    if (index < 0) sources.push(structuredClone(action.source))
    else sources[index] = structuredClone(action.source)
    referenceSourcesAttr({ attrs: { [REFERENCE_SOURCES_ATTR]: sources } })
    if (JSON.stringify(sources) !== JSON.stringify(referenceSources(target.doc, session, pending)))
      tr.setDocAttribute(REFERENCE_SOURCES_ATTR, sources)
    if (action.insertCitation)
      inline(citationText(action.source), citationInstruction(action.source))
  } else if (action.kind === 'citation') {
    const source = sources.find((item) => item.tag === action.tag)
    if (!source) throw new Error('来源已不存在，请重新选择')
    validateSource(source, true)
    // Pending source metadata must travel with its native field in this same transaction.
    if (pending && !referenceSourcesAttr(target.doc)) {
      referenceSourcesAttr({ attrs: { [REFERENCE_SOURCES_ATTR]: sources } })
      tr.setDocAttribute(REFERENCE_SOURCES_ATTR, sources)
    }
    inline(citationText(source), citationInstruction(source))
  } else if (action.kind === 'caption') {
    if (
      !['图', '表', '公式'].includes(action.label) ||
      action.text.length > 4000 ||
      invalidReferenceText(action.text)
    )
      throw new Error('题注内容无效')
    const number = nextCaptionNumber(target.doc, session, action.label)
    tr.insert(
      target.after,
      protectedNode(
        generateCaptionXml(action.label, number, action.text),
        `${action.label} ${number} ${action.text}`,
      ),
    )
  } else if (action.kind === 'toc') {
    const entries = referenceHeadings(target.doc)
    if (!entries.length) throw new Error('文档中没有标题，请先设置标题样式')
    const nodes = generateTocFieldXml(entries).map((xml, i) =>
      protectedNode(xml, '目录', {
        kind: 'tocLine',
        left: entries[i]!.text,
        right: '',
        level: entries[i]!.level,
      }),
    )
    if (action.region) {
      const valid = referenceTocs(target.doc, session).find(
        (region) => region.from === action.region!.from && region.to === action.region!.to,
      )
      if (!valid) throw new Error('无法安全识别该目录的完整字段范围')
      if (valid.pageBreak)
        nodes.push(
          protectedNode('<w:p><w:r><w:br w:type="page"/></w:r></w:p>', '分页符', {
            kind: 'pageBreak',
          }),
        )
      tr.replaceWith(valid.from, valid.to, nodes)
    } else tr.insert(target.after, nodes)
  } else if (action.kind === 'bibliography') {
    if (!sources.length) throw new Error('请先创建来源')
    if (pending && !referenceSourcesAttr(target.doc)) {
      referenceSourcesAttr({ attrs: { [REFERENCE_SOURCES_ATTR]: sources } })
      tr.setDocAttribute(REFERENCE_SOURCES_ATTR, sources)
    }
    const nodes = sources.map((source, i) => {
      const text = bibliographyLine(source)
      const begin =
        i === 0
          ? '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> BIBLIOGRAPHY </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
          : ''
      const end = i === sources.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : ''
      return protectedNode(
        `<w:p>${begin}<w:r><w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r>${end}</w:p>`,
        text,
      )
    })
    tr.insert(target.after, nodes)
  } else if (action.kind === 'mark') {
    if (
      !action.term.trim() ||
      action.term.length > 500 ||
      action.term.includes('"') ||
      invalidReferenceText(action.term, true)
    )
      throw new Error('请填写不含双引号或控制字符的索引词（最多 500 字）')
    if (!tr.doc.resolve(target.to).parent.inlineContent) throw new Error('请将光标放在正文文字中')
    tr.insert(target.to, schema.nodes.docXeMark!.create({ term: action.term.trim() }))
  } else if (action.kind === 'index') {
    const terms = referenceTerms(target.doc)
    if (!terms.length) throw new Error('请先标记索引项')
    tr.insert(
      target.after,
      generateIndexFieldXml(terms).map((xml, i) => protectedNode(xml, terms[i]!)),
    )
  } else {
    const instruction = action.instruction.trim()
    const keyword = /^([A-Z][A-Z0-9]*)\b/i.exec(instruction)?.[1]?.toUpperCase()
    if (
      !keyword ||
      ![
        'DATE',
        'TIME',
        'PAGE',
        'NUMPAGES',
        'FILENAME',
        'AUTHOR',
        'TITLE',
        'SUBJECT',
        'KEYWORDS',
        'CREATEDATE',
        'SAVEDATE',
        'PRINTDATE',
        'SEQ',
        'REF',
        'PAGEREF',
        'STYLEREF',
      ].includes(keyword) ||
      instruction.length > 2000 ||
      invalidReferenceText(instruction, true)
    )
      throw new Error('请选择支持的原生域；外部内容、宏与附加组件域不在此入口插入')
    if (!action.result || action.result.length > 4000 || invalidReferenceText(action.result))
      throw new Error('请提供有效的当前显示文字')
    inline(action.result, instruction)
  }
  if (tr.docChanged) {
    editor.view.dispatch(tr)
    editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
  }
  // Keep the original insertion boundary after our own transaction; external selection changes do not retarget it.
  return {
    doc: editor.state.doc,
    from: tr.mapping.map(target.from, -1),
    to: tr.mapping.map(target.to, 1),
    after: tr.mapping.map(target.after, 1),
  }
}
