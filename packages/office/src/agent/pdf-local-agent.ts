import { pdfLocalOperationSchema, type PdfLocalOperation, type PdfLocalInfo } from '@mimir/shared'
export interface PdfLocalOutput {
  name: string
  bytes: Uint8Array
}
export interface PdfHostLocal {
  (request: {
    bytes: Uint8Array
    expectedVersion: number
    operation: PdfLocalOperation
    assetFile?: File
    signal?: AbortSignal
  }): Promise<{
    bytes?: Uint8Array
    version: number
    outputs?: PdfLocalOutput[]
    info?: PdfLocalInfo
  }>
}
export const PDF_LOCAL_TOOLS = [
  'export_pdf',
  'insert_blank_page',
  'set_page_size',
  'crop_pages',
  'extract_pages',
  'split_pdf',
  'split_pages',
  'merge_pages',
  'replace_pages',
  'import_pages',
  'get_outline',
  'get_document_properties',
  'set_watermark',
  'set_header_footer',
  'add_form_mark',
  'add_drawing',
  'update_drawing',
  'delete_drawing',
  'set_metadata',
  'set_outline',
] as const
export function pdfLocalToolOperation(
  tool: string,
  args: Record<string, unknown>,
): PdfLocalOperation {
  if (tool === 'get_outline' || tool === 'get_document_properties') return { op: 'read' }
  return pdfLocalOperationSchema.parse({ op: tool, ...args })
}
