/** @vitest-environment happy-dom */
import { Editor } from '@tiptap/core'
import { closeHistory, undoDepth } from '@tiptap/pm/history'
import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { openDocx } from '../docx.js'
import { createDocxAgentHandle } from '../agent/docx-agent.js'
import { docxHeadings } from './docx-view.js'
import {
  captureDocxOutlineTarget,
  docxOutlineStaleReason,
  docxOutlineLevelReason,
  assertDocxOutlineTarget,
} from './docx-outline.js'
import { outlineFixture } from './docx-outline-test-fixture.js'

async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((part) => !part.dir)
        .map(async (part) => [part.name, await part.async('uint8array')]),
    ),
  )
}

async function setup(protectedDocument = false, bytesOverride?: Uint8Array) {
  const bytes = bytesOverride ?? (await outlineFixture(protectedDocument)),
    session = await openDocx(bytes)
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: session.content as never,
  })
  const handle = createDocxAgentHandle(editor, 'outline', {
    session,
    isDirty: () => false,
    onDirtyChange: () => {},
    headingLevels: session.headingLevels,
  })
  return { bytes, session, editor, handle, documentId: 'outline' }
}
it('collects raw rich, empty, repeated, styled and numbered headings with live styles and body-off excluded', async () => {
  const c = await setup()
  try {
    const headings = docxHeadings(c.editor.state.doc, c.session.footnotes.parsed.styles)
    expect(headings.filter((h) => h.kind === 'numbered').map((h) => h.text)).toEqual(['编号标题'])
    expect(headings.find((h) => h.text.startsWith('重复'))?.text).toBe('重复  中文 Link')
    expect(headings.filter((h) => h.label === '空标题')).toHaveLength(1)
    expect(headings.some((h) => h.text === 'Body outline off')).toBe(false)
    expect(headings.find((h) => h.text === '显式  大纲')?.kind).toBe('outline')
    const changed = new Map(c.session.footnotes.parsed.styles)
    changed.set('NumberedHeading', { ...changed.get('NumberedHeading')!, headingLevel: 7 })
    expect(
      docxHeadings(c.editor.state.doc, changed).find((h) => h.kind === 'numbered')?.level,
    ).toBe(7)
    expect(
      docxOutlineLevelReason(
        captureDocxOutlineTarget(
          c,
          headings.find((h) => h.kind === 'numbered')!,
        ),
      ),
    ).toContain('编号标题')
  } finally {
    c.handle.dispose()
    c.editor.destroy()
  }
})
it('freezes target independently from selection, rejects edits/undo/session and protection epoch changes', async () => {
  const c = await setup()
  try {
    const heading = docxHeadings(c.editor.state.doc)[0]!,
      target = captureDocxOutlineTarget(c, heading)
    c.editor.commands.setTextSelection(c.editor.state.doc.content.size - 1)
    expect(docxOutlineStaleReason(target, c)).toBeNull()
    c.editor.commands.insertContent('changed')
    c.editor.commands.undo()
    expect(c.editor.state.doc.eq(target.doc)).toBe(true)
    expect(docxOutlineStaleReason(target, c)).toContain('重新选择')
    const next = captureDocxOutlineTarget(c, heading)
    expect(docxOutlineStaleReason(next, { ...c, documentId: 'other' })).toContain('重新选择')
    expect(docxOutlineStaleReason({ ...next, epoch: next.epoch - 1 }, c)).toContain('重新选择')
    expect(docxOutlineStaleReason(next, { ...c, session: await openDocx(c.bytes) })).toContain(
      '重新选择',
    )
  } finally {
    c.handle.dispose()
    c.editor.destroy()
  }
})
it.each([0, 2, 7, 8, 9])(
  'saves actual native heading level %s with rich marks, one undo and untouched parts',
  async (level) => {
    const c = await setup()
    try {
      const original = c.editor.getJSON(),
        inline = c.editor.state.doc.firstChild!.content.toJSON(),
        version = c.handle.getVersion(),
        history = undoDepth(c.editor.state)
      c.editor.view.dispatch(closeHistory(c.editor.state.tr))
      const result = await c.handle.execute(
        'apply_ops',
        { ops: [{ op: 'setHeadingLevel', target: { blockIndexes: [0] }, level }] },
        { expectedVersion: version },
      )
      c.editor.view.dispatch(closeHistory(c.editor.state.tr))
      expect(result.changed).toBe(true)
      expect(c.editor.state.doc.firstChild!.content.toJSON()).toEqual(inline)
      const saved = await c.session.save(c.editor.getJSON() as never),
        reopened = await openDocx(saved)
      const first = reopened.content.content![0]!
      expect(first.type).toBe(level ? 'docHeading' : 'docParagraph')
      expect(first.attrs?.level ?? 0).toBe(level)
      const zip = await JSZip.loadAsync(saved),
        before = await JSZip.loadAsync(c.bytes)
      const documentXml = await zip.file('word/document.xml')!.async('string')
      expect(documentXml.match(/<w:p[\s>][\s\S]*?<\/w:p>/)?.[0]).toContain(
        '<w:cnfStyle w:val="100000000000"/>',
      )
      expect(await entries(await reopened.save(reopened.content))).toEqual(await entries(saved))
      for (const part of Object.values(before.files).filter(
        (candidate) => !candidate.dir && candidate.name !== 'word/document.xml',
      ))
        expect(await zip.file(part.name)!.async('uint8array')).toEqual(
          await part.async('uint8array'),
        )
      expect(undoDepth(c.editor.state)).toBe(history + 1)
      c.editor.commands.undo()
      expect(c.editor.getJSON()).toEqual(original)
      expect(await entries(await c.session.save(c.editor.getJSON() as never))).toEqual(
        await entries(c.bytes),
      )
      c.editor.commands.redo()
      expect(c.editor.state.doc.firstChild!.attrs.level ?? 0).toBe(level)
    } finally {
      c.handle.dispose()
      c.editor.destroy()
    }
  },
)
it.each(['style', 'outline'] as const)(
  'preserves unknown native %s attributes with single-quoted spaced values',
  async (kind) => {
    const zip = await JSZip.loadAsync(await outlineFixture())
    const xml = await zip.file('word/document.xml')!.async('string')
    const original = kind === 'style' ? '<w:pStyle w:val="Heading1"/>' : '<w:outlineLvl w:val="1"/>'
    const native = kind === 'style' ? 'pStyle' : 'outlineLvl'
    const value = kind === 'style' ? 'Heading1' : '1'
    zip.file(
      'word/document.xml',
      xml.replace(
        original,
        `<w:${native} xmlns:m="urn:mimir-test" m:keep="sentinel w:val='untouched'" w:val = '${value}'/>`,
      ),
    )
    const c = await setup(false, await zip.generateAsync({ type: 'uint8array' }))
    try {
      const heading = docxHeadings(c.editor.state.doc).find((entry) =>
        kind === 'style' ? entry.blockIndex === 0 : entry.kind === 'outline',
      )!
      expect(heading.level).toBe(kind === 'style' ? 1 : 2)
      await c.handle.execute('apply_ops', {
        ops: [
          {
            op: kind === 'style' ? 'setHeadingLevel' : 'setOutlineLevel',
            target: { blockIndexes: [heading.blockIndex] },
            level: 3,
          },
        ],
      })
      const saved = await c.session.save(c.editor.getJSON() as never)
      const output = await (await JSZip.loadAsync(saved)).file('word/document.xml')!.async('string')
      expect(output).toContain(
        `<w:${native} xmlns:m="urn:mimir-test" m:keep="sentinel w:val='untouched'" w:val = '${kind === 'style' ? 'Heading3' : '2'}'/>`,
      )
      expect((await openDocx(saved)).content.content![heading.blockIndex]!.attrs?.level).toBe(3)
    } finally {
      c.handle.dispose()
      c.editor.destroy()
    }
  },
)
it('uses native explicit outline without changing its style or inline marks; same-level is a true no-op', async () => {
  const c = await setup()
  try {
    const heading = docxHeadings(c.editor.state.doc).find((h) => h.kind === 'outline')!,
      node = c.editor.state.doc.nodeAt(heading.position)!,
      version = c.handle.getVersion(),
      depth = undoDepth(c.editor.state)
    const noOp = await c.handle.execute('apply_ops', {
      ops: [{ op: 'setHeadingLevel', target: { blockIndexes: [0] }, level: 1 }],
    })
    expect(noOp.changed).toBe(false)
    expect(c.handle.getVersion()).toBe(version)
    expect(undoDepth(c.editor.state)).toBe(depth)
    const bodyNoOp = await c.handle.execute('apply_ops', {
      ops: [{ op: 'setHeadingLevel', target: { blockIndexes: [9] }, level: 0 }],
    })
    expect(bodyNoOp.changed).toBe(false)
    expect(c.handle.getVersion()).toBe(version)
    expect(undoDepth(c.editor.state)).toBe(depth)
    expect(await entries(await c.session.save(c.editor.getJSON() as never))).toEqual(
      await entries(c.bytes),
    )
    await c.handle.execute('apply_ops', {
      ops: [{ op: 'setOutlineLevel', target: { blockIndexes: [heading.blockIndex] }, level: 3 }],
    })
    const saved = await c.session.save(c.editor.getJSON() as never),
      reopened = await openDocx(saved)
    const current = reopened.content.content![heading.blockIndex]!
    expect(current.attrs?.outlineOnly).toBe(true)
    expect(current.attrs?.level).toBe(3)
    expect(current.attrs?.styleId ?? null).toBe(node.attrs.styleId)
    expect(c.editor.state.doc.nodeAt(heading.position)!.content.eq(node.content)).toBe(true)
    expect(
      await (await JSZip.loadAsync(saved)).file('word/document.xml')!.async('string'),
    ).toContain('<w:outlineLvl w:val="2"')
  } finally {
    c.handle.dispose()
    c.editor.destroy()
  }
})
it('explicit outline can become body text and remain body after two native saves', async () => {
  const c = await setup()
  try {
    const heading = docxHeadings(c.editor.state.doc).find((entry) => entry.kind === 'outline')!
    await c.handle.execute('apply_ops', {
      ops: [{ op: 'setOutlineLevel', target: { blockIndexes: [heading.blockIndex] }, level: 0 }],
    })
    const saved = await c.session.save(c.editor.getJSON() as never),
      reopened = await openDocx(saved)
    expect(reopened.content.content![heading.blockIndex]!.type).toBe('docParagraph')
    expect(await entries(await reopened.save(reopened.content))).toEqual(await entries(saved))
  } finally {
    c.handle.dispose()
    c.editor.destroy()
  }
})
it('rejects absent native styles and protected writes before version/history changes', async () => {
  const c = await setup(true)
  try {
    const before = c.editor.getJSON(),
      version = c.handle.getVersion(),
      depth = undoDepth(c.editor.state)
    const target = captureDocxOutlineTarget(c, docxHeadings(c.editor.state.doc)[0]!)
    expect(() => assertDocxOutlineTarget(target, c)).toThrow(/只读/)
    await expect(
      c.handle.execute('apply_ops', {
        ops: [{ op: 'setHeadingLevel', target: { blockIndexes: [0] }, level: 9 }],
      }),
    ).rejects.toThrow(/只读/)
    expect(c.editor.getJSON()).toEqual(before)
    expect(c.handle.getVersion()).toBe(version)
    expect(undoDepth(c.editor.state)).toBe(depth)
  } finally {
    c.handle.dispose()
    c.editor.destroy()
  }
  const open = await setup()
  const limited = createDocxAgentHandle(open.editor, 'limited', {
    session: open.session,
    isDirty: () => false,
    onDirtyChange: () => {},
    headingLevels: [1],
  })
  try {
    await expect(
      limited.execute('apply_ops', {
        ops: [{ op: 'setHeadingLevel', target: { blockIndexes: [0] }, level: 9 }],
      }),
    ).rejects.toThrow('没有 Heading9')
  } finally {
    limited.dispose()
    open.handle.dispose()
    open.editor.destroy()
  }
})
