import { DOCX_CLIENT_TOOL_OUTPUT_SCHEMA } from '@mimir/shared'
import { opVocabulary } from '../../../../packages/office/vendor/packages/pptx-ops/src/op-docs.js'
import type { DocumentAgentCatalog } from './document-agent-catalog.js'
import type { ModelCallOptions } from './model.js'

const tools = [
  {
    name: 'read_slide',
    description: '读取当前未保存的 PPTX 幻灯片和元素。slide 是从 0 开始的页序号；省略时读当前页。',
    inputSchema: { type: 'object', properties: { slide: { type: 'integer', minimum: 0 } } },
    outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
  },
  {
    name: 'apply_ops',
    description: `在当前未保存 PPTX 上原子执行固定版 GenOffice 操作。先 read_slide 获取持久元素 ID；不确定参数时调用 load_guide。可调用操作：\n${opVocabulary()}`,
    inputSchema: {
      type: 'object',
      properties: { ops: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object' } } },
      required: ['ops'],
    },
    outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
  },
  {
    name: 'load_guide',
    description:
      '按组读取固定版 GenOffice PPTX 操作指南；group 为 text、element、insert、table、slide 或 deck。',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', enum: ['text', 'element', 'insert', 'table', 'slide', 'deck'] },
      },
    },
    outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA,
  },
] as unknown as NonNullable<ModelCallOptions['tools']>

export function pptxAgentCatalog(): DocumentAgentCatalog {
  return {
    format: 'pptx',
    systemPrompt:
      '你是 Mimir 的 PPTX 编辑助手。先读取当前未保存的幻灯片；只调用工具描述中明确可执行的操作。元素 ID 和页序号须来自 read_slide。工具失败、取消、冲突时不得声称已修改。编辑只更新画布，用户手动保存。',
    tools,
    clientToolNames: new Set(['read_slide', 'apply_ops', 'load_guide']),
  }
}
