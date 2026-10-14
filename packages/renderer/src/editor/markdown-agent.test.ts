import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createMarkdownAgentHandle } from '@mimir/office'
import { createExtensions } from './extensions.js'

const opened: Editor[] = []
afterEach(() => {
  for (const editor of opened.splice(0)) editor.destroy()
})
function setup(markdown = 'Alpha\n\nBeta') {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: createExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
  opened.push(editor)
  let dirty = false
  const handle = createMarkdownAgentHandle(editor, 'note-1', {
    isDirty: () => dirty,
    onDirtyChange: (next) => {
      dirty = next
    },
  })
  return { editor, handle, getDirty: () => dirty }
}

describe('Markdown Agent on the live note canvas', () => {
  const operationCases: Array<{
    name: string
    body: string
    op: Record<string, unknown>
    contains: string
  }> = [
    {
      name: 'insertContent',
      body: 'Alpha',
      op: { op: 'insertContent', after: 0, markdown: 'Tail' },
      contains: 'Tail',
    },
    {
      name: 'replaceBlocks',
      body: 'Alpha',
      op: { op: 'replaceBlocks', target: { start: 0 }, markdown: 'Replaced' },
      contains: 'Replaced',
    },
    {
      name: 'deleteBlocks',
      body: 'Alpha\n\nBeta',
      op: { op: 'deleteBlocks', target: { start: 0 } },
      contains: 'Beta',
    },
    {
      name: 'replaceText',
      body: 'Alpha',
      op: { op: 'replaceText', target: { start: 0 }, find: 'Alpha', replace: 'Done' },
      contains: 'Done',
    },
    {
      name: 'setStyle',
      body: 'Alpha',
      op: { op: 'setStyle', target: { start: 0 }, style: 'bold', find: 'Alpha' },
      contains: '**Alpha**',
    },
    {
      name: 'setLink',
      body: 'Alpha',
      op: { op: 'setLink', target: { start: 0 }, href: 'https://example.com', find: 'Alpha' },
      contains: 'https://example.com',
    },
    {
      name: 'setBlockType',
      body: 'Alpha',
      op: { op: 'setBlockType', target: { start: 0 }, type: 'heading', level: 2 },
      contains: '## Alpha',
    },
    {
      name: 'toggleList',
      body: 'Alpha',
      op: { op: 'toggleList', target: { start: 0 }, list: 'bullet' },
      contains: '- Alpha',
    },
    {
      name: 'moveBlocks',
      body: 'Alpha\n\nBeta',
      op: { op: 'moveBlocks', target: { start: 0 }, after: 1 },
      contains: 'Beta\n\nAlpha',
    },
    {
      name: 'duplicateBlocks',
      body: 'Alpha',
      op: { op: 'duplicateBlocks', target: { start: 0 } },
      contains: 'Alpha\n\nAlpha',
    },
    {
      name: 'insertTable',
      body: 'Alpha',
      op: { op: 'insertTable', after: 0, rows: 2, cols: 2 },
      contains: '|',
    },
    {
      name: 'insertHorizontalRule',
      body: 'Alpha',
      op: { op: 'insertHorizontalRule', after: 0 },
      contains: '---',
    },
    {
      name: 'insertImage',
      body: 'Alpha',
      op: { op: 'insertImage', after: 0, src: '/api/documents/image-1/file', alt: 'Alt' },
      contains: '![Alt]',
    },
    {
      name: 'editTable',
      body: '| A | B |\n| --- | --- |\n| x | y |',
      op: { op: 'editTable', target: { start: 0 }, action: 'addRowAfter', row: 1, col: 0 },
      contains: '|',
    },
  ]
  it.each(operationCases)(
    'executes $name against the real Mimir Markdown dialect',
    async ({ body, op, contains }) => {
      const { editor, handle } = setup(body)
      const output = await handle.execute(
        'apply_ops',
        { ops: [op] },
        { expectedVersion: handle.getVersion() },
      )
      expect(output.ok).toBe(true)
      expect(editor.getMarkdown()).toContain(contains)
    },
  )
  it('reads unsaved manual text and edits it through the shared Tiptap transaction path', async () => {
    const { editor, handle, getDirty } = setup()
    editor.commands.insertContentAt(1, 'Manual ')
    const version = handle.getVersion()
    expect(handle.getContext().markdown).toContain('Manual Alpha')
    const output = await handle.execute(
      'apply_ops',
      { ops: [{ op: 'replaceText', target: { start: 0 }, find: 'Alpha', replace: 'Agent' }] },
      { expectedVersion: version, roundId: 'round-1' },
    )
    expect(output).toMatchObject({ ok: true, changed: true })
    expect(editor.getMarkdown()).toContain('Manual Agent')
    expect(getDirty()).toBe(true)
    expect(await handle.undoRound('round-1')).toBe(true)
    expect(editor.getMarkdown()).toContain('Manual Alpha')
  })

  it('reads unsaved blocks with a continuation offset', async () => {
    const { editor, handle } = setup('Alpha\n\nBeta')
    editor.commands.insertContentAt(1, 'Manual ')
    const first = await handle.execute('read_blocks', { startIndex: 0, endIndex: 1, offset: 0 })
    expect(first).toMatchObject({ ok: true, changed: false })
    const full = (first.data as { markdown: string; nextOffset: number | null }).markdown
    expect(full).toContain('Manual Alpha')
    expect(full).toContain('Beta')
    const second = await handle.execute('read_blocks', { startIndex: 0, endIndex: 1, offset: 7 })
    expect((second.data as { markdown: string }).markdown).toBe(full.slice(7))
  })

  it('rejects stale writes after a later manual edit and protects rollback', async () => {
    const { editor, handle } = setup()
    handle.freezeSelection('round-1')
    const oldVersion = handle.getVersion()
    editor.commands.insertContentAt(1, 'new ')
    const output = await handle.execute(
      'apply_ops',
      { ops: [{ op: 'deleteBlocks', target: { start: 0 } }] },
      { expectedVersion: oldVersion, roundId: 'round-1' },
    )
    expect(output.ok).toBe(false)
    expect(editor.getMarkdown()).toContain('new Alpha')
    expect(await handle.undoRound('round-1')).toBe(false)
  })

  it('validates the whole batch before editing and reports a partial batch honestly', async () => {
    const { editor, handle } = setup()
    const version = handle.getVersion()
    const invalid = await handle.execute(
      'apply_ops',
      {
        ops: [
          { op: 'replaceText', target: { start: 0 }, find: 'Alpha', replace: 'Done' },
          { op: 'notAnOp' },
        ],
      },
      { expectedVersion: version },
    )
    expect(invalid.ok).toBe(false)
    expect(editor.getMarkdown()).toContain('Alpha')
    const partial = await handle.execute(
      'apply_ops',
      {
        ops: [
          { op: 'replaceText', target: { start: 0 }, find: 'Alpha', replace: 'Done' },
          { op: 'replaceText', target: { start: 1 }, find: 'missing', replace: 'X' },
        ],
      },
      { expectedVersion: version },
    )
    expect(partial).toMatchObject({ ok: false, changed: true })
    expect(editor.getMarkdown()).toContain('Done')
  })

  it('inserts a table and preserves it through Markdown serialization', async () => {
    const { editor, handle } = setup('')
    const output = await handle.execute(
      'apply_ops',
      { ops: [{ op: 'insertTable', after: -1, rows: 2, cols: 2 }] },
      { expectedVersion: handle.getVersion() },
    )
    expect(output.ok).toBe(true)
    expect(editor.getMarkdown()).toContain('|')
  })

  it('updates frontmatter as note metadata without placing YAML into the body', async () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: createExtensions(),
      content: 'Original body',
      contentType: 'markdown',
    })
    opened.push(editor)
    let yaml = 'title: "Before"'
    const handle = createMarkdownAgentHandle(editor, 'note-1', {
      isDirty: () => false,
      onDirtyChange: () => {},
      flushBody: async () => true,
      services: {
        fetchImage: async () => {
          throw new Error('unused')
        },
        generateImage: async () => {
          throw new Error('unused')
        },
        uploadImage: async () => {
          throw new Error('unused')
        },
        writeDocument: async () => {
          throw new Error('unused')
        },
        readFrontmatter: async () => yaml,
        writeFrontmatter: async (next, expected) => {
          if (expected !== yaml) throw new Error('stale frontmatter')
          yaml = next
          return yaml
        },
      },
    })
    const result = await handle.execute(
      'apply_ops',
      { ops: [{ op: 'setFrontmatter', yaml: 'title: "After"' }] },
      { expectedVersion: handle.getVersion(), roundId: 'meta-round' },
    )
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(yaml).toContain('After')
    expect(editor.getMarkdown()).toBe('Original body')
    expect(await handle.undoRound('meta-round')).toBe(true)
    expect(yaml).toContain('Before')
  })
})
