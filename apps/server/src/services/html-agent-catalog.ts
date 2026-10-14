import { DOCX_CLIENT_TOOL_OUTPUT_SCHEMA } from '@mimir/shared'
import type { DocumentAgentCatalog } from './document-agent-catalog.js'
import type { ModelCallOptions } from './model.js'

const tools = [
  {
    name: 'get_outline',
    description:
      'Read the live HTML element outline with line numbers and stable sid values. Use before editing; narrow large documents with from_sid.',
    inputSchema: {
      type: 'object',
      properties: { depth: { type: 'integer' }, from_sid: { type: 'integer' } },
    },
  },
  {
    name: 'read_source',
    description:
      'Read the live unsaved HTML source by sid or line range. Use page for long results.',
    inputSchema: {
      type: 'object',
      properties: {
        sid: { type: 'integer' },
        start_line: { type: 'integer' },
        end_line: { type: 'integer' },
        page: { type: 'integer' },
      },
    },
  },
  {
    name: 'apply_ops',
    description:
      'Atomically edit the live HTML source. Operations: str_replace, replace_element, set_inner_html, set_text, insert_html, remove, move, set_attr, set_style, set_tag, set_text_node, wrap_text, unwrap. All operations use one source version; any error rejects the whole batch.',
    inputSchema: {
      type: 'object',
      required: ['ops'],
      properties: {
        ops: {
          type: 'array',
          minItems: 1,
          maxItems: 40,
          items: {
            type: 'object',
            required: ['op'],
            properties: {
              op: {
                type: 'string',
                enum: [
                  'str_replace',
                  'replace_element',
                  'set_inner_html',
                  'set_text',
                  'insert_html',
                  'remove',
                  'move',
                  'set_attr',
                  'set_style',
                  'set_tag',
                  'set_text_node',
                  'wrap_text',
                  'unwrap',
                ],
              },
              sid: { type: 'integer' },
              ref_sid: { type: 'integer' },
              old: { type: 'string' },
              new: { type: 'string' },
              replace_all: { type: 'boolean' },
              html: { type: 'string' },
              text: { type: 'string' },
              position: { type: 'string', enum: ['before', 'after', 'prepend', 'append'] },
              name: { type: 'string' },
              value: { type: ['string', 'null'] },
              styles: { type: 'object', additionalProperties: { type: ['string', 'null'] } },
              tag: { type: 'string' },
              index: { type: 'integer' },
              start: { type: 'integer' },
              end: { type: 'integer' },
              attrs: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
        },
        summary: { type: 'string' },
      },
    },
  },
  {
    name: 'ask_clarification',
    description:
      'Show the user up to four concrete page choices and wait for their answers. Skip when their request already specifies the choices.',
    inputSchema: {
      type: 'object',
      required: ['questions'],
      properties: {
        questions: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            required: ['id', 'label', 'options'],
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              description: { type: 'string' },
              options: { type: 'array', maxItems: 5, items: { type: 'string' } },
              multi: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
  {
    name: 'plan_page',
    description:
      'Draft a page brief, show it for user edits and confirmation, then generate a complete HTML page for new/redesign mode. Restyle/extract returns the confirmed brief without rewriting the page. Pass the user request in instruction so the separate writer has its needed context.',
    inputSchema: {
      type: 'object',
      required: ['mode', 'instruction'],
      properties: {
        mode: { type: 'string', enum: ['new', 'redesign', 'restyle', 'extract'] },
        instruction: { type: 'string' },
        notes: { type: 'string' },
      },
    },
  },
  {
    name: 'write_document',
    description:
      'Write a complete single-column HTML document from a content plan. The writer uses the configured chat model; incomplete output never changes the canvas.',
    inputSchema: {
      type: 'object',
      required: ['plan'],
      properties: {
        title: { type: 'string' },
        plan: { type: 'string' },
        context: { type: 'string' },
      },
    },
  },
].map((tool) =>
  Object.assign(tool, { outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA }),
) as unknown as NonNullable<ModelCallOptions['tools']>

export function htmlAgentCatalog(): DocumentAgentCatalog {
  return {
    format: 'html',
    systemPrompt:
      '你是 Mimir 的 HTML 编辑助手。只能读取和编辑当前打开的 HTML 画布，画布可能有未保存的人工改动。先读取当前大纲或源码，再执行编辑。只按工具的真实结果报告；失败或取消时不能声称已修改。改动只更新画布，用户需手动保存。',
    tools,
    clientToolNames: new Set([
      'get_outline',
      'read_source',
      'apply_ops',
      'ask_clarification',
      'plan_page',
      'write_document',
    ]),
  }
}
