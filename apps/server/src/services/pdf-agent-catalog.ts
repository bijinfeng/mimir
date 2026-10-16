import { DOCX_CLIENT_TOOL_OUTPUT_SCHEMA, DOCX_CREATE_TOOLS } from '@mimir/shared'
import type { DocumentAgentCatalog } from './document-agent-catalog.js'
import type { ModelCallOptions } from './model.js'
import { pdfLocalTools } from './pdf-local-catalog.js'
import { pdfImageTools } from './pdf-image-catalog.js'
import { pdfAgentAssetPaths } from './pdf-agent-host.js'

const contentToolNames = [
  ...pdfImageTools.map((tool) => tool.name),
  'edit_text',
  'markup_text',
  'read_annotations',
  'add_note',
  'reply_note',
  'edit_note',
  'delete_note',
  'delete_markup',
]
const page = { type: 'integer', minimum: 1 }
const text = { type: 'string', minLength: 1, maxLength: 10000 }
const pdfCreateTools = [
  {
    ...DOCX_CREATE_TOOLS[0],
    description: DOCX_CREATE_TOOLS[0].description.replace('defaults to docx', 'defaults to pdf'),
  },
]
const contentTools = [
  {
    name: 'edit_text',
    description:
      '替换或删除页面中唯一的完整原文文字项。先 read_pages；部分文字、重复文字或含未知 Catalog 结构的文件会拒绝。new_text 为空字符串会删除原文，不重排页面。先保存页面或插字改动。',
    inputSchema: {
      type: 'object',
      required: ['page', 'old_text', 'new_text'],
      properties: {
        page,
        old_text: text,
        new_text: { type: 'string', maxLength: 10000 },
        font_size: { type: 'number', exclusiveMinimum: 0, maximum: 500 },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        font: { type: 'string', enum: ['arial', 'times', 'courier'] },
        bold: { type: 'boolean' },
        italic: { type: 'boolean' },
      },
    },
  },
  {
    name: 'markup_text',
    description:
      '为页面中唯一完整的文字项添加高亮、下划线或删除线批注；部分或重复原文会拒绝。先保存页面或插字改动。',
    inputSchema: {
      type: 'object',
      required: ['page', 'text', 'type'],
      properties: {
        page,
        text,
        type: { type: 'string', enum: ['highlight', 'underline', 'strikeout'] },
      },
    },
  },
  {
    name: 'read_annotations',
    description:
      '读取当前 PDF 已保存和未保存的便笺、回复及文字标注；返回稳定 id、页号、作者、内容与 parentId。',
    inputSchema: { type: 'object', properties: { start: page, end: page } },
  },
  {
    name: 'add_note',
    description:
      '添加便笺。page 从 1 开始。提供显示页面左上角起算的 x/y（pt），或唯一完整原文 anchor_text；两者不能混用。',
    inputSchema: {
      type: 'object',
      required: ['page', 'text'],
      properties: {
        page,
        text,
        anchor_text: text,
        x: { type: 'number', minimum: 0 },
        y: { type: 'number', minimum: 0 },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      },
    },
  },
  ...['reply_note', 'edit_note', 'delete_note'].map((name) => ({
    name,
    description:
      name === 'reply_note'
        ? '回复便笺根批注；使用 read_annotations 的根 note_id。'
        : name === 'edit_note'
          ? '替换便笺或回复内容，保留作者和线程；只修改用户要求修改的批注。'
          : '删除便笺根批注及其回复；只删除用户要求删除的线程。',
    inputSchema: {
      type: 'object',
      required: name === 'delete_note' ? ['page', 'note_id'] : ['page', 'note_id', 'text'],
      properties: {
        page,
        note_id: { type: 'string' },
        ...(name === 'delete_note' ? {} : { text }),
      },
    },
  })),
  {
    name: 'delete_markup',
    description:
      '删除文字标注。先 read_annotations；markup_ids 指定 id，省略则删除本页所有标注；type 可限定种类。',
    inputSchema: {
      type: 'object',
      required: ['page'],
      properties: {
        page,
        markup_ids: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string' } },
        type: { type: 'string', enum: ['highlight', 'underline', 'strikeout'] },
      },
    },
  },
]

