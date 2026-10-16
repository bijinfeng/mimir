/**
 * Markdown slash commands adapted from GenOffice
 * genspark-ai/genoffice@480548fd55f1be3593ee0d8e316a734751d58309
 * apps/markdown/src/renderer/editor/slashCommand.ts (Apache-2.0).
 * Only commands backed by Mimir's live Markdown schema are offered.
 */
import { Extension, type Editor, type Range } from '@tiptap/core'
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion'
import { uiOp, type MdOp } from '../agent/markdown-ops.js'
import { hasCommand } from '../shell/editor-commands.js'

export interface MarkdownSlashItem {
  id: string
  label: string
  keywords: string[]
  op?: MdOp
  node: string
}

export interface MarkdownSlashState {
  items: MarkdownSlashItem[]
  rect: DOMRect | null
  command: (item: MarkdownSlashItem) => void
}

export interface MarkdownSlashController {
  open(state: MarkdownSlashState): void
  update(state: MarkdownSlashState): void
  keyDown(event: KeyboardEvent): boolean
  close(): void
}

/** Shared by the ribbon and slash menu so both insert the same dialect node. */
export const INSERT_MATH_BLOCK: MdOp = {
  op: 'insertContent',
  after: 'selection',
  markdown: '$$\nx^2 + y^2 = z^2\n$$',
}

const ITEMS: MarkdownSlashItem[] = [
  {
    id: 'paragraph',
    label: '正文',
    keywords: ['text', 'p'],
    node: 'paragraph',
    op: { op: 'setBlockType', target: 'selection', type: 'paragraph' },
  },
  {
    id: 'h1',
    label: '标题 1',
    keywords: ['heading', '#'],
    node: 'heading',
    op: { op: 'setBlockType', target: 'selection', type: 'heading', level: 1 },
  },
  {
    id: 'h2',
    label: '标题 2',
    keywords: ['heading', '##'],
    node: 'heading',
    op: { op: 'setBlockType', target: 'selection', type: 'heading', level: 2 },
  },
  {
    id: 'h3',
    label: '标题 3',
    keywords: ['heading', '###'],
    node: 'heading',
    op: { op: 'setBlockType', target: 'selection', type: 'heading', level: 3 },
  },
  {
    id: 'bullet',
    label: '项目符号列表',
    keywords: ['list', 'ul'],
    node: 'bulletList',
    op: { op: 'toggleList', target: 'selection', list: 'bullet' },
  },
  {
    id: 'ordered',
    label: '编号列表',
    keywords: ['list', 'ol'],
    node: 'orderedList',
    op: { op: 'toggleList', target: 'selection', list: 'ordered' },
  },
  {
    id: 'task',
    label: '任务列表',
    keywords: ['todo', 'checkbox'],
    node: 'taskList',
    op: { op: 'toggleList', target: 'selection', list: 'task' },
  },
  {
    id: 'quote',
    label: '引用',
    keywords: ['blockquote'],
    node: 'blockquote',
    op: { op: 'setBlockType', target: 'selection', type: 'blockquote' },
  },
  {
    id: 'code',
    label: '代码块',
    keywords: ['codeblock'],
    node: 'codeBlock',
    op: { op: 'setBlockType', target: 'selection', type: 'codeBlock' },
  },
  {
    id: 'table',
    label: '表格',
    keywords: ['grid'],
    node: 'table',
    op: { op: 'insertTable', after: 'selection' },
  },
  {
    id: 'hr',
    label: '分隔线',
    keywords: ['divider', 'rule'],
    node: 'horizontalRule',
    op: { op: 'insertHorizontalRule', after: 'selection' },
  },
  {
    id: 'math',
    label: '数学公式',
    keywords: ['math', 'latex', 'formula', '公式'],
    node: 'mathBlock',
    op: INSERT_MATH_BLOCK,
  },
  {
    id: 'image',
    label: '图片',
    keywords: ['image', 'upload', '插入图片'],
    node: 'image',
  },
]

export function markdownSlashItems(
  editor: Editor,
  query: string,
  imageUploadEnabled = false,
): MarkdownSlashItem[] {
  const normalized = query.trim().toLowerCase()
  return ITEMS.filter(
    (item) =>
      editor.schema.nodes[item.node] &&
      (item.id !== 'image' || (imageUploadEnabled && hasCommand(editor, 'setImage'))) &&
      (!normalized ||
        item.id.includes(normalized) ||
        item.label.includes(normalized) ||
        item.keywords.some((keyword) => keyword.includes(normalized))),
  )
}

function runSlashItem(
  editor: Editor,
  range: Range,
  item: MarkdownSlashItem,
  onImageRequest: ((editor: Editor, range: Range) => void) | null,
): void {
  if (item.id === 'image') {
    // Keep /query intact until a file is chosen. Cancel must not edit the note.
    onImageRequest?.(editor, range)
    return
  }
  if (!item.op) return
  // Delete /query before targeting the current block, matching GenOffice.
  editor.chain().focus().deleteRange(range).run()
  uiOp(editor, item.op)
}

function toSlashState(props: SuggestionProps<MarkdownSlashItem>): MarkdownSlashState {
  return {
    items: props.items,
    rect: props.clientRect?.() ?? null,
    command: (item) => props.command(item),
  }
}

export const MarkdownSlash = Extension.create<{
  controller: MarkdownSlashController
  imageUploadEnabled: () => boolean
  onImageRequest: ((editor: Editor, range: Range) => void) | null
}>({
  name: 'mimirMarkdownSlash',
  addOptions() {
    return {
      controller: { open() {}, update() {}, keyDown: () => false, close() {} },
      imageUploadEnabled: () => false,
      onImageRequest: null,
    }
  },
  addProseMirrorPlugins() {
    return [
      Suggestion<MarkdownSlashItem>({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        command: ({ editor, range, props }) =>
          runSlashItem(editor, range, props, this.options.onImageRequest),
        items: ({ query }) =>
          markdownSlashItems(this.editor, query, this.options.imageUploadEnabled()),
        render: () => ({
          onStart: (props) => this.options.controller.open(toSlashState(props)),
          onUpdate: (props) => this.options.controller.update(toSlashState(props)),
          onKeyDown: ({ event }) => this.options.controller.keyDown(event),
          onExit: () => this.options.controller.close(),
        }),
      }),
    ]
  },
})
