import { agentImageAspectRatioSchema } from './agent-media.js'
import { z } from 'zod'
/**
 * DOCX agent wire contract, pinned to GenOffice commit
 * 480548fd55f1be3593ee0d8e316a734751d58309.
 * Advertise only tools with a real Mimir executor.
 */
import { DOCX_OFFICE_TOOLS } from './docx-office-tools.js'
export { DOCX_OFFICE_TOOLS } from './docx-office-tools.js'
export const DOCX_CLIENT_TOOLS = [
  {
    name: 'get_document_context',
    description: 'Read the current document and selection before editing.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_blocks',
    description: 'Read blocks from the current live document.',
    inputSchema: {
      type: 'object',
      properties: {
        startBlockIndex: { type: 'integer' },
        endBlockIndex: { type: 'integer' },
        offset: { type: 'integer' },
      },
      required: ['startBlockIndex', 'endBlockIndex'],
    },
  },
  {
    name: 'insert_content',
    description: 'Insert HTML content into the current DOCX canvas.',
    inputSchema: {
      type: 'object',
      properties: { html: { type: 'string' }, afterBlockIndex: { type: 'integer' } },
      required: ['html'],
    },
  },
  {
    name: 'replace_blocks',
    description: 'Replace a range of document blocks with HTML content.',
    inputSchema: {
      type: 'object',
      properties: {
        startBlockIndex: { type: 'integer' },
        endBlockIndex: { type: 'integer' },
        html: { type: 'string' },
      },
      required: ['startBlockIndex', 'endBlockIndex', 'html'],
    },
  },
  {
    name: 'replace_selection',
    description: 'Replace the selection frozen when the user sent the instruction.',
    inputSchema: { type: 'object', properties: { html: { type: 'string' } }, required: ['html'] },
  },
] as const

/** Available only when the user's Brave Search subscription is configured. */
export const DOCX_BRAVE_TOOLS = [
  {
    name: 'web_search',
    description:
      'Search the web for current facts and references; returns titles, links and snippets.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, maxResults: { type: 'integer' } },
      required: ['query'],
    },
  },
  {
    name: 'image_search',
    description: 'Search for images; returns image URLs and their source pages.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, maxResults: { type: 'integer' } },
      required: ['query'],
    },
  },
] as const

/** Client inserts the returned image after server-side generation succeeds. */
export const DOCX_IMAGE_TOOLS = [
  {
    name: 'generate_image',
    description: 'Generate an image from a text prompt and insert it into the current DOCX.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        aspectRatio: z.toJSONSchema(agentImageAspectRatioSchema),
        afterBlockIndex: { type: 'integer' },
        maxWidthPx: { type: 'integer' },
      },
      required: ['prompt'],
    },
  },
] as const

/** Remote image URLs are converted by the browser via the guarded fetch endpoint. */
export const DOCX_INSERT_IMAGE_TOOLS = [
  {
    name: 'insert_image',
    description: 'Insert a remote PNG, JPEG, GIF, or WebP image into the current DOCX.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        afterBlockIndex: { type: 'integer' },
        maxWidthPx: { type: 'number' },
      },
      required: ['url'],
    },
  },
  {
    name: 'insert_picture',
    description: 'Insert a floating or inline picture into the current DOCX.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        width: { type: ['number', 'string'] },
        height: { type: ['number', 'string'] },
        float: {
          type: 'object',
          properties: {
            anchor: { type: 'string', enum: ['paragraph', 'page', 'margin'] },
            x: { type: ['number', 'string'] },
            y: { type: ['number', 'string'] },
            wrap: {
              type: 'string',
              enum: ['square', 'tight', 'topAndBottom', 'behind', 'inFront'],
            },
          },
          required: ['x', 'y'],
        },
        altText: { type: 'string' },
        afterBlockIndex: { type: 'integer' },
      },
      required: ['url'],
    },
  },
] as const

