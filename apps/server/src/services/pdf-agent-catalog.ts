import { DOCX_CLIENT_TOOL_OUTPUT_SCHEMA, DOCX_CREATE_TOOLS } from '@mimir/shared'
import type { DocumentAgentCatalog } from './document-agent-catalog.js'
import type { ModelCallOptions } from './model.js'
import { pdfLocalTools } from './pdf-local-catalog.js'
import { pdfImageTools } from './pdf-image-catalog.js'
import { pdfAgentAssetPaths } from './pdf-agent-host.js'

const contentToolNames = [
  ...pdfImageTools.map((tool) => tool.name),
  'list_text_blocks',
  'move_text_block',
  'edit_block',
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
    name: 'list_text_blocks',
    description:
      '读取当前原件一页的真实段落、位置（pt）、可移动/改写状态、参考字号/行距/对齐与拒绝原因。仅可核验完整顶层文字集合可写；先保存待生效页面或插字改动。',
    inputSchema: { type: 'object', required: ['page'], properties: { page } },
  },
  {
    name: 'move_text_block',
    description:
      '整体移动包含唯一 paragraph_text 片段的原文段落。先 list_text_blocks；dx/dy 为当前页面显示方向向右/向下的pt偏移，包含Rotate/CropBox。保留原字体字形和其他对象，不重排或覆盖绘制；AcroForm、未知Catalog、跨段对象及裁切内容流拒绝。',
    inputSchema: {
      type: 'object',
      required: ['page', 'paragraph_text', 'dx', 'dy'],
      properties: {
        page,
        paragraph_text: text,
        dx: { type: 'number', minimum: -14400, maximum: 14400 },
        dy: { type: 'number', minimum: -14400, maximum: 14400 },
      },
    },
  },
  {
    name: 'edit_block',
    description:
      '重写由唯一paragraph_text片段定位的完整原文段落；使用实际写入字体的字宽在原段宽内换行，长度增长向下展开，不推动其他内容。new_text为空真实删除原文对象。先list_text_blocks；仅canRewrite段可用，Form/clip/AcroForm/未知Catalog拒绝。',
    inputSchema: {
      type: 'object',
      required: ['page', 'paragraph_text', 'new_text'],
      properties: {
        page,
        paragraph_text: text,
        new_text: { type: 'string', maxLength: 10000 },
        font_size: { type: 'number', exclusiveMinimum: 0, maximum: 500 },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        font: { type: 'string', enum: ['arial', 'times', 'courier'] },
        bold: {
          type: 'boolean',
          description:
            'true应用粗体，false真实取消，省略保留；普通字面不可核验时拒绝，可明确font后重试',
        },
        italic: {
          type: 'boolean',
          description:
            'true应用斜体，false真实取消，省略保留；普通字面不可核验时拒绝，可明确font后重试',
        },
        align: { type: 'string', enum: ['left', 'center', 'right'] },
      },
    },
  },
  {
    name: 'edit_text',
    description:
      '替换或删除页面原文的一次匹配；old_text可为部分原文，occurrence从1起指定页面阅读顺序中的第几次，默认1。只重写触及的原生文字容器，保留周边与非目标文字位置，不自动重排整段；整段重排用edit_block。先list_text_blocks核对原文；Form/clip/AcroForm/未知Catalog拒绝。',
    inputSchema: {
      type: 'object',
      required: ['page', 'old_text', 'new_text'],
      properties: {
        page,
        old_text: text,
        occurrence: { type: 'integer', minimum: 1, maximum: 10000 },
        new_text: { type: 'string', maxLength: 10000 },
        font_size: { type: 'number', exclusiveMinimum: 0, maximum: 500 },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        font: { type: 'string', enum: ['arial', 'times', 'courier'] },
        bold: {
          type: 'boolean',
          description:
            'true应用粗体，false真实取消，省略保留；普通字面不可核验时拒绝，可明确font后重试',
        },
        italic: {
          type: 'boolean',
          description:
            'true应用斜体，false真实取消，省略保留；普通字面不可核验时拒绝，可明确font后重试',
        },
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
      '修改当前未保存 PDF 的页结构。当前支持 setMetadata（metadata:{title?,author?,subject?,keywords?}）及 rotatePages（pages: 页号数组, dir: 90|-90|180）、deletePage（page: 页号）、setPageOrder（order: 全部页号数组）。交互表单支持 setFormValue（value:{name,value?,checked?}），须先 list_form_fields；勾选框仅 checked，其他字段仅 value，空字符串清除。可与三类页面操作原子混批，不能删除含字段控件的页面。removeMarkup({id})删除read_annotations的单条文字标注，setNoteContents({id,contents})改便笺或回复；使用当前真实批注id，不使用P前缀。removeTextInsert({id})删除list_inserted_text的当前T标识；整批先删除指定T再执行原生操作。无页面操作保留幸存T可继续编辑，有页面操作幸存字随页面物化且T失效。旧R对象标识与待保存插字混用须先保存并重读。dry_run完成真实校验但不发布。未知键/错误类型/重复删除整批拒绝。图片使用专用工具。',
    inputSchema: {
      type: 'object',
      required: ['ops'],
      additionalProperties: false,
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
                required: ['op', 'id'],
                additionalProperties: false,
                properties: {
                  op: { const: 'removeMarkup' },
                  id: { type: 'string', minLength: 1, maxLength: 200 },
                },
              },
              {
                type: 'object',
                required: ['op', 'id', 'contents'],
                additionalProperties: false,
                properties: {
                  op: { const: 'setNoteContents' },
                  id: { type: 'string', minLength: 1, maxLength: 200 },
                  contents: { type: 'string', minLength: 1, maxLength: 10000 },
                },
              },
              {
                type: 'object',
                required: ['op', 'id'],
                additionalProperties: false,
                properties: {
                  op: { const: 'removeTextInsert' },
                  id: { type: 'string', pattern: '^T[a-zA-Z0-9-]{1,80}$' },
                },
              },

              {
                type: 'object',
                required: ['op', 'metadata'],
                additionalProperties: false,
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
                additionalProperties: false,
                properties: {
                  op: { const: 'setFormValue' },
                  value: {
                    type: 'object',
                    required: ['name'],
                    additionalProperties: false,
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
                additionalProperties: false,
                properties: {
                  op: { const: 'rotatePages' },
                  pages: { type: 'array', minItems: 1, items: page },
                  dir: { type: 'integer', enum: [90, -90, 180] },
                },
              },
              {
                type: 'object',
                required: ['op', 'page'],
                additionalProperties: false,
                properties: { op: { const: 'deletePage' }, page },
              },
              {
                type: 'object',
                required: ['op', 'order'],
                additionalProperties: false,
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
      '你是 Mimir 的 PDF 编辑助手。先读取当前画布和list_text_blocks：move_text_block整体移动原文；edit_block用唯一paragraph_text重写整段并按原宽重排、向下增长、不推动其他内容；edit_text用old_text及1起occurrence替换部分或重复原文，按页面阅读顺序计数且不重排整段。空new_text真实删除对应原文。仅可核验完整目标可写，Form、clip、AcroForm及未知Catalog拒绝；模型不得传内部target绕过定位。粗斜体false需真实普通字面可核验，不能以保留冒称取消。便笺、回复和文字标注使用持久化批注id。表单先list_form_fields后用apply_ops setFormValue，字段类型由宿主核验。图片先list_page_images后使用专用工具；URL仅支持PNG/JPEG，模型不能使用本地路径。插入文字在保存或页结构操作后不再是待编辑对象。失败、取消或版本冲突时不得声称已修改。改动只更新画布，用户手动保存。',
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
