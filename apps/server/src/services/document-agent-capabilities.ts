import { documentAgentCanvasSupported } from '@mimir/shared'
import type { DocumentAgentCapabilities } from '@mimir/shared'
import { documentAgentCatalog } from './document-agent-catalog.js'
import { documentAgentFormatOf } from './document-agent-format.js'
import { getDocument } from './documents.js'
import { docxAgentCapabilities } from './docx-agent-capabilities.js'
import { docxMediaReadiness } from './docx-media-analysis.js'
import { modelReady } from './model.js'

export async function documentAgentCapabilities(
  documentId: string,
): Promise<DocumentAgentCapabilities | null> {
  const document = await getDocument(documentId)
  if (!document) return null
  const format = documentAgentFormatOf(document)
  if (!format) return null
  if (!documentAgentCanvasSupported(document))
    return {
      format,
      documentId,
      modelReady: await modelReady('chat'),
      executorReady: false,
      availableTools: [],
      unavailableTools: [{ name: 'edit', reason: '当前文件没有可执行编辑工具的画布' }],
    }
  if (format === 'docx') {
    const legacy = await docxAgentCapabilities(documentId)
    if (!legacy) return null
    return { ...legacy, format, executorReady: true }
  }
  const catalog = await documentAgentCatalog(format)
  const vision = format === 'pptx' && (await docxMediaReadiness()).vision
  return {
    format,
    documentId,
    modelReady: await modelReady('chat'),
    executorReady: catalog !== null,
    ...(format === 'pptx' ? { mediaKinds: vision ? ['image' as const] : [] } : {}),
    availableTools: catalog ? catalog.tools.map((tool) => tool.name) : [],
    unavailableTools: catalog
      ? (catalog.unavailableTools ?? [])
      : [{ name: 'edit', reason: '当前格式的 Agent 编辑器尚未接入' }],
  }
}
