import { expect, it } from 'vitest'
import { docxReadonlyBody } from './docx-readonly.js'
import type { PmDocJson } from '../docx.js'
import type { NumberingDef } from '../../vendor/packages/docx-engine/src/types.js'
const paragraph = (
  attrs: Record<string, unknown> = {},
  marks: unknown[] = [],
  type = 'docParagraph',
): PmDocJson => ({
  type,
  attrs,
  content: [
    { type: 'text', text: 'Formatted', marks },
    { type: 'hardBreak' },
    { type: 'text', text: 'body' },
  ],
})
it('retains safe actual PM marks and verifies half-point font vs twip paragraph units', () => {
  const { blocks } = docxReadonlyBody({
    type: 'doc',
    content: [
      paragraph(
        {
          level: 9,
          align: 'center',
          lineSpacing: 1.5,
          spaceBefore: 240,
          spaceAfter: 120,
          indentLeft: 360,
          indentFirstLine: -120,
        },
        [
          { type: 'bold' },
          { type: 'italic' },
          { type: 'underline' },
          { type: 'strike' },
          {
            type: 'docTextStyle',
            attrs: {
              font: '等线',
              fontAscii: 'Courier New',
              color: '123ABC',
              sizeHalfPoints: 28,
              highlight: 'yellow',
              vertAlign: 'superscript',
            },
          },
        ],
        'docHeading',
      ),
    ],
  })
  expect(blocks[0]).toMatchObject({
    kind: 'paragraph',
    level: 9,
    style: {
      textAlign: 'center',
      lineHeight: 1.5,
      marginTop: '12pt',
      marginBottom: '6pt',
      marginInlineStart: '18pt',
      textIndent: '-6pt',
    },
    runs: [
      {
        text: 'Formatted',
        tags: ['strong', 'em', 'u', 's', 'sup'],
        style: {
          fontFamily: '"Courier New", "等线"',
          color: '#123ABC',
          fontSize: '14pt',
          backgroundColor: '#FFFF00',
        },
      },
      { text: '', break: true, tags: [], style: {} },
      { text: 'body', tags: [], style: {} },
    ],
  })
})
it('rejects raw attrs, style URLs, CSS injection, invalid numeric values, links and script-like resource data', () => {
  const { blocks } = docxReadonlyBody({
    type: 'doc',
    content: [
      paragraph(
        {
          id: 'same',
          contenteditable: true,
          onclick: 'evil()',
          style: 'background:url(https://evil.invalid)',
          align: 'left; color:red',
          lineSpacing: Infinity,
          spaceAfter: -200,
          indentLeft: NaN,
        },
        [
          { type: 'link', attrs: { href: 'javascript:evil()' } },
          {
            type: 'docTextStyle',
            attrs: {
              font: 'x"; background:url(https://evil.invalid)',
              color: 'red; color:blue',
              sizeHalfPoints: Infinity,
              highlight: '__proto__',
              shading: 'var(--evil)',
              vertAlign: 'super; transform:scale(9)',
            },
          },
        ],
      ),
    ],
  })
  expect(blocks).toEqual([
    {
      kind: 'paragraph',
      style: {},
      runs: [
        { text: 'Formatted', tags: [], style: {} },
        { text: '', break: true, tags: [], style: {} },
        { text: 'body', tags: [], style: {} },
      ],
    },
  ])
})
it('retains ordinary cell/header geometry and formatting with validated bounds; nested tables excluded', () => {
  const { blocks, excluded } = docxReadonlyBody({
    type: 'doc',
    content: [
      {
        type: 'docTable',
        attrs: { tblFill: 'FFFFAA' },
        content: [
          {
            type: 'docTableRow',
            content: [
              {
                type: 'docTableHeader',
                attrs: {
                  colspan: 2,
                  rowspan: 2,
                  colwidth: [100, 150],
                  fill: 'ABCDEF',
                  color: '123456',
                  bold: true,
                  align: 'right',
                  vAlign: 'center',
                  cellMar: { top: 120, left: 240 },
                },
                content: [paragraph(), { type: 'docNestedTable', attrs: { preview: 'stale' } }],
              },
              {
                type: 'docTableCell',
                attrs: { colspan: Infinity, rowspan: -1, fill: 'url(x)', colwidth: [NaN] },
                content: [paragraph()],
              },
            ],
          },
        ],
      },
    ],
  })
  expect(excluded).toBe(1)
  expect(blocks[0]).toMatchObject({
    kind: 'table',
    style: { backgroundColor: '#FFFFAA' },
    rows: [
      [
        {
          header: true,
          colSpan: 2,
          rowSpan: 2,
          style: {
            width: 250,
            backgroundColor: '#ABCDEF',
            color: '#123456',
            fontWeight: 'bold',
            textAlign: 'right',
            verticalAlign: 'middle',
            paddingTop: '6pt',
            paddingLeft: '12pt',
          },
        },
        { header: false, colSpan: 1, rowSpan: 1, style: {} },
      ],
    ],
  })
})
it('keeps ordered list text with bounded nesting and separate numbering identity', () => {
  const { blocks } = docxReadonlyBody({
    type: 'doc',
    content: [
      paragraph({ kind: 'ordered', ilvl: 1, numId: 'a' }, [], 'docListItem'),
      paragraph({ kind: 'ordered', ilvl: 1, numId: 'a' }, [], 'docListItem'),
      paragraph({ kind: 'bullet', ilvl: 500 }, [], 'docListItem'),
    ],
  })
  expect(blocks).toMatchObject([
    { list: 'ordered', listLevel: 1, marker: undefined },
    { list: 'ordered', listLevel: 1, marker: undefined },
    { list: 'bullet', listLevel: 0 },
  ])
})