export const DOCX_WATERMARK_TOOLS = [
  {
    name: 'set_watermark',
    description:
      'Set or remove a text or picture watermark in the current DOCX. Pass image as an HTTP(S) URL; use null to clear.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: ['string', 'null'] },
        fontFamily: { type: 'string' },
        color: { type: 'string' },
        opacity: { type: 'number' },
        diagonal: { type: 'boolean' },
        bold: { type: 'boolean' },
        italic: { type: 'boolean' },
        image: { type: ['string', 'null'] },
        scale: { type: 'number' },
        washout: { type: 'boolean' },
      },
      required: [],
    },
  },
] as const

export const DOCX_WRITING_TOOLS = [
  {
    name: 'write_document',
    description: 'Write a long draft into the current DOCX while showing text as it is generated.',
    inputSchema: {
      type: 'object',
      properties: { instruction: { type: 'string' } },
      required: ['instruction'],
    },
  },
] as const

/** Media bytes come from an explicit browser file selection, never a model path. */
export const DOCX_MEDIA_TOOLS = [
  {
    name: 'analyze_media',
    description:
      'Ask the user to select an image, audio, or video and analyze it. Video is sampled to image frames in the browser.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: { type: 'string' },
        kind: { type: 'string', enum: ['image', 'audio', 'video'] },
      },
      required: ['instruction', 'kind'],
    },
  },
] as const

export const DOCX_CREATE_TOOLS = [
  {
    name: 'create_document',
    description:
      'Create a new file in the knowledge base without modifying the current document. DOCX/PDF content is simple HTML; md is Markdown source; html is a complete standalone HTML page. type defaults to docx.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        type: { type: 'string', enum: ['docx', 'pdf', 'md', 'html'] },
        format: {
          type: 'string',
          enum: ['docx', 'pdf', 'md', 'html'],
          description: 'Legacy alias for type.',
        },
        content: { type: 'string' },
      },
      required: ['title', 'content'],
    },
  },
] as const

/** One catalog for all local browser executors, shared by stream and capabilities. */
export const DOCX_LOCAL_TOOLS = [
  ...DOCX_CLIENT_TOOLS,
  ...DOCX_WRITING_TOOLS,
  ...DOCX_CREATE_TOOLS,
  ...DOCX_INSERT_IMAGE_TOOLS,
  ...DOCX_WATERMARK_TOOLS,
  ...DOCX_OFFICE_TOOLS,
] as const

/** Exactly the 36 top-level names at the pinned GenOffice commit. */
export const DOCX_ALL_TOOLS = [
  ...DOCX_LOCAL_TOOLS,
  ...DOCX_BRAVE_TOOLS,
  ...DOCX_IMAGE_TOOLS,
  ...DOCX_MEDIA_TOOLS,
] as const

/** Errors are resolved payloads so the model can report or recover from them. */
export const DOCX_CLIENT_TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    summary: { type: 'string' },
    changed: { type: 'boolean' },
    version: { type: 'integer' },
    error: { type: 'string' },
    data: {},
  },
  required: ['ok'],
} as const

export type DocxClientToolName =
  | (typeof DOCX_CLIENT_TOOLS)[number]['name']
  | (typeof DOCX_IMAGE_TOOLS)[number]['name']
  | (typeof DOCX_INSERT_IMAGE_TOOLS)[number]['name']
  | (typeof DOCX_WATERMARK_TOOLS)[number]['name']
  | (typeof DOCX_OFFICE_TOOLS)[number]['name']
  | (typeof DOCX_WRITING_TOOLS)[number]['name']
  | (typeof DOCX_MEDIA_TOOLS)[number]['name']
  | (typeof DOCX_CREATE_TOOLS)[number]['name']

export interface DocxAgentCapabilities {
  documentId: string
  modelReady: boolean
  mediaKinds?: Array<'image' | 'audio' | 'video'>
  availableTools: string[]
  unavailableTools: { name: string; reason: string }[]
}
