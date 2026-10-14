import {
  DOCX_BRAVE_TOOLS,
  DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
  DOCX_IMAGE_TOOLS,
  DOCX_LOCAL_TOOLS,
  DOCX_MEDIA_TOOLS,
} from '@mimir/shared'
import type { DocumentAgentFormat } from '@mimir/shared'
import type { ModelCallOptions } from './model.js'
import { braveImageSearch, braveSearchReady, braveWebSearch } from './docx-brave-search.js'
import { docxImageReady } from './docx-image-generation.js'
import { docxMediaReadiness } from './docx-media-analysis.js'
import { htmlAgentCatalog } from './html-agent-catalog.js'
import { markdownAgentCatalog } from './markdown-agent-catalog.js'
import { pdfAgentCatalog } from './pdf-agent-catalog.js'
import { pptxAgentCatalog } from './pptx-agent-catalog.js'
import { xlsxAgentCatalog } from './xlsx-agent-catalog.js'

export interface DocumentAgentCatalog {
  format: DocumentAgentFormat
  systemPrompt: string
  tools: NonNullable<ModelCallOptions['tools']>
  /** Only these tool names may be returned as client interrupts. */
  clientToolNames: ReadonlySet<string>
  unavailableTools?: { name: string; reason: string }[]
}

const DOCX_SYSTEM_PROMPT = `你是 Mimir 的 DOCX 文档编辑助手。只能用提供的工具读取和修改当前打开的文档。
开始编辑前读取当前画布；画布可能有尚未保存的改动。用户选区以本轮冻结的选区为准。
每次工具结果以真实成功或失败为准。工具失败、取消或未执行时，不得声称已经修改文档。
编辑只更新画布，用户需要手动保存。回答要简洁，并说明实际修改了什么。`

/** Additional formats register their catalog here only after their editor executor exists. */
export async function documentAgentCatalog(
  format: DocumentAgentFormat,
): Promise<DocumentAgentCatalog | null> {
  if (format === 'markdown') return markdownAgentCatalog()
  if (format === 'html') return htmlAgentCatalog()
  if (format === 'pptx') return pptxAgentCatalog()
  if (format === 'xlsx') return xlsxAgentCatalog()
  if (format === 'pdf') return pdfAgentCatalog()
  if (format !== 'docx') return null
  const mediaReady = await docxMediaReadiness()
  const mediaKinds = [
    ...(mediaReady.vision ? ['image', 'video'] : []),
    ...(mediaReady.audio ? ['audio'] : []),
  ]
  const local = [
    ...DOCX_LOCAL_TOOLS,
    ...((await docxImageReady()) ? DOCX_IMAGE_TOOLS : []),
    ...(mediaKinds.length ? DOCX_MEDIA_TOOLS : []),
  ]
  const tools = [
    ...local.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema:
        tool.name === 'analyze_media'
          ? {
              ...tool.inputSchema,
              properties: {
                ...tool.inputSchema.properties,
                kind: { type: 'string', enum: mediaKinds },
              },
            }
          : tool.inputSchema,
      outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
    })),
    ...((await braveSearchReady())
      ? DOCX_BRAVE_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          execute: tool.name === 'web_search' ? braveWebSearch : braveImageSearch,
        }))
      : []),
  ] as unknown as NonNullable<ModelCallOptions['tools']>
  return {
    format,
    systemPrompt: DOCX_SYSTEM_PROMPT,
    tools,
    clientToolNames: new Set(local.map((tool) => tool.name)),
  }
}
