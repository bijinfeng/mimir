import type { ParseInput } from '@mimir/shared'
import { createDocxParser } from './docx.js'
import { createXlsxParser } from './xlsx.js'
import { createPptxParser } from './pptx.js'
import { createPdfParser } from './pdf.js'

/** Isolated worker entry uses the same pure parsers as registered KB extraction. */
export async function parseAttachmentFile(
  type: 'docx' | 'xlsx' | 'pptx' | 'pdf',
  data: Uint8Array,
  filename: string,
): Promise<string> {
  const factories = {
    docx: createDocxParser,
    xlsx: createXlsxParser,
    pptx: createPptxParser,
    pdf: createPdfParser,
  }
  return (await factories[type]().parse({ type, data, filename } as ParseInput)).markdown
}
