// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import { createDocxAgentHandle } from './agent/docx-agent.js'
import { openDocx } from './docx.js'
import { liveDocxStyleState } from './docx-styles.js'
const fixture = join(
  import.meta.dirname,
  '../vendor/apps/docs/tests/pagination-corpus/docx/01-simple-english.docx',
)
async function setup(bytes: Uint8Array = new Uint8Array(readFileSync(fixture))) {
  const session = await openDocx(bytes)
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: session.content as never,
  })
  const options = { current: {} as SaveOptions }
  const handle = createDocxAgentHandle(editor, 'styles-test', {
    session,
    saveOptions: options,
    isDirty: () => true,
    onDirtyChange: () => {},
  })
  return {
    session,
    editor,
    options,
    handle,
    cleanup: () => {
      handle.dispose()
      editor.destroy()
    },
  }
}
describe('DOCX native styles', () => {
  it('merges repeated definitions, resolves inheritance live, applies paragraph style and independently reopens twice', async () => {
    const first = await setup()
    try {
      await first.handle.execute('define_style', {
        styleId: 'MimirBase',
        name: '基础',
        run: { color: '#123456', fontSize: 18 },
      })
      await first.handle.execute('define_style', {
        styleId: 'MimirBase',
        paragraph: { spaceAfter: 12 },
      })
      await first.handle.execute('define_style', {
        styleId: 'MimirChild',
        name: '继承',
        basedOn: 'MimirBase',
        run: { bold: true },
      })
      const live = await liveDocxStyleState(first.session, first.options.current)
      expect(live.styles.get('MimirChild')?.display).toMatchObject({
        color: '123456',
        sizeHalfPoints: 36,
        bold: true,
        spaceAfterTwips: 240,
      })
      const target = first.handle
        .getContext()
        .blocks.find((block) => block.type === 'docParagraph')!.index
      expect(
        (
          await first.handle.execute('apply_style', {
            styleId: 'MimirChild',
            fromBlockIndex: target,
          })
        ).changed,
      ).toBe(true)
      expect(
        (
          await first.handle.execute('apply_style', {
            styleId: 'MimirChild',
            fromBlockIndex: target,
          })
        ).changed,
      ).toBe(false)
      await expect(
        first.handle.execute('apply_style', {
          styleId: 'MimirChild',
          fromBlockIndex: 0,
          toBlockIndex: Number.MAX_SAFE_INTEGER,
        }),
      ).rejects.toThrow('范围无效')
      const bytes = await first.session.save(first.editor.getJSON() as never, first.options.current)
      const xml = await (await JSZip.loadAsync(bytes)).file('word/styles.xml')!.async('string')
      expect(xml).toContain('w:styleId="MimirChild"')
      expect(xml).toContain('w:after="240"')
      const second = await setup(bytes)
      try {
        expect(second.editor.state.doc.child(target).attrs.styleId).toBe('MimirChild')
        await second.handle.execute('define_style', { styleId: 'MimirBase', run: { italic: true } })
        const reopened = await openDocx(
          await second.session.save(second.editor.getJSON() as never, second.options.current),
        )
        expect(reopened.footnotes.parsed.styles.get('MimirChild')?.display).toMatchObject({
          bold: true,
          italic: true,
          color: '123456',
          spaceAfterTwips: 240,
        })
      } finally {
        second.cleanup()
      }
      await expect(
        first.handle.execute('define_style', { styleId: 'MimirBase', basedOn: 'MimirChild' }),
      ).rejects.toThrow('循环')
    } finally {
      first.cleanup()
    }
  })
  it('applies character styles only to frozen selected text and preserves direct marks', async () => {
    const state = await setup()
    try {
      state.editor.commands.setContent({
        type: 'doc',
        content: [
          {
            type: 'docParagraph',
            content: [
              {
                type: 'text',
                text: 'abcdef',
                marks: [{ type: 'bold' }, { type: 'docTextStyle', attrs: { color: '123456' } }],
              },
            ],
          },
        ],
      })
      await state.handle.execute('define_style', {
        styleId: 'MimirChar',
        type: 'character',
        name: '字符',
        run: { italic: true },
      })
      await state.handle.execute('apply_style', { styleId: 'MimirChar', from: 2, to: 4 })
      const children = state.editor.getJSON().content![0]!.content!
      expect(
        children.map((child) => [
          'text' in child ? child.text : undefined,
          child.marks?.find((mark) => mark.type === 'docTextStyle')?.attrs?.styleId,
        ]),
      ).toEqual([
        ['a', null],
        ['bc', 'MimirChar'],
        ['def', null],
      ])
      expect(children[1]!.marks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'bold' }),
          expect.objectContaining({
            type: 'docTextStyle',
            attrs: expect.objectContaining({ color: '123456' }),
          }),
        ]),
      )
      const reopened = await openDocx(
        await state.session.save(state.editor.getJSON() as never, state.options.current),
      )
      expect(
        reopened.blocks
          .find((block) => block.runs?.some((run) => run.text === 'bc'))
          ?.runs?.find((run) => run.text === 'bc')?.styleId,
      ).toBe('MimirChar')
    } finally {
      state.cleanup()
    }
  })
})
