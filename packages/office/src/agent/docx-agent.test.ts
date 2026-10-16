// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import {
  paperWidthPx,
  sectionGeoms,
} from '../../vendor/apps/docs/src/renderer/pagination-sections.js'
import type { BlockBox } from '../../vendor/apps/docs/src/renderer/pagination-types.js'
import { openDocx } from '../docx.js'
import { assignLiveNoteBands, lastPageNoteMinHeight, liveFootnoteBlocks } from '../pagination.js'
import { pageFootnotesOf } from '../footnotes.js'
import { DOCX_AGENT_OP_NAMES, createDocxAgentHandle, docxAgentLiveSections } from './docx-agent.js'
import type { SaveOptions } from '../../vendor/packages/docx-engine/src/patch.js'

const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
)

async function setup(inputBytes?: Uint8Array) {
  const bytes = inputBytes ?? new Uint8Array(readFileSync(FIXTURE))
  const session = await openDocx(bytes)
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: session.content as never,
  })
  let dirty = false
  const saveOptions: { current: SaveOptions } = { current: {} }
  const handle = createDocxAgentHandle(editor, 'doc-1', {
    isDirty: () => dirty,
    onDirtyChange: (next) => {
      dirty = next
    },
    saveOptions,
    session,
  })
  return { bytes, session, editor, handle, saveOptions, getDirty: () => dirty }
}

