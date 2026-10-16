// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import type {
  ParsedDoc,
  SectionInfo,
  SectionSettings,
} from '../vendor/packages/docx-engine/src/types.js'
import {
  clearEndnoteDecorations,
  clearEndnoteGaps,
  liveEndnoteGroups,
  syncEndnoteDecorations,
} from './docx-endnotes.js'
import { assignLiveBlockSections } from './pagination-geometry.js'
import type { BlockBox } from '../vendor/apps/docs/src/renderer/pagination-types.js'
function section(first: number, last: number, pos: 'sectEnd' | 'docEnd'): SectionInfo {
  return {
    firstBlockIndex: first,
    lastBlockIndex: last,
    startType: 'continuous',
    sectPrXml: '',
    titlePg: false,
    headerRefs: {},
    footerRefs: {},
    settings: {
      pageWidth: 9000,
      pageHeight: 12000,
      marginLeft: 900,
      marginRight: 900,
      marginTop: 900,
      marginBottom: 900,
      endnotePr: { pos },
    } as SectionSettings,
  }
}
function editor() {
  return new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [
        {
          type: 'docParagraph',
          content: [
            { type: 'text', text: '第一节' },
            { type: 'docNoteRef', attrs: { kind: 'endnote', id: '1', no: 1 } },
          ],
        },
        {
          type: 'docParagraph',
          content: [
            { type: 'text', text: '第二节' },
            { type: 'docNoteRef', attrs: { kind: 'endnote', id: '2', no: 2 } },
          ],
        },
      ],
    },
  })
}
const parsed = {
  styles: new Map(),
  endnotes: [
    { id: '1', text: '第一节的尾注' },
    { id: '2', text: '第二节的尾注' },
  ],
} as ParsedDoc

describe('live section/document endnote flow', () => {
  it('puts sectEnd notes before the next section and docEnd notes at document end without changing save content', () => {
    const doc = editor()
    const source = doc.getJSON()
    const sections = [section(0, 0, 'sectEnd'), section(1, 1, 'docEnd')]
    const groups = liveEndnoteGroups(doc, parsed, sections)
    expect(
      groups.map((group) => ({ section: group.section, ids: group.items.map((item) => item.id) })),
    ).toEqual([
      { section: 0, ids: ['1'] },
      { section: 1, ids: ['2'] },
    ])
    syncEndnoteDecorations(doc, groups, sections)
    expect(doc.view.dom.textContent).toBe('第一节ii第一节的尾注第二节iii第二节的尾注')
    expect(doc.getJSON()).toEqual(source)
    const blocks = Array.from(doc.view.dom.children).map((el, index) => ({
      el: el as HTMLElement,
      top: index * 20,
      height: 20,
    })) as BlockBox[]
    assignLiveBlockSections(doc.view.dom, blocks, sections)
    expect(blocks.map((block) => block.section)).toEqual([0, 0, 1, 1])
    expect(blocks.filter((block) => block.isEndnotes)).toHaveLength(2)
    const widget = doc.view.dom.querySelector('.mimir-docx-endnotes')!
    const gap = document.createElement('div')
    gap.className = 'page-gap page-gap-inline mimir-endnote-gap'
    widget.append(gap)
    clearEndnoteGaps(doc.view.dom)
    expect(doc.view.dom.querySelector('.mimir-endnote-gap')).toBeNull()
    expect(doc.getJSON()).toEqual(source)
    clearEndnoteDecorations(doc)
    expect(doc.view.dom.querySelector('.mimir-docx-endnotes')).toBeNull()
    doc.destroy()
  })
  it('honors the document default and removes undone references instead of retaining orphan note bodies', () => {
    const doc = editor()
    const sections = [section(0, 0, 'docEnd'), section(1, 1, 'docEnd')]
    delete sections[0]!.settings.endnotePr
    delete sections[1]!.settings.endnotePr
    const document = { ...parsed, endnoteProps: { pos: 'sectEnd' as const } }
    expect(liveEndnoteGroups(doc, document, sections).map((group) => group.section)).toEqual([0, 1])
    const groups = liveEndnoteGroups(doc, parsed, sections)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.section).toBe(1)
    syncEndnoteDecorations(doc, groups, sections)
    doc.commands.setContent({
      type: 'doc',
      content: [{ type: 'docParagraph', content: [{ type: 'text', text: '无引用' }] }],
    })
    syncEndnoteDecorations(doc, liveEndnoteGroups(doc, parsed, sections), sections)
    expect(doc.view.dom.querySelector('.mimir-docx-endnotes')).toBeNull()
    doc.destroy()
  })
})
