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
export * from './pdf-agent.js'

/** 统一的 API 响应外壳，前端 api client 依赖它做错误处理 */
export interface ApiError {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