const numbering = (): Map<string, NumberingDef> =>
  new Map([
    [
      '17',
      {
        numId: '17',
        abstractNumId: '7',
        startOverrides: { 0: 5 },
        levels: {
          0: { numFmt: 'decimal', lvlText: '%1.', start: 1 },
          1: { numFmt: 'lowerLetter', lvlText: '%2)', start: 2 },
        },
      },
    ],
  ])
const list = (ilvl = 0, attrs: Record<string, unknown> = {}): PmDocJson =>
  paragraph({ kind: 'ordered', numId: '17', ilvl, ...attrs }, [], 'docListItem')
it('uses native start overrides, multilevel labels, protected continuations and tracked deletion counters', () => {
  const body = docxReadonlyBody({ type: 'doc', content: [list(), list(1), list()] }, numbering())
  expect(body.blocks.map((block) => (block.kind === 'paragraph' ? block.marker : null))).toEqual([
    '5.',
    'b)',
    '6.',
  ])
  expect(body.unsupportedMarkers).toBe(0)
  const continued = docxReadonlyBody(
    {
      type: 'doc',
      content: [
        list(),
        { type: 'docProtected', attrs: { strayList: { numId: '17', ilvl: 0 } } },
        {
          type: 'docTable',
          content: [
            {
              type: 'docTableRow',
              content: [
                { type: 'docTableCell', content: [list(0, { paraMarkDel: true }), list()] },
              ],
            },
          ],
        },
        list(),
      ],
    },
    numbering(),
  )
  expect(continued.blocks[0]).toMatchObject({ marker: '5.' })
  expect(continued.blocks[1]).toMatchObject({
    rows: [[{ paragraphs: [{ marker: '7.' }, { marker: '7.' }] }]],
  })
  expect(continued.blocks[2]).toMatchObject({ marker: '8.' })
})
it('discloses unsupported markers without inventing digits or retaining image URLs', () => {
  const defs = numbering()
  defs.set('picture', {
    numId: 'picture',
    abstractNumId: 'picture',
    startOverrides: {},
    levels: {
      0: {
        numFmt: 'bullet',
        lvlText: 'x',
        start: 1,
        picBulletId: 3,
        picBulletSrc: 'https://foreign.invalid/bullet.png',
      },
    },
  })
  defs.set('missingPicture', {
    numId: 'missingPicture',
    abstractNumId: 'missingPicture',
    startOverrides: {},
    levels: { 0: { numFmt: 'bullet', lvlText: 'x', start: 1, picBulletId: 3 } },
  })
  const body = docxReadonlyBody(
    {
      type: 'doc',
      content: [
        list(0, { numId: 'unknown' }),
        list(0, { numId: 'picture' }),
        list(0, { numId: 'missingPicture' }),
      ],
    },
    defs,
  )
  expect(body.unsupportedMarkers).toBe(3)
  expect(body.blocks).toMatchObject([
    { marker: undefined },
    { marker: undefined },
    { marker: undefined },
  ])
  expect(JSON.stringify(body)).not.toContain('foreign.invalid')
})
