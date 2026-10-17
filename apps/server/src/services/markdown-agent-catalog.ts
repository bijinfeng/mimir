import { agentImageAspectRatioSchema } from '@mimir/shared'
import { z } from 'zod'
import { DOCX_CLIENT_TOOL_OUTPUT_SCHEMA } from '@mimir/shared'
import type { ModelCallOptions } from './model.js'
import type { DocumentAgentCatalog } from './document-agent-catalog.js'
import { braveImageSearch, braveSearchReady } from './docx-brave-search.js'
import { docxImageReady } from './docx-image-generation.js'

const MARKDOWN_OP_GUIDE = `Every item in ops MUST contain the literal "op" discriminator and the fields for that operation. Example: {"ops":[{"op":"insertContent","after":-1,"markdown":"New paragraph"}]}. Never put the operation name in "type" or omit "op".
Targets use "selection" or {"start":0,"end":0} with inclusive 0-based top-level block indexes. Anchors use "selection" or a block index (-1 means start). Indexes in one batch refer to the document before that batch. Ops stop at first failure; earlier successful ops may remain.
Required fields by op: insertContent {op, after, markdown}; replaceBlocks {op, target, markdown}; deleteBlocks {op, target}; replaceText {op, target, find, replace};
setStyle {op, target, style: bold|italic|strike|code, find?, mode?: apply|remove|toggle}; setLink {op, target, href: string|null, find?};
setBlockType {op, target, type: paragraph|heading|blockquote|codeBlock, level?: 1-6 required for heading, language?: string for codeBlock};
toggleList {op, target, list: bullet|ordered|task}; moveBlocks {op, target, after: index}; duplicateBlocks {op, target};
insertTable {op, after, rows?: 1-100, cols?: 1-30, headerRow?: boolean}; insertHorizontalRule {op, after};
insertImage {op, after, src: existing Mimir uploaded image URL, alt?}; use insert_image for remote images;
editTable {op, target, action: addRowBefore|addRowAfter|deleteRow|addColumnBefore|addColumnAfter|deleteColumn|toggleHeaderRow|deleteTable, row?, col?};
setFrontmatter {op, yaml: inner YAML without fences}; Mimir indexes title, tags, status and folder, preserves additional YAML keys in the vault, and reserves id/createdAt/updatedAt. This op must be alone in its batch.`

const MARKDOWN_OP_NAMES = [
  'insertContent',
  'replaceBlocks',
  'deleteBlocks',
  'replaceText',
  'setStyle',
  'setLink',
  'setBlockType',
  'toggleList',
  'moveBlocks',
  'duplicateBlocks',
  'insertTable',
  'insertHorizontalRule',
  'insertImage',
  'editTable',
  'setFrontmatter',
] as const