const tools = [
  ...pdfCreateTools,
  ...pdfLocalTools,
  {
    name: 'list_form_fields',
    description:
      '读取当前 PDF 交互表单字段全名、类型、当前值、选项、只读/必填及控件页号位置。填写前先读取；普通表单可保留原生书签，签名/XFA/活动动作和未知结构仍拒绝写入。',
    inputSchema: { type: 'object', properties: {} },
  },
  ...contentTools,
  ...pdfImageTools,
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
      '修改当前未保存 PDF 的页结构。当前支持 setMetadata（metadata:{title?,author?,subject?,keywords?}）及 rotatePages（pages: 页号数组, dir: 90|-90|180）、deletePage（page: 页号）、setPageOrder（order: 全部页号数组）。交互表单支持 setFormValue（value:{name,value?,checked?}），须先 list_form_fields；勾选框仅 checked，其他字段仅 value，空字符串清除。可与三类页面操作原子混批，不能删除含字段控件的页面。dry_run 只预检。批注请使用专用工具；图片使用专用工具。',
    inputSchema: {
      type: 'object',
      required: ['ops'],
      properties: {
        dry_run: { type: 'boolean' },
        ops: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: {
            oneOf: [
              {
                type: 'object',
                required: ['op', 'metadata'],
                properties: {
                  op: { const: 'setMetadata' },
                  metadata: {
                    type: 'object',
                    properties: { title: text, author: text, subject: text, keywords: text },
                    additionalProperties: false,
                  },
                },
              },
              {
                type: 'object',
                required: ['op', 'value'],
                properties: {
                  op: { const: 'setFormValue' },
                  value: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                      name: { type: 'string', minLength: 1 },
                      value: { type: 'string', maxLength: 10000 },
                      checked: { type: 'boolean' },
                    },
                  },
                },
              },
              {
                type: 'object',
                required: ['op', 'pages', 'dir'],
                properties: {
                  op: { const: 'rotatePages' },
                  pages: { type: 'array', minItems: 1, items: page },
                  dir: { type: 'integer', enum: [90, -90, 180] },
                },
              },
              {
                type: 'object',
                required: ['op', 'page'],
                properties: { op: { const: 'deletePage' }, page },
              },
              {
                type: 'object',
                required: ['op', 'order'],
                properties: {
                  op: { const: 'setPageOrder' },
                  order: { type: 'array', minItems: 1, items: page },
                },
              },
            ],
          },
        },
      },
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
            ...contentToolNames,
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
      '你是 Mimir 的 PDF 编辑助手。先读取当前画布。只使用工具描述中已接入的页面、文字和批注工具；已有文字仅支持唯一完整文字项；便笺、回复和文字标注使用持久化批注 id。表单先 list_form_fields 后用 apply_ops setFormValue，字段类型由宿主核验。图片先list_page_images后使用专用工具；URL仅支持PNG/JPEG，模型不能使用本地路径。插入文字在保存或页结构操作后不再是待编辑对象。失败、取消或版本冲突时不得声称已修改。改动只更新画布，用户手动保存。',
    tools: availableTools,
    clientToolNames: new Set([
      'read_pages',
      'search_text',
      'goto_page',
      ...(textInsertReady
        ? [
            ...contentToolNames,
            'insert_text',
            'list_inserted_text',
            'edit_inserted_text',
            'move_inserted_text',
            'delete_inserted_text',
          ]
        : []),
      'apply_ops',
      'list_form_fields',
      'create_document',
      ...pdfLocalTools.map((tool) => tool.name),
    ]),
    unavailableTools: textInsertReady
      ? []
      : [
          ...contentToolNames,
          'insert_text',
          'list_inserted_text',
          'edit_inserted_text',
          'move_inserted_text',
          'delete_inserted_text',
        ].map((name) => ({ name, reason: 'PDF 编辑资源缺失：PDFium 或 HarfBuzz WASM 未打包' })),
  }
}
