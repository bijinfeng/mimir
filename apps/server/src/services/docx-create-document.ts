import { readFile } from 'node:fs/promises'
import { parseHTML } from 'linkedom'
import fontkit from '@pdf-lib/fontkit'
import JSZip from 'jszip'
import { PDFDocument, rgb } from 'pdf-lib'
import { deleteDocument, getDocument } from './documents.js'
import { uploadFile } from './upload.js'

export type DocxCreatedFormat = 'docx' | 'pdf' | 'md' | 'html'
export interface CreateDocxAgentDocumentInput {
  documentId: string
  title: string
  format: DocxCreatedFormat
  content: string
}
type Block = { kind: 'paragraph' | 'heading' | 'list'; text: string; level: number }
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const FONT = 'NotoSansCJKsc-Regular-subset.woff2'
const encode = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function blocksOf(content: string): Block[] {
  if (/<\/?[a-z][^>]*>/i.test(content)) {
    const { document } = parseHTML(`<html><body>${content}</body></html>`)
    for (const node of document.querySelectorAll('script,style,iframe,object,template'))
      node.remove()
    const elements = [...document.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre')]
    if (elements.length)
      return elements
        .map((node) => {
          const name = node.localName.toLowerCase()
          return {
            kind: /^h[1-6]$/.test(name) ? 'heading' : name === 'li' ? 'list' : 'paragraph',
            text: (node.textContent ?? '').trim(),
            level: /^h[1-6]$/.test(name) ? Number(name[1]) : 0,
          } as Block
        })
        .filter((block) => block.text)
    content = document.body.textContent ?? ''
  }
  return content
    .split(/\r?\n/)
    .map((line): Block | null => {
      const text = line.trim()
      if (!text) return null
      const heading = /^(#{1,6})\s+(.+)$/.exec(text)
      if (heading) return { kind: 'heading', text: heading[2]!, level: heading[1]!.length }
      const list = /^(?:[-*+] |\d+[.)] )(.+)$/.exec(text)
      return list
        ? { kind: 'list', text: list[1]!, level: 0 }
        : { kind: 'paragraph', text, level: 0 }
    })
    .filter((block): block is Block => block !== null)
}

function markdownOf(blocks: Block[]): string {
  return (
    blocks
      .map((b) =>
        b.kind === 'heading'
          ? `${'#'.repeat(b.level)} ${b.text}`
          : b.kind === 'list'
            ? `- ${b.text}`
            : b.text,
      )
      .join('\n\n') + '\n'
  )
}

function htmlOf(blocks: Block[]): string {
  const body = blocks
    .map((b) => {
      const tag = b.kind === 'heading' ? `h${b.level}` : 'p'
      return `<${tag}>${encode((b.kind === 'list' ? '• ' : '') + b.text)}</${tag}>`
    })
    .join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body>${body}</body></html>`
}

async function docxOf(blocks: Block[]): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  )
  zip.file(
    'word/styles.xml',
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      Array.from(
        { length: 6 },
        (_, i) =>
          `<w:style w:type="paragraph" w:styleId="Heading${i + 1}"><w:name w:val="heading ${i + 1}"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="${i}"/></w:pPr></w:style>`,
      ).join('') +
      '</w:styles>',
  )
  const paragraphs = blocks
    .map(
      (b) =>
        `<w:p><w:pPr>${b.kind === 'heading' ? `<w:pStyle w:val="Heading${b.level}"/>` : ''}</w:pPr><w:r><w:t xml:space="preserve">${encode((b.kind === 'list' ? '• ' : '') + b.text)}</w:t></w:r></w:p>`,
    )
    .join('')
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

async function cjkFont(): Promise<Uint8Array> {
  for (const path of [`../fonts/${FONT}`, `../../public/fonts/${FONT}`]) {
    try {
      return await readFile(new URL(path, import.meta.url))
    } catch {
      /* source or built location */
    }
  }
  throw new Error('PDF 字体文件缺失')
}

async function pdfOf(blocks: Block[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fontBytes = await cjkFont()
  const fontFace = fontkit.create(fontBytes)
  for (const block of blocks) {
    for (const char of block.text) {
      if (fontFace.glyphForCodePoint(char.codePointAt(0)!).id === 0)
        throw new Error(`PDF 字体不支持字符：${char}`)
    }
  }
  const font = await pdf.embedFont(fontBytes)
  const width = 595.28,
    height = 841.89,
    margin = 50
  let page = pdf.addPage([width, height]),
    y = height - margin
  for (const block of blocks) {
    const size = block.kind === 'heading' ? Math.max(14, 22 - block.level * 2) : 11
    const lineHeight = size * 1.55
    let line = ''
    const flush = () => {
      if (y < margin + lineHeight) {
        page = pdf.addPage([width, height])
        y = height - margin
      }
      page.drawText(line, { x: margin, y, font, size, color: rgb(0.1, 0.1, 0.1) })
      y -= lineHeight
      line = ''
    }
    for (const char of (block.kind === 'list' ? '• ' : '') + block.text) {
      if (line && font.widthOfTextAtSize(line + char, size) > width - margin * 2) flush()
      line += char
    }
    if (line) flush()
    y -= lineHeight * 0.35
  }
  return pdf.save()
}

/** Store a generated file through the same original-file, parse and index path as uploads. */
export async function createDocxAgentDocument(input: CreateDocxAgentDocumentInput): Promise<{
  documentId: string
  title: string
  format: DocxCreatedFormat
  parseError: string | null
}> {
  const source = await getDocument(input.documentId)
  if (!source || source.kind !== 'file' || source.mime !== DOCX_MIME)
    throw new Error('当前文档不是可编辑的 DOCX 文件')
  const title = Array.from(input.title.trim(), (char) =>
    char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || '/\\:*?"<>|'.includes(char)
      ? ' '
      : char,
  )
    .join('')
    .replace(/\s+/g, ' ')
    .slice(0, 160)
    .trim()
  if (!title) throw new Error('新文档标题不能为空')
  if (!['docx', 'pdf', 'md', 'html'].includes(input.format)) throw new Error('不支持的新文档格式')
  if (!input.content.trim() || input.content.length > 100_000)
    throw new Error('新文档内容为空或过长')
  const blocks = blocksOf(input.content)
  if (!blocks.length) throw new Error('新文档没有可写入的内容')
  const data =
    input.format === 'docx'
      ? await docxOf(blocks)
      : input.format === 'pdf'
        ? await pdfOf(blocks)
        : new TextEncoder().encode(input.format === 'html' ? htmlOf(blocks) : markdownOf(blocks))
  const result = await uploadFile({ filename: `${title}.${input.format}`, data })
  if (result.parseError) {
    await deleteDocument(result.document.id)
    throw new Error(`新文档解析失败：${result.parseError}`)
  }
  return {
    documentId: result.document.id,
    title: result.document.title,
    format: input.format,
    parseError: result.parseError,
  }
}