const WRITE_TOOLS = [
  {
    name: 'apply_ops',
    description: `Edit the current Markdown note using validated GenOffice operations. Call get_document_context after structural changes.\n${MARKDOWN_OP_GUIDE}`,
    inputSchema: {
      type: 'object',
      properties: {
        ops: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['op'],
            properties: {
              op: { type: 'string', enum: MARKDOWN_OP_NAMES },
              after: {
                type: ['integer', 'string'],
                description:
                  'Required for insertContent, insertTable, insertHorizontalRule and insertImage. Integer >= -1 or "selection".',
              },
              target: {
                type: ['object', 'string'],
                description:
                  'Required for block edits. "selection" or {start,end?} inclusive 0-based block indexes.',
              },
              markdown: {
                type: 'string',
                description:
                  'Required for insertContent and replaceBlocks; Markdown to insert or replace.',
              },
              find: { type: 'string' },
              replace: { type: 'string' },
              style: { type: 'string', enum: ['bold', 'italic', 'strike', 'code'] },
              mode: { type: 'string', enum: ['apply', 'remove', 'toggle'] },
              href: { type: ['string', 'null'] },
              type: { type: 'string', enum: ['paragraph', 'heading', 'blockquote', 'codeBlock'] },
              level: { type: 'integer', minimum: 1, maximum: 6 },
              language: { type: 'string' },
              list: { type: 'string', enum: ['bullet', 'ordered', 'task'] },
              rows: { type: 'integer', minimum: 1, maximum: 100 },
              cols: { type: 'integer', minimum: 1, maximum: 30 },
              headerRow: { type: 'boolean' },
              src: { type: 'string' },
              alt: { type: 'string' },
              action: {
                type: 'string',
                enum: [
                  'addRowBefore',
                  'addRowAfter',
                  'deleteRow',
                  'addColumnBefore',
                  'addColumnAfter',
                  'deleteColumn',
                  'toggleHeaderRow',
                  'deleteTable',
                ],
              },
              row: { type: 'integer', minimum: 0 },
              col: { type: 'integer', minimum: 0 },
              yaml: { type: 'string' },
            },
          },
          description:
            'Nonempty list of named Markdown operations. Each item requires op; other required fields depend on op as documented above.',
        },
      },
      required: ['ops'],
    },
  },
  {
    name: 'write_document',
    description:
      'Write a long Markdown article or chapter from a detailed plan; appends after a block, or replaces the whole note only with replaceDocument=true.',
    inputSchema: {
      type: 'object',
      properties: {
        plan: { type: 'string' },
        title: { type: 'string' },
        context: { type: 'string' },
        afterIndex: { type: 'integer' },
        replaceDocument: { type: 'boolean' },
      },
      required: ['plan'],
    },
  },
  {
    name: 'insert_image',
    description: 'Safely fetch and upload an HTTP image, then insert it in the current note.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        afterIndex: { type: 'integer' },
        alt: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate an image from a prompt, upload it, and insert it in the current note.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        aspectRatio: z.toJSONSchema(agentImageAspectRatioSchema),
        afterIndex: { type: 'integer' },
        alt: { type: 'string' },
      },
      required: ['prompt'],
    },
  },
] as const
const READ_TOOLS = [
  {
    name: 'get_document_context',
    description: 'Read the current unsaved Markdown note block outline and frozen selection.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_blocks',
    description: 'Read a range of top-level Markdown blocks.',
    inputSchema: {
      type: 'object',
      properties: {
        startIndex: { type: 'integer' },
        endIndex: { type: 'integer' },
        offset: { type: 'integer' },
      },
      required: ['startIndex', 'endIndex'],
    },
  },
  {
    name: 'read_frontmatter',
    description: 'Read the YAML frontmatter at the top of the current note.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
] as const

/** Registered only after the live note executor exists. Service dependent tools stay hidden when unconfigured. */
export async function markdownAgentCatalog(): Promise<DocumentAgentCatalog> {
  const imageReady = await docxImageReady()
  const searchReady = await braveSearchReady()
  const client = [
    ...READ_TOOLS,
    ...WRITE_TOOLS.filter((tool) => tool.name !== 'generate_image' || imageReady),
  ]
  const tools = [
    ...client.map((tool) => ({ ...tool, outputSchema: DOCX_CLIENT_TOOL_OUTPUT_SCHEMA })),
    ...(searchReady
      ? [
          {
            name: 'image_search',
            description: 'Search for images; use an imageUrl from results with insert_image.',
            inputSchema: {
              type: 'object',
              properties: { query: { type: 'string' }, maxResults: { type: 'integer' } },
              required: ['query'],
            },
            execute: braveImageSearch,
          },
        ]
      : []),
  ] as unknown as NonNullable<ModelCallOptions['tools']>
  return {
    format: 'markdown',
    systemPrompt: `你是 Mimir 的 Markdown 笔记编辑助手。只能编辑当前打开的笔记。先读当前未保存画布和冻结选区，使用工具真实结果判断是否已修改。块索引从 0 开始；结构操作后重新读取上下文。不得绕过工具直接声称修改。编辑在画布上生效，保存沿用笔记的自动保存流程。`,
    tools,
    clientToolNames: new Set(client.map((tool) => tool.name)),
  }
}
