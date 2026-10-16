import type {
  DocumentAgentCreateInput,
  DocumentAgentCreateFileFields,
  DocumentAgentCreatedDocument,
} from '@mimir/shared'
import { documentAgentFormatOf } from './document-agent-format.js'
import { deleteDocument, getDocument } from './documents.js'
import { uploadFile } from './upload.js'
import { parseRichContent, richDocxOf } from './document-rich-content.js'
import { richPdfOf } from './document-rich-pdf.js'

export type DocxCreatedFormat = 'docx' | 'pdf' | 'md' | 'html'
export interface CreateDocxAgentDocumentInput {
  documentId: string
  title: string
  format: DocxCreatedFormat
  content: string
}
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Store a generated file through the same original-file, parse and index path as uploads. */
export async function createDocxAgentDocument(
  input: CreateDocxAgentDocumentInput,
): Promise<DocumentAgentCreatedDocument> {
  const source = await getDocument(input.documentId)
  if (!source || source.kind !== 'file' || source.mime !== DOCX_MIME)
    throw new Error('当前文档不是可编辑的 DOCX 文件')
  return createDocumentAgentDocument(input)
}

function fileTitle(value: string): string {
  const title = Array.from(value.trim(), (char) =>
    char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || '/\\:*?"<>|'.includes(char)
      ? ' '
      : char,
  )
    .join('')
    .replace(/\s+/g, ' ')
    .slice(0, 160)
    .trim()
  if (!title) throw new Error('新文档标题不能为空')
  return title
}

async function requireCreationSource(documentId: string, spreadsheet = false) {
  const source = await getDocument(documentId)
  const format = source && documentAgentFormatOf(source)
  if (!format || (spreadsheet ? format !== 'xlsx' : !['docx', 'pdf', 'xlsx'].includes(format)))
    throw new Error('当前文档不支持创建新文件')
}

async function storeCreatedFile(
  title: string,
  format: DocumentAgentCreatedDocument['format'],
  data: Uint8Array,
): Promise<DocumentAgentCreatedDocument> {
  const result = await uploadFile({ filename: `${title}.${format}`, data })
  if (result.parseError) {
    await deleteDocument(result.document.id)
    throw new Error(`新文档解析失败：${result.parseError}`)
  }
  return { documentId: result.document.id, title: result.document.title, format, parseError: null }
}

export async function createDocumentAgentDocument(
  input: DocumentAgentCreateInput,
): Promise<DocumentAgentCreatedDocument> {
  await requireCreationSource(input.documentId)
  const title = fileTitle(input.title)
  if (!['docx', 'pdf', 'md', 'html'].includes(input.format)) throw new Error('不支持的新文档格式')
  if (!input.content.trim() || input.content.length > 100_000)
    throw new Error('新文档内容为空或过长')
  // Markdown and full HTML are authored formats, not conversion inputs.
  if (
    input.format === 'html' &&
    (!/<html[\s>]/i.test(input.content) ||
      !/<body[\s>]/i.test(input.content) ||
      !/<\/html\s*>/i.test(input.content))
  )
    throw new Error('HTML 新文档需要完整的 html 和 body 页面结构')
  if (input.format === 'md' || input.format === 'html')
    return storeCreatedFile(title, input.format, new TextEncoder().encode(input.content))
  const rich = parseRichContent(input.content)
  const data = input.format === 'docx' ? await richDocxOf(rich) : await richPdfOf(rich)
  return storeCreatedFile(title, input.format, data)
}

export async function createDocumentAgentFile(
  input: DocumentAgentCreateFileFields & { bytes: Uint8Array },
): Promise<DocumentAgentCreatedDocument> {
  await requireCreationSource(input.documentId, true)
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > 50 * 1024 * 1024)
    throw new Error('新文件为空或超过 50 MiB 上限')
  return storeCreatedFile(fileTitle(input.title), input.format, input.bytes)
}
