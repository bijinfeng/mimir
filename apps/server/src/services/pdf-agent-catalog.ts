import { DOCX_CLIENT_TOOL_OUTPUT_SCHEMA } from '@mimir/shared'
import type { DocumentAgentCatalog } from './document-agent-catalog.js'
import type { ModelCallOptions } from './model.js'
import { pdfAgentAssetPaths } from './pdf-agent-host.js'

const tools = [
  {
    name: 'read_pages',
    description: '读取当前未保存 PDF 的连续页面文字层，一次最多 10 页。页号从 1 开始。',
    inputSchema: {
      type: 'object',
      required: ['start'],
      properties: { start: { type: 'integer', minimum: 1 }, end: { type: 'integer', minimum: 1 } },
    },
  },
  {
    name: 'search_text',
    description: '搜索当前 PDF 的文字层，返回至多 30 处命中。',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: { query: { type: 'string', minLength: 1, maxLength: 200 } },
    },
  },
  {
    name: 'goto_page',
    description: '在画布中跳转到指定页面，不修改 PDF 内容。页号从 1 开始。',
    inputSchema: {
      type: 'object',
      required: ['page'],
      properties: { page: { type: 'integer', minimum: 1 } },
    },
  },
  {
    name: 'insert_text',
    description:
      '在当前未保存 PDF 的指定页面插入可搜索的文字。page 从 1 开始；x/y 是页面显示方向左上角起算的 pt 坐标，必须显式提供。只能插入新文字，不能替换已有文字。',
    inputSchema: {
      type: 'object',
      required: ['page', 'text', 'x', 'y'],
      properties: {
        page: { type: 'integer', minimum: 1 },
        text: { type: 'string', minLength: 1, maxLength: 10000 },
        x: { type: 'number', minimum: 0 },
        y: { type: 'number', minimum: 0 },
        font_size: { type: 'number', exclusiveMinimum: 0, maximum: 500 },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      },
    },
  },
  {
    name: 'list_inserted_text',
    description: '列出本次尚未保存的插入文字及其 id、页号、显示坐标、内容和字号。保存后不再列出。',
    inputSchema: { type: 'object', properties: { page: { type: 'integer', minimum: 1 } } },
  },
  {
    name: 'edit_inserted_text',
    description:
      '修改尚未保存的插入文字。先用 list_inserted_text 取得 id；当前支持文字、字号和颜色。',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        text: { type: 'string', minLength: 1, maxLength: 10000 },
        font_size: { type: 'number', exclusiveMinimum: 0, maximum: 500 },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      },
    },
  },
  {
    name: 'move_inserted_text',
    description: '移动尚未保存的插入文字。x/y 为显示页面左上角的绝对 pt 坐标，或用 dx/dy 位移。',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        x: { type: 'number', minimum: 0 },
        y: { type: 'number', minimum: 0 },
        dx: { type: 'number' },
        dy: { type: 'number' },
      },
    },
  },
  {
    name: 'delete_inserted_text',
    description: '删除尚未保存的插入文字。先用 list_inserted_text 取得 id。',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
  },
  {
    name: 'apply_ops',
    description:
      '修改当前未保存 PDF 的页结构。当前仅支持 rotatePages（pages: 页号数组, dir: 90|-90|180）、deletePage（page: 页号）、setPageOrder（order: 全部页号数组）。批注、图片和表单编辑尚未开放。',
    inputSchema: {
      type: 'object',
      required: ['ops'],
      properties: { ops: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object' } } },
    },
  },
].map((tool) =>
  Object.assign(tool, { outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA }),
) as unknown as NonNullable<ModelCallOptions['tools']>

export function pdfAgentCatalog(): DocumentAgentCatalog {
  let textInsertReady = true
  try {
    pdfAgentAssetPaths()
  } catch {
    textInsertReady = false
  }
  const availableTools = textInsertReady
    ? tools
    : tools.filter(
        (tool) =>
          ![
            'insert_text',
            'list_inserted_text',
            'edit_inserted_text',
            'move_inserted_text',
            'delete_inserted_text',
          ].includes(tool.name),
      )
  return {
    format: 'pdf',
    systemPrompt:
      '你是 Mimir 的 PDF 编辑助手。先读取当前画布。只使用工具描述中已接入的页面操作和插入文字生命周期工具；已有文字修改、批注、图片和表单编辑尚未开放。插入文字在保存或页结构操作后不再是待编辑对象。失败、取消或版本冲突时不得声称已修改。改动只更新画布，用户手动保存。',
    tools: availableTools,
    clientToolNames: new Set([
      'read_pages',
      'search_text',
      'goto_page',
      ...(textInsertReady
        ? [
            'insert_text',
            'list_inserted_text',
            'edit_inserted_text',
            'move_inserted_text',
            'delete_inserted_text',
          ]
        : []),
      'apply_ops',
    ]),
    unavailableTools: textInsertReady
      ? []
      : [
          'insert_text',
          'list_inserted_text',
          'edit_inserted_text',
          'move_inserted_text',
          'delete_inserted_text',
        ].map((name) => ({ name, reason: 'PDF 编辑资源缺失：PDFium 或 HarfBuzz WASM 未打包' })),
  }
}
