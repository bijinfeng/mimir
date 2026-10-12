import {
  DOCX_BRAVE_TOOLS,
  DOCX_ALL_TOOLS,
  DOCX_IMAGE_TOOLS,
  DOCX_LOCAL_TOOLS,
  DOCX_MEDIA_TOOLS,
} from '@mimir/shared'
import type { DocxAgentCapabilities } from '@mimir/shared'
import { braveSearchReady } from './docx-brave-search.js'
import { docxImageReady } from './docx-image-generation.js'
import { docxMediaReadiness } from './docx-media-analysis.js'
import { getDocument } from './documents.js'
import { modelReady } from './model.js'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export async function docxAgentCapabilities(
  documentId: string,
): Promise<DocxAgentCapabilities | null> {
  const document = await getDocument(documentId)
  if (!document || document.kind !== 'file' || document.mime !== DOCX_MIME) return null
  const [ready, searchReady, imageReady, media] = await Promise.all([
    modelReady('chat'),
    braveSearchReady(),
    docxImageReady(),
    docxMediaReadiness(),
  ])
  return {
    documentId,
    modelReady: ready,
    mediaKinds: ready
      ? [
          ...(media.vision ? ['image' as const, 'video' as const] : []),
          ...(media.audio ? ['audio' as const] : []),
        ]
      : [],
    availableTools: ready
      ? [
          ...DOCX_LOCAL_TOOLS.map((tool) => tool.name),
          ...(searchReady ? DOCX_BRAVE_TOOLS.map((tool) => tool.name) : []),
          ...(imageReady ? DOCX_IMAGE_TOOLS.map((tool) => tool.name) : []),
          ...(media.vision || media.audio ? DOCX_MEDIA_TOOLS.map((tool) => tool.name) : []),
        ]
      : [],
    unavailableTools: !ready
      ? DOCX_ALL_TOOLS.map((tool) => ({
          name: tool.name,
          reason: '请先配置可用的聊天模型',
        }))
      : [
          ...(searchReady
            ? []
            : DOCX_BRAVE_TOOLS.map((tool) => ({
                name: tool.name,
                reason: '请配置 Brave Search API 密钥',
              }))),
          ...(imageReady
            ? []
            : DOCX_IMAGE_TOOLS.map((tool) => ({
                name: tool.name,
                reason: '请配置图片生成 API 密钥和模型',
              }))),
          ...(media.vision || media.audio
            ? []
            : DOCX_MEDIA_TOOLS.map((tool) => ({
                name: tool.name,
                reason: '请启用支持图片输入的聊天模型或配置音频转录服务',
              }))),
        ],
  }
}
