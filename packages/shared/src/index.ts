export * from './ai-text.js'
export * from './auth.js'
export * from './documents.js'
export * from './feeds.js'
export * from './files.js'
export * from './search.js'
export * from './structure.js'
export * from './conversations.js'
export * from './capture.js'
export * from './export.js'
export * from './config.js'
export * from './plugin.js'
export * from './seams.js'
export * from './usage.js'
export * from './desktop.js'
export * from './local.js'
export * from './docx-agent.js'
export * from './document-agent.js'
export * from './html-brief.js'
export * from './pdf-agent.js'
export * from './xlsx-agent.js'

/** 统一的 API 响应外壳，前端 api client 依赖它做错误处理 */
export interface ApiError {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
export * from './pptx-agent.js'
export * from './pptx-ink.js'

export * from './pptx-fill.js'
export * from './pptx-zoom.js'

export * from './pptx-animation.js'
export * from './pptx-shape.js'
export * from './pptx-paragraph.js'
export * from './pptx-picture.js'
export * from './pptx-image.js'

export * from './pdf-visual-signature.js'