describe('DOCX agent live editor handle', () => {
  const operationCases: Array<
    [
      string,
      (indexes: { paragraph: number; list: number; image: number }) => Record<string, unknown>,
    ]
  > = [
    ['setFont', ({ paragraph }) => ({ target: { blockIndexes: [paragraph] }, color: '#123456' })],
    [
      'setMatchedFont',
      ({ paragraph }) => ({ target: { blockIndexes: [paragraph] }, text: '普通段落', bold: true }),
    ],
    [
      'setParagraphFormat',
      ({ paragraph }) => ({ target: { blockIndexes: [paragraph] }, align: 'right' }),
    ],
    ['setHeadingLevel', ({ paragraph }) => ({ target: { blockIndexes: [paragraph] }, level: 1 })],
    [
      'findReplace',
      ({ paragraph }) => ({
        target: { blockIndexes: [paragraph] },
        find: '普通段落',
        replace: 'Agent changed',
      }),
    ],
    ['deleteBlocks', ({ paragraph }) => ({ target: { blockIndexes: [paragraph] } })],
    ['moveBlocks', ({ paragraph }) => ({ blockIndexes: [paragraph], afterBlockIndex: -1 })],
    ['setList', ({ paragraph }) => ({ target: { blockIndexes: [paragraph] }, kind: 'bullet' })],
    ['clearList', ({ list }) => ({ target: { blockIndexes: [list] } })],
    [
      'setImageProperties',
      ({ image }) => ({ target: { blockIndexes: [image] }, widthPx: 120, heightPx: 120 }),
    ],
    ['insertToc', () => ({ afterBlockIndex: -1 })],
    [
      'setParagraphAttrs',
      ({ paragraph }) => ({ target: { blockIndexes: [paragraph] }, attrs: { align: 'center' } }),
    ],
    ['setOutlineLevel', ({ paragraph }) => ({ target: { blockIndexes: [paragraph] }, level: 2 })],
    ['stepIndent', ({ paragraph }) => ({ target: { blockIndexes: [paragraph] }, delta: 1 })],
    ['stepHangingIndent', ({ paragraph }) => ({ target: { blockIndexes: [paragraph] }, delta: 1 })],
  ]

  it('keeps the executable operation matrix aligned with the GenOffice contract', () => {
    expect(operationCases.map(([name]) => name)).toEqual(DOCX_AGENT_OP_NAMES)
  })

  it.each(operationCases)('executes and reopens apply_ops %s', async (name, makeArgs) => {
    const { bytes, session, editor, handle } = await setup()
    const blocks = handle.getContext().blocks
    const index = (type: string, text?: string) => {
      const found = blocks.find(
        (block) => block.type === type && (!text || block.text.includes(text)),
      )
      if (!found) throw new Error(`fixture missing ${type}`)
      return found.index
    }
    const indexes = {
      paragraph: index('docParagraph', '普通段落'),
      list: index('docListItem'),
      image: index('docProtected'),
    }
    const outcome = await handle.execute('apply_ops', {
      ops: [{ op: name, ...makeArgs(indexes) }],
    })
    expect(outcome.changed).toBe(true)
    const saved = await session.save(editor.getJSON() as never)
    const reopened = await openDocx(saved)
    expect(reopened.content.type).toBe('doc')
    const beforeXml = await (
      await JSZip.loadAsync(bytes)
    )
      .file('word/document.xml')!
      .async('string')
    const afterXml = await (await JSZip.loadAsync(saved)).file('word/document.xml')!.async('string')
    expect(afterXml, `${name} must persist a document XML change`).not.toBe(beforeXml)
    handle.dispose()
    editor.destroy()
  })

  it('reads unsaved canvas, writes through the patch save, and safely undoes a round', async () => {
    const { bytes, session, editor, handle, getDirty } = await setup()
    const before = editor.getJSON()
    const oldVersion = handle.getVersion()
    const outcome = await handle.execute(
      'insert_content',
      { html: '<p>Agent test sentinel</p>', afterBlockIndex: -1 },
      {
        expectedVersion: oldVersion,
        roundId: 'round-1',
      },
    )
    expect(outcome.changed).toBe(true)
    expect(getDirty()).toBe(true)
    expect(handle.getContext().text).toContain('Agent test sentinel')
    await expect(
      handle.execute('insert_content', { html: '<p>stale</p>' }, { expectedVersion: oldVersion }),
    ).rejects.toThrow('重新读取')
    const saved = await session.save(editor.getJSON() as never)
    const reopened = await openDocx(saved)
    expect(JSON.stringify(reopened.content)).toContain('Agent test sentinel')
    const [a, b] = await Promise.all([JSZip.loadAsync(bytes), JSZip.loadAsync(saved)])
    for (const name of Object.keys(a.files)) {
      if (name === 'word/document.xml') continue
      expect(await b.files[name]?.async('uint8array')).toEqual(
        await a.files[name]?.async('uint8array'),
      )
    }
    expect(handle.undoRound('round-1')).toBe(true)
    expect(editor.getJSON()).toEqual(before)
    expect(getDirty()).toBe(false)
    handle.dispose()
    await expect(handle.execute('get_document_context', {})).rejects.toThrow('已关闭')
    editor.destroy()
  })

  it('reads a live block as HTML', async () => {
    const { editor, handle } = await setup()
    await handle.execute('insert_content', {
      html: '<p>Live unsaved block</p>',
      afterBlockIndex: -1,
    })
    const read = await handle.execute('read_blocks', { startBlockIndex: 0, endBlockIndex: 0 })
    expect((read.data as { html: string }).html).toContain('Live unsaved block')
    expect(read.changed).toBe(false)
    handle.dispose()
    editor.destroy()
  })

  it('rejects tracked AI insertion and saves the rejected state', async () => {
    const { session, editor, handle } = await setup()
    handle.setRevisionMode(true)
    await handle.execute('insert_content', {
      html: '<p>Reject this AI text</p>',
      afterBlockIndex: -1,
    })
    expect((await handle.execute('read_revisions', {})).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'insertion' })]),
    )
    await handle.execute('reject_changes', { all: true })
    const saved = await session.save(editor.getJSON() as never)
    const reopened = await openDocx(saved)
    expect(JSON.stringify(reopened.content)).not.toContain('Reject this AI text')
    handle.dispose()
    editor.destroy()
  })

  it('inserts an endnote and reopens its definition', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    const index = handle
      .getContext()
      .blocks.find((block) => block.type === 'docParagraph' && block.text)?.index
    expect(index).toBeDefined()
    const inserted = await handle.execute('insert_endnote', {
      blockIndex: index,
      text: 'Agent endnote',
    })
    const id = (inserted.data as { id: string }).id
    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(saved)
    expect(reopened.footnotes.parsed.endnotes.find((note) => note.id === id)?.text).toBe(
      'Agent endnote',
    )
    handle.dispose()
    editor.destroy()
  })

  it('inserts at an exact captured position and rejects a stale cursor', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    let blockIndex = -1
    let start = -1
    editor.state.doc.forEach((node, from, index) => {
      if (blockIndex < 0 && node.type.name === 'docParagraph' && node.textContent.length > 4) {
        blockIndex = index
        start = from
      }
    })
    expect(blockIndex).toBeGreaterThanOrEqual(0)
    const position = start + 3
    const version = handle.getVersion()
    const inserted = await handle.execute(
      'insert_footnote',
      { blockIndex, position, text: 'Exact cursor note' },
      { expectedVersion: version },
    )
    const id = (inserted.data as { id: string }).id
    expect(editor.state.doc.nodeAt(position)?.type.name).toBe('docNoteRef')
    const projected = liveFootnoteBlocks(editor, session.footnotes.blockByDocxIndex)
    expect(projected.referenced.has(`footnote:${id}`)).toBe(true)
    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    expect(
      (await openDocx(saved)).footnotes.parsed.footnotes.find((note) => note.id === id)?.text,
    ).toBe('Exact cursor note')

    editor.commands.insertContentAt(position, 'changed')
    await expect(
      handle.execute(
        'insert_endnote',
        { blockIndex, position, text: 'Stale note' },
        { expectedVersion: version },
      ),
    ).rejects.toThrow('请重新读取')
    expect(saveOptions.current.endnotes).toBeUndefined()
    handle.dispose()
    editor.destroy()
  })

  it('projects a note from a new unsaved paragraph and reopens it after save', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    await handle.execute('insert_content', {
      html: '<p>New paragraph for a live note</p>',
      afterBlockIndex: -1,
    })
    expect(editor.state.doc.child(0)?.attrs.docxIndex).toBeNull()
    const inserted = await handle.execute('insert_footnote', {
      blockIndex: 0,
      position: 4,
      text: 'New paragraph note body',
    })
    const id = (inserted.data as { id: string }).id
    const live = liveFootnoteBlocks(editor, session.footnotes.blockByDocxIndex)
    expect(live.referenced.has(`footnote:${id}`)).toBe(true)
    const el = editor.view.dom.querySelector<HTMLElement>('p:has(sup.doc-note-ref)')
    expect(el).not.toBeNull()
    const box: BlockBox = { top: 0, height: 30, el: el!, section: 0 }
    const ref = el!.querySelector<HTMLElement>('sup.doc-note-ref')!
    vi.spyOn(el!, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect)
    vi.spyOn(ref, 'getBoundingClientRect').mockReturnValue({ top: 130 } as DOMRect)
    assignLiveNoteBands([box])
    expect(box.noteBands).toEqual([{ offset: 30, height: 0 }])
    const context = {
      parsed: session.footnotes.parsed,
      footnotes: saveOptions.current.footnotes!,
      blocks: [box],
      blockByDocxIndex: live.blocks,
      sections: session.sections,
    }
    const firstPage = pageFootnotesOf(context, [{ start: 0, end: 100, section: 0 }])
    expect(firstPage[0]?.map((item) => item.text)).toContain('New paragraph note body')

    const secondPage = pageFootnotesOf({ ...context, blocks: [{ ...box, top: 20 }] }, [
      { start: 0, end: 40, section: 0 },
      { start: 40, end: 100, section: 0 },
    ])
    expect(secondPage[0]).toHaveLength(0)
    expect(secondPage[1]?.map((item) => item.text)).toContain('New paragraph note body')
    const noteHeight = secondPage[1]!.reduce((sum, note) => sum + note.height, 8)
    const required = lastPageNoteMinHeight(990, noteHeight, 96)
    expect(required).toBeGreaterThan(1056)
    expect(required - 96 - noteHeight).toBeGreaterThanOrEqual(998)

    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(saved)
    expect(reopened.footnotes.parsed.footnotes.find((note) => note.id === id)?.text).toBe(
      'New paragraph note body',
    )
    expect(reopened.sections.map((section) => section.settings.pageHeight)).toEqual(
      session.sections.map((section) => section.settings.pageHeight),
    )
    handle.dispose()
    editor.destroy()
  })

  it('inserts a supplied PNG and reopens its media part', async () => {
    const { session, editor, handle } = await setup()
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lGQAAAAASUVORK5CYII='
    class TestImage extends EventTarget {
      naturalWidth = 1
      naturalHeight = 1
      set src(_value: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')))
      }
    }
    vi.stubGlobal('Image', TestImage)
    try {
      const outcome = await handle.execute('insert_image', { dataUrl: png, mimeType: 'image/png' })
      expect(outcome.changed).toBe(true)
      const saved = await session.save(editor.getJSON() as never)
      expect(
        Object.keys((await JSZip.loadAsync(saved)).files).some((name) =>
          name.startsWith('word/media/'),
        ),
      ).toBe(true)
      expect(JSON.stringify((await openDocx(saved)).content)).toContain('docProtected')
    } finally {
      vi.unstubAllGlobals()
      handle.dispose()
      editor.destroy()
    }
  })

  it('rejects unsupported or invalid atomic ops without partial edits', async () => {
    const { editor, handle } = await setup()
    const before = editor.getJSON()
    await expect(
      handle.execute('apply_ops', {
        ops: [
          { op: 'setParagraphFormat', target: { blockIndexes: [0] }, align: 'center' },
          { op: 'insertToc', afterBlockIndex: -1 },
        ],
      }),
    ).rejects.toThrow('必须单独执行')
    expect(editor.getJSON()).toEqual(before)
    await expect(
      handle.execute('apply_ops', {
        ops: [
          { op: 'setParagraphAttrs', target: { blockIndexes: [0] }, attrs: { genXml: '<w:p/>' } },
        ],
      }),
    ).rejects.toThrow('不能设置段落属性 genXml')
    expect(editor.getJSON()).toEqual(before)
    await expect(handle.execute('insert_chart', {})).rejects.toThrow('kind')
    expect(editor.getJSON()).toEqual(before)
    handle.dispose()
    editor.destroy()
  })

  it('refuses round rollback after later human edits', async () => {
    const { editor, handle } = await setup()
    await handle.execute(
      'insert_content',
      { html: '<p>AI</p>', afterBlockIndex: -1 },
      { roundId: 'round-1' },
    )
    editor.commands.insertContentAt(0, '<p>human</p>')
    expect(handle.undoRound('round-1')).toBe(false)
    expect(handle.getContext().text).toContain('human')
    handle.dispose()
    editor.destroy()
  })

  it('formats a paragraph and replaces text as one validated batch, then saves both', async () => {
    const { session, editor, handle } = await setup()
    await handle.execute('insert_content', {
      html: '<p>Agent unique phrase</p>',
      afterBlockIndex: -1,
    })
    const at = handle
      .getContext()
      .blocks.find((block) => block.text.includes('Agent unique phrase'))?.index
    expect(at).toBeDefined()
    const outcome = await handle.execute(
      'apply_ops',
      {
        ops: [
          { op: 'setParagraphFormat', target: { blockIndexes: [at] }, align: 'center' },
          { op: 'findReplace', find: 'Agent unique phrase', replace: 'Agent replacement phrase' },
        ],
      },
      { roundId: 'format-and-replace' },
    )
    expect(outcome.changed).toBe(true)
    expect(handle.getContext().text).toContain('Agent replacement phrase')
    const saved = await session.save(editor.getJSON() as never)
    const reopened = await openDocx(saved)
    expect(JSON.stringify(reopened.content)).toContain('Agent replacement phrase')
    const zip = await JSZip.loadAsync(saved)
    expect(await zip.file('word/document.xml')!.async('string')).toContain('w:jc w:val="center"')
    handle.dispose()
    editor.destroy()
  })

  it('keeps queued turns bound to their own frozen selection', async () => {
    const { session, editor, handle } = await setup()
    const firstBlock = handle.getContext().blocks.find((block) => block.text.length >= 8)
    expect(firstBlock).toBeDefined()
    const offset = (() => {
      let found = 0
      editor.state.doc.forEach((_node, from, index) => {
        if (index === firstBlock?.index) found = from
      })
      return found
    })()
    editor.commands.setTextSelection({ from: offset + 1, to: offset + 4 })
    const first = handle.freezeSelection('queued-1')
    editor.commands.setTextSelection({ from: offset + 5, to: offset + 8 })
    const second = handle.freezeSelection('queued-2')
    const context = await handle.execute('get_document_context', {}, { roundId: 'queued-1' })
    expect((context.data as { selection: { from: number } }).selection.from).toBe(first.from)
    expect(first.from).not.toBe(second.from)
    const original = editor.state.doc.textBetween(first.from, first.to)
    await handle.execute('replace_selection', { html: 'REPLACED' }, { roundId: 'queued-1' })
    expect(handle.getContext().text).toContain('REPLACED')
    expect(handle.getContext().text).not.toContain(original)
    const saved = await session.save(editor.getJSON() as never)
    expect(JSON.stringify((await openDocx(saved)).content)).toContain('REPLACED')
    handle.dispose()
    editor.destroy()
  })

  it('rejects a stale write after a human edit until the round reads fresh context', async () => {
    const { editor, handle } = await setup()
    handle.freezeSelection('stale-round')
    editor.commands.insertContentAt(0, '<p>human edit</p>')
    await expect(
      handle.execute('insert_content', { html: '<p>agent edit</p>' }, { roundId: 'stale-round' }),
    ).rejects.toThrow('重新读取当前画布')
    await handle.execute('get_document_context', {}, { roundId: 'stale-round' })
    await handle.execute(
      'insert_content',
      { html: '<p>agent edit</p>', afterBlockIndex: -1 },
      { roundId: 'stale-round' },
    )
    expect(handle.getContext().text).toContain('agent edit')
    handle.dispose()
    editor.destroy()
  })

  it('persists comments across repeated saves and restores metadata on round undo', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    const index = handle
      .getContext()
      .blocks.find((block) => block.type === 'docParagraph' && block.text)?.index
    expect(index).toBeDefined()
    const added = await handle.execute(
      'add_comment',
      { blockIndex: index, comment: 'Agent review note' },
      { roundId: 'comment-round' },
    )
    expect(added.changed).toBe(true)
    expect((await handle.execute('read_comments', {})).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'Agent review note' })]),
    )
    expect(handle.undoRound('comment-round')).toBe(true)
    expect(saveOptions.current.comments).toBeUndefined()
    await handle.execute(
      'add_comment',
      { blockIndex: index, comment: 'Saved review note' },
      { roundId: 'saved-comment' },
    )
    const savedRoot = saveOptions.current.comments?.find(
      (comment) => comment.text === 'Saved review note',
    )
    expect(savedRoot).toBeDefined()
    await handle.execute(
      'reply_comment',
      { parentId: savedRoot!.id, text: 'Addressed in draft' },
      { roundId: 'saved-comment' },
    )
    await handle.execute('resolve_comment', { id: savedRoot!.id }, { roundId: 'saved-comment' })
    const firstSave = await session.save(editor.getJSON() as never, saveOptions.current)
    const firstComments = (await openDocx(firstSave)).footnotes.parsed.comments
    expect(firstComments.map((comment) => comment.text)).toContain('Saved review note')
    expect(firstComments.find((comment) => comment.id === savedRoot!.id)?.done).toBe(true)
    expect(
      firstComments.some(
        (comment) => comment.parentId === savedRoot!.id && comment.text === 'Addressed in draft',
      ),
    ).toBe(true)
    handle.markSaved()
    await handle.execute('insert_content', { html: '<p>After first save</p>', afterBlockIndex: -1 })
    const secondSave = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(secondSave)
    expect(reopened.footnotes.parsed.comments.map((comment) => comment.text)).toContain(
      'Saved review note',
    )
    expect(JSON.stringify(reopened.content)).toContain('After first save')
    await expect(handle.execute('delete_comment', { id: savedRoot!.id })).rejects.toThrow(
      'withReplies',
    )
    await handle.execute('delete_comment', { id: savedRoot!.id, withReplies: true })
    const thirdSave = await session.save(editor.getJSON() as never, saveOptions.current)
    expect(
      (await openDocx(thirdSave)).footnotes.parsed.comments.some(
        (comment) => comment.id === savedRoot!.id,
      ),
    ).toBe(false)
    handle.dispose()
    editor.destroy()
  })

  it('inserts, edits, and deletes a footnote with its body reference', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    const index = handle
      .getContext()
      .blocks.find((block) => block.type === 'docParagraph' && block.text)?.index
    expect(index).toBeDefined()
    const inserted = await handle.execute(
      'insert_footnote',
      { blockIndex: index, text: 'Original agent note' },
      { roundId: 'note-round' },
    )
    const id = (inserted.data as { id: string }).id
    expect((await handle.execute('read_notes', {})).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'footnote',
          id,
          text: 'Original agent note',
          blockIndex: index,
        }),
      ]),
    )
    await handle.execute(
      'edit_note',
      { kind: 'footnote', id, find: 'Original', replace: 'Edited' },
      { roundId: 'note-round' },
    )
    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(saved)
    expect(reopened.footnotes.parsed.footnotes.find((note) => note.id === id)?.text).toBe(
      'Edited agent note',
    )
    expect(JSON.stringify(reopened.content)).toContain('docNoteRef')
    await handle.execute('delete_note', { kind: 'footnote', id }, { roundId: 'note-round' })
    const deleted = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopenedDeleted = await openDocx(deleted)
    expect(reopenedDeleted.footnotes.parsed.footnotes.some((note) => note.id === id)).toBe(false)
    handle.dispose()
    editor.destroy()
  })

  it('writes default and first-page headers through SaveOptions', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    await handle.execute(
      'set_header_footer',
      { kind: 'header', text: 'AI Header {PAGE}' },
      { roundId: 'hf-round' },
    )
    await handle.execute(
      'set_header_footer',
      { kind: 'header', view: 'first', text: 'First AI Header' },
      { roundId: 'hf-round' },
    )
    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(saved)
    expect(reopened.headerFooter.header?.text).toContain('AI Header')
    expect(reopened.headerFooter.header?.hasPageNumber).toBe(true)
    expect(reopened.headerFooter.headerFirst?.text).toContain('First AI Header')
    expect(reopened.headerFooter.titlePg).toBe(true)
    expect(handle.undoRound('hf-round')).toBe(true)
    expect(saveOptions.current.header).toBeUndefined()
    expect(saveOptions.current.headerFirst).toBeUndefined()
    handle.dispose()
    editor.destroy()
  })

  it('patches a single-section page setup and reads it back', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    expect(session.sections).toHaveLength(1)
    await handle.execute(
      'set_page_setup',
      { paper: 'A4', margins: { left: '2cm', right: '2cm' }, titlePg: true },
      { roundId: 'page-round' },
    )
    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(saved)
    expect(reopened.sections[0]?.settings.pageWidth).toBe(11906)
    expect(reopened.sections[0]?.settings.marginLeft).toBeCloseTo(1134, -1)
    expect(reopened.headerFooter.titlePg).toBe(true)
    expect(handle.undoRound('page-round')).toBe(true)
    expect(saveOptions.current.section).toBeUndefined()
    handle.dispose()
    editor.destroy()
  })

  it('saves a style definition and text watermark into their OOXML parts', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    await handle.execute(
      'define_style',
      {
        styleId: 'AgentCallout',
        name: 'Agent Callout',
        type: 'paragraph',
        paragraph: { align: 'center', spaceBefore: '12pt' },
        run: { bold: true, color: '#C00000' },
      },
      { roundId: 'style-round' },
    )
    await handle.execute(
      'set_watermark',
      { text: 'DRAFT', opacity: 0.4 },
      { roundId: 'style-round' },
    )
    expect((await handle.execute('list_styles', {})).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ styleId: 'AgentCallout', name: 'Agent Callout' }),
      ]),
    )
    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(saved)
    expect(reopened.footnotes.parsed.styles.get('AgentCallout')?.name).toBe('Agent Callout')
    expect(reopened.footnotes.parsed.watermarkText).toBe('DRAFT')
    expect(handle.undoRound('style-round')).toBe(true)
    expect(saveOptions.current.styleUpserts).toBeUndefined()
    expect(saveOptions.current.watermark).toBeUndefined()
    handle.dispose()
    editor.destroy()
  })

  it('inserts generated PNG bytes and rejects a stale image after decode', async () => {
    const { session, editor, handle } = await setup()
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lGQAAAAASUVORK5CYII='
    class TestImage extends EventTarget {
      naturalWidth = 1
      naturalHeight = 1
      set src(_value: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')))
      }
    }
    vi.stubGlobal('Image', TestImage)
    try {
      const before = handle.getVersion()
      const inserted = await handle.execute(
        'generate_image',
        { dataUrl: png, mimeType: 'image/png' },
        { expectedVersion: before, roundId: 'image-round' },
      )
      expect(inserted.changed).toBe(true)
      const saved = await session.save(editor.getJSON() as never)
      const zip = await JSZip.loadAsync(saved)
      expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true)
      expect(JSON.stringify((await openDocx(saved)).content)).toContain('docProtected')
      await expect(
        handle.execute('generate_image', { dataUrl: png }, { expectedVersion: before }),
      ).rejects.toThrow('重新读取')
    } finally {
      vi.unstubAllGlobals()
      handle.dispose()
      editor.destroy()
    }
  })

  it('streams a visible draft without editing, then commits or discards it', async () => {
    const { editor, handle, getDirty } = await setup()
    const before = editor.getJSON()
    handle.freezeSelection('draft-round')
    handle.beginDraft('draft-round')
    handle.appendDraft('draft-round', 'First paragraph\n\n')
    handle.appendDraft('draft-round', 'Second <safe> paragraph')
    expect(handle.getDraft('draft-round')).toContain('Second <safe>')
    expect(
      editor.view.dom.parentElement?.querySelector('[data-docx-agent-draft]')?.textContent,
    ).toContain('First paragraph')
    expect(editor.getJSON()).toEqual(before)
    expect(getDirty()).toBe(true)
    expect(handle.hasPendingDraft()).toBe(true)
    const outcome = await handle.commitDraft('draft-round')
    expect(outcome.changed).toBe(true)
    expect(handle.getDraft('draft-round')).toBeNull()
    expect(handle.getContext().text).toContain('Second <safe> paragraph')
    expect(getDirty()).toBe(true)
    handle.beginDraft('discarded')
    handle.appendDraft('discarded', 'Do not insert')
    handle.discardDraft('discarded')
    expect(handle.getContext().text).not.toContain('Do not insert')
    handle.dispose()
    editor.destroy()
  })

  it('keeps navigation dirty while a draft is active and restores it on discard', async () => {
    const { handle, editor, getDirty } = await setup()
    handle.beginDraft('unsaved-draft')
    handle.appendDraft('unsaved-draft', '<p>Still streaming</p>')
    expect(getDirty()).toBe(true)
    handle.markSaved()
    expect(getDirty()).toBe(true)
    handle.discardDraft('unsaved-draft')
    expect(getDirty()).toBe(false)
    expect(handle.hasPendingDraft()).toBe(false)
    handle.dispose()
    editor.destroy()
  })

  it('rejects stale draft commit and restores the manual revision switch', async () => {
    const { session, editor, handle } = await setup()
    const storage = editor.storage as unknown as { trackChanges?: { enabled?: boolean } }
    expect(storage.trackChanges).toBeDefined()
    storage.trackChanges!.enabled = false
    handle.setRevisionMode(true)
    await handle.execute('insert_content', { html: '<p>AI revision</p>', afterBlockIndex: -1 })
    expect(storage.trackChanges!.enabled).toBe(false)
    const revisions = (await handle.execute('read_revisions', {})).data as Array<{ type: string }>
    expect(revisions.some((revision) => revision.type === 'insertion')).toBe(true)
    const saved = await session.save(editor.getJSON() as never)
    expect(JSON.stringify((await openDocx(saved)).content)).toContain('ins')
    handle.beginDraft('stale-draft')
    handle.appendDraft('stale-draft', 'Old result')
    editor.commands.insertContentAt(0, '<p>Human edit</p>')
    await expect(handle.commitDraft('stale-draft')).rejects.toThrow('重新读取')
    expect(handle.getDraft('stale-draft')).toBe('Old result')
    handle.discardDraft('stale-draft')
    handle.dispose()
    editor.destroy()
  })

  it('filters tracked changes by type and block before accepting', async () => {
    const { session, editor, handle } = await setup()
    handle.setRevisionMode(true)
    await handle.execute('insert_content', {
      html: '<p>Reviewed insertion</p>',
      afterBlockIndex: -1,
    })
    const entries = (await handle.execute('read_revisions', {})).data as Array<{
      type: string
      blockIndex: number
    }>
    const insertion = entries.find((entry) => entry.type === 'insertion')
    expect(insertion).toBeDefined()
    const accepted = await handle.execute('accept_changes', {
      type: 'insertion',
      blockIndex: insertion!.blockIndex,
    })
    expect(accepted.changed).toBe(true)
    const saved = await session.save(editor.getJSON() as never)
    expect(JSON.stringify((await openDocx(saved)).content)).toContain('Reviewed insertion')
    handle.dispose()
    editor.destroy()
  })

  it('applies font, image, outline and paragraph ops with real patch output', async () => {
    const { session, editor, handle } = await setup()
    await handle.execute('insert_content', {
      html: '<p>Agent format target</p>',
      afterBlockIndex: -1,
    })
    const index = handle
      .getContext()
      .blocks.find((block) => block.text.includes('Agent format target'))!.index
    await handle.execute('apply_ops', {
      ops: [
        {
          op: 'setMatchedFont',
          text: 'format',
          target: { blockIndexes: [index] },
          bold: true,
          color: '#C00000',
        },
        { op: 'setParagraphAttrs', target: { blockIndexes: [index] }, attrs: { align: 'right' } },
      ],
    })
    expect(JSON.stringify(editor.getJSON())).toContain('C00000')
    const saved = await session.save(editor.getJSON() as never)
    const xml = await (await JSZip.loadAsync(saved)).file('word/document.xml')!.async('string')
    expect(xml).toContain('w:jc w:val="right"')
    expect(xml).toContain('C00000')
    await handle.execute('apply_ops', {
      ops: [{ op: 'setOutlineLevel', target: { blockIndexes: [index] }, level: 2 }],
    })
    expect(handle.getContext().blocks[index]?.type).toBe('docHeading')
    handle.dispose()
    editor.destroy()
  })

  it('inserts and edits a native chart through save and reopen', async () => {
    const { session, editor, handle } = await setup()
    await handle.execute('insert_chart', {
      kind: 'bar',
      title: 'Sales',
      categories: ['A', 'B'],
      series: [{ name: '2026', values: [12, 18] }],
      afterBlockIndex: -1,
    })
    await handle.execute('edit_chart', {
      blockIndex: 0,
      title: 'Updated sales',
      series: [{ index: 0, values: [14, null] }],
    })
    const saved = await session.save(editor.getJSON() as never)
    const zip = await JSZip.loadAsync(saved)
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/charts/chart'))).toBe(true)
    const reopened = await openDocx(saved)
    expect(JSON.stringify(reopened.content)).toContain('Updated sales')
    handle.dispose()
    editor.destroy()
  })

  it('saves a text box and a first section break', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    await handle.execute('insert_text_box', {
      text: 'Agent callout',
      width: '2in',
      height: '1in',
      x: '0pt',
      y: '0pt',
      afterBlockIndex: -1,
    })
    await handle.execute('insert_section_break', { afterBlockIndex: 0, type: 'continuous' })
    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(saved)
    expect(JSON.stringify(reopened.content)).toContain('Agent callout')
    expect(reopened.sections.length).toBe(2)
    expect(reopened.sections[1]?.startType).toBe('continuous')
    handle.dispose()
    editor.destroy()
  })

  it('updates an earlier section without altering the later section', async () => {
    const first = await setup()
    await first.handle.execute('insert_section_break', { afterBlockIndex: 0, type: 'nextPage' })
    const splitBytes = await first.session.save(
      first.editor.getJSON() as never,
      first.saveOptions.current,
    )
    first.handle.dispose()
    first.editor.destroy()
    const { session, editor, handle, saveOptions } = await setup(splitBytes)
    expect(session.sections).toHaveLength(2)
    const laterWidth = session.sections[1]!.settings.pageWidth
    await handle.execute('set_page_setup', { section: 0, paper: 'A5' })
    expect(docxAgentLiveSections(editor, session, saveOptions.current)[0]?.settings.pageWidth).toBe(
      8391,
    )
    const live = docxAgentLiveSections(editor, session, saveOptions.current)
    const liveGeoms = sectionGeoms(live)
    expect(paperWidthPx(live)).toBeGreaterThan(liveGeoms[0]!.contentWidth!)
    expect(liveGeoms[1]!.forceBreak).toBe(true)
    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(saved)
    expect(reopened.sections[0]!.settings.pageWidth).toBe(8391)
    expect(reopened.sections[1]!.settings.pageWidth).toBe(laterWidth)
    expect(sectionGeoms(reopened.sections)).toEqual(liveGeoms)
    handle.dispose()
    editor.destroy()
  })

  it('inserts another break inside a multi-section document', async () => {
    const first = await setup()
    await first.handle.execute('insert_section_break', { afterBlockIndex: 1, type: 'nextPage' })
    const splitBytes = await first.session.save(
      first.editor.getJSON() as never,
      first.saveOptions.current,
    )
    first.handle.dispose()
    first.editor.destroy()
    const { session, editor, handle, saveOptions } = await setup(splitBytes)
    expect(session.sections).toHaveLength(2)
    await handle.execute('insert_section_break', { afterBlockIndex: 0, type: 'oddPage' })
    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(saved)
    expect(reopened.sections).toHaveLength(3)
    expect(reopened.sections[1]?.startType).toBe('oddPage')
    handle.dispose()
    editor.destroy()
  })

  it('updates every section when no target is supplied and exposes live geometry', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    await handle.execute('insert_section_break', { afterBlockIndex: 0, type: 'nextPage' })
    await handle.execute('set_page_setup', { paper: 'A5', margins: { left: '2cm' } })
    const live = docxAgentLiveSections(editor, session, saveOptions.current)
    expect(live).toHaveLength(2)
    expect(live.map((section) => section.settings.pageWidth)).toEqual([8391, 8391])
    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(saved)
    expect(reopened.sections.map((section) => section.settings.pageWidth)).toEqual([8391, 8391])
    handle.dispose()
    editor.destroy()
  })

  it('inserts multiple section breaks before saving', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    await handle.execute('insert_section_break', { afterBlockIndex: 0, type: 'continuous' })
    await handle.execute('insert_section_break', { afterBlockIndex: 2, type: 'oddPage' })
    expect(docxAgentLiveSections(editor, session, saveOptions.current)).toHaveLength(3)
    const saved = await session.save(editor.getJSON() as never, saveOptions.current)
    const reopened = await openDocx(saved)
    expect(reopened.sections).toHaveLength(3)
    expect(reopened.sections[1]?.startType).toBe('continuous')
    expect(reopened.sections[2]?.startType).toBe('oddPage')
    handle.dispose()
    editor.destroy()
  })

  it('persists a floating picture and a picture watermark and exposes a bounded image read', async () => {
    const { session, editor, handle, saveOptions } = await setup()
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lGQAAAAASUVORK5CYII='
    class TestImage extends EventTarget {
      naturalWidth = 1
      naturalHeight = 1
      set src(_value: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')))
      }
    }
    vi.stubGlobal('Image', TestImage)
    try {
      await handle.execute('insert_picture', {
        dataUrl: png,
        afterBlockIndex: -1,
        width: '1in',
        float: { anchor: 'page', x: '1in', y: '2in', wrap: 'square' },
        altText: 'AI picture',
      })
      expect(handle.readImage(0).dataUrl).toBe(png)
      await handle.execute('set_watermark', {
        image: 'https://example.com/logo.png',
        dataUrl: png,
        washout: true,
      })
      const saved = await session.save(editor.getJSON() as never, saveOptions.current)
      const reopened = await openDocx(saved)
      expect(JSON.stringify(reopened.content)).toContain('imageWrap')
      expect(reopened.footnotes.parsed.watermarkPicture).toBeTruthy()
    } finally {
      vi.unstubAllGlobals()
      handle.dispose()
      editor.destroy()
    }
  })

  it('inherits paragraph and run formatting when replacing blocks', async () => {
    const { session, editor, handle } = await setup()
    await handle.execute('insert_content', {
      html: '<p>Original formatted text</p>',
      afterBlockIndex: -1,
    })
    await handle.execute('apply_ops', {
      ops: [
        { op: 'setParagraphFormat', target: { blockIndexes: [0] }, align: 'center' },
        { op: 'setFont', target: { blockIndexes: [0] }, bold: true, color: '#C00000' },
      ],
    })
    await handle.execute('replace_blocks', {
      startBlockIndex: 0,
      endBlockIndex: 0,
      html: '<p>New formatted text</p><p>Expanded text</p>',
    })
    const saved = await session.save(editor.getJSON() as never)
    const reopened = await openDocx(saved)
    expect(JSON.stringify(reopened.content)).toContain('New formatted text')
    expect(JSON.stringify(reopened.content)).toContain('Expanded text')
    const xml = await (await JSZip.loadAsync(saved)).file('word/document.xml')!.async('string')
    expect(xml).toContain('w:jc w:val="center"')
    expect(xml).toContain('C00000')
    handle.dispose()
    editor.destroy()
  })

  it('inherits table and cell formatting when replacing table contents', async () => {
    const original = new Uint8Array(readFileSync(FIXTURE))
    const zip = await JSZip.loadAsync(original)
    const xml = await zip.file('word/document.xml')!.async('string')
    zip.file(
      'word/document.xml',
      xml
        .replace('<w:tblPr>', '<w:tblPr><w:shd w:val="clear" w:color="auto" w:fill="ABCDEF"/>')
        .replace(
          '<w:tc><w:p>',
          '<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="123456"/></w:tcPr><w:p>',
        ),
    )
    const { session, editor, handle } = await setup(await zip.generateAsync({ type: 'uint8array' }))
    let table: { index: number; node: typeof editor.state.doc } | null = null
    editor.state.doc.forEach((node, _from, index) => {
      if (!table && node.type.name === 'docTable') table = { index, node }
    })
    expect(table).not.toBeNull()
    const source = table!
    expect(source.node.child(0).child(0).attrs.fill).toBe('123456')
    const rows: string[] = []
    source.node.forEach((row) => {
      const cells: string[] = []
      row.forEach((cell) => {
        const tag = cell.type.name === 'docTableHeader' ? 'th' : 'td'
        cells.push(`<${tag}><p>Agent table cell</p></${tag}>`)
      })
      rows.push(`<tr>${cells.join('')}</tr>`)
    })
    await handle.execute('replace_blocks', {
      startBlockIndex: source.index,
      endBlockIndex: source.index,
      html: `<table><tbody>${rows.join('')}</tbody></table>`,
    })
    const replaced = editor.state.doc.child(source.index)
    expect(replaced.attrs.tblFill).toBe('ABCDEF')
    expect(replaced.child(0).child(0).attrs.fill).toBe('123456')
    const saved = await session.save(editor.getJSON() as never)
    const reopened = await openDocx(saved)
    expect(JSON.stringify(reopened.content)).toContain('Agent table cell')
    const savedXml = await (await JSZip.loadAsync(saved)).file('word/document.xml')!.async('string')
    expect(savedXml).toContain('ABCDEF')
    expect(savedXml).toContain('123456')
    handle.dispose()
    editor.destroy()
  })

  it('filters font operations by frozen selection and text target', async () => {
    const { session, editor, handle } = await setup()
    await handle.execute('insert_content', { html: '<p>Alpha same Alpha</p>', afterBlockIndex: -1 })
    editor.commands.setTextSelection({ from: 1, to: 6 })
    handle.freezeSelection('font-scope')
    await handle.execute(
      'apply_ops',
      {
        ops: [{ op: 'setFont', target: { scope: 'selection' }, bold: true }],
      },
      { roundId: 'font-scope' },
    )
    await handle.execute(
      'apply_ops',
      {
        ops: [
          {
            op: 'setMatchedFont',
            text: 'Alpha',
            target: {
              nodeType: 'docParagraph',
              containsText: 'alpha',
              matchCase: false,
              scope: 'selection',
            },
            color: '#C00000',
          },
        ],
      },
      { roundId: 'font-scope' },
    )
    const first = editor.state.doc.child(0)
    expect(first.child(0).text).toBe('Alpha')
    expect(first.child(0).marks.some((mark) => mark.type.name === 'bold')).toBe(true)
    expect(first.lastChild?.text).toBe(' same Alpha')
    expect(first.lastChild?.marks.some((mark) => mark.type.name === 'bold')).toBe(false)
    const saved = await session.save(editor.getJSON() as never)
    const xml = await (await JSZip.loadAsync(saved)).file('word/document.xml')!.async('string')
    expect(xml).toContain('C00000')
    const reopened = await openDocx(saved)
    expect(JSON.stringify(reopened.content)).toContain('"text":" same Alpha"')
    handle.dispose()
    editor.destroy()
  })
})
