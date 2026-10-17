import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  compareDocxBodies,
  extractCompareBody,
  readCompareDocx,
  type CompareBody,
  DOCX_COMPARE_LIMITS,
} from './docx-compare.js'
import type { PmDocJson } from '../docx.js'
const p = (text = ''): PmDocJson => ({
  type: 'docParagraph',
  content: text ? [{ type: 'text', text }] : [],
})
const file = (bytes: Uint8Array) =>
  ({ name: 'x.docx', size: bytes.length, arrayBuffer: async () => bytes.buffer }) as File
const body = (...texts: string[]): CompareBody =>
  extractCompareBody({ type: 'doc', content: texts.map(p) })
describe('DOCX local readonly comparison', () => {
  it('preserves repeated and empty paragraphs, hard breaks, empty cells and row/cell/paragraph boundaries', () => {
    const a = extractCompareBody({
      type: 'doc',
      content: [
        p('same'),
        p(),
        p('same'),
        {
          type: 'docParagraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b' },
          ],
        },
        {
          type: 'docTable',
          content: [
            {
              type: 'docTableRow',
              content: [
                { type: 'docTableCell', content: [p('x'), p(), p('y')] },
                { type: 'docTableCell', content: [p()] },
              ],
            },
            { type: 'docTableRow', content: [] },
          ],
        },
      ],
    })
    expect(a.blocks).toEqual([
      { kind: 'paragraph', text: 'same' },
      { kind: 'paragraph', text: '' },
      { kind: 'paragraph', text: 'same' },
      { kind: 'paragraph', text: 'a\nb' },
      { kind: 'table', rows: [[['x', '', 'y'], ['']], []] },
    ])
    expect(compareDocxBodies(a, a)).toMatchObject({ added: 0, removed: 0, changed: 0 })
    const joined = structuredClone(a)
    joined.blocks[4] = { kind: 'table', rows: [[['x\n\ny'], ['']], []] }
    expect(compareDocxBodies(a, joined).changed).toBe(1)
  })
  it('pairs each contiguous 2→2 replacement in order, keeping excess additions/removals', () => {
    const result = compareDocxBodies(
      body('start', 'old1', 'old2', 'end'),
      body('start', 'new1', 'new2', 'end'),
    )
    expect(result).toMatchObject({ added: 0, removed: 0, changed: 2 })
    expect(
      result.changes.filter((c) => c.kind === 'changed').map((c) => [c.before, c.after]),
    ).toEqual([
      [
        { kind: 'paragraph', text: 'old1' },
        { kind: 'paragraph', text: 'new1' },
      ],
      [
        { kind: 'paragraph', text: 'old2' },
        { kind: 'paragraph', text: 'new2' },
      ],
    ])
    expect(compareDocxBodies(body('a', 'b'), body('x'))).toMatchObject({
      changed: 1,
      removed: 1,
      added: 0,
    })
    expect(compareDocxBodies(body(), body('', 'x'))).toMatchObject({
      changed: 0,
      removed: 0,
      added: 2,
    })
  })
  it('does not normalize whitespace or confuse repeated content with a unique paragraph', () => {
    expect(compareDocxBodies(body('x', '', 'x', ' y'), body('x', '', 'x', 'y'))).toMatchObject({
      changed: 1,
      added: 0,
      removed: 0,
    })
    expect(compareDocxBodies(body('x', 'x'), body('x'))).toMatchObject({
      changed: 0,
      removed: 1,
      added: 0,
    })
  })
  it('counts opaque/nested objects as excluded and never reads stale preview text', () => {
    const result = extractCompareBody({
      type: 'doc',
      content: [
        { type: 'docBlock', attrs: { preview: 'fake' } },
        {
          type: 'docTable',
          content: [
            {
              type: 'docTableRow',
              content: [
                {
                  type: 'docTableCell',
                  content: [
                    p('live'),
                    { type: 'docNestedTable', attrs: { preview: 'stale', model: { rows: [] } } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(result).toEqual({ blocks: [{ kind: 'table', rows: [[['live']]] }], excluded: 2 })
  })
  it('rejects excessive extraction or LCS allocation before building a quadratic matrix', () => {
    expect(() => body('x'.repeat(DOCX_COMPARE_LIMITS.characters + 1))).toThrow('20 万字')
    expect(() => body(...Array.from({ length: 2001 }, () => ''))).toThrow('2000')
    const many = body(...Array.from({ length: 1001 }, () => ''))
    expect(() => compareDocxBodies(many, many)).toThrow('运算量')
    expect(() =>
      extractCompareBody({
        type: 'doc',
        content: [
          {
            type: 'docTable',
            content: Array.from({ length: DOCX_COMPARE_LIMITS.nodes }, () => ({
              type: 'docTableRow',
              content: [],
            })),
          },
        ],
      }),
    ).toThrow('正文结构过多')
  })
  it('cancels after reading and before parsing the ZIP when its request is obsolete', async () => {
    let active = true
    const input = {
      name: 'x.docx',
      size: 3,
      arrayBuffer: async () => {
        active = false
        return new Uint8Array([1, 2, 3]).buffer
      },
    } as File
    await expect(readCompareDocx(input, () => active)).rejects.toThrow('已取消')
  })
  it('rejects size, type, malformed ZIP and decompression budgets before native parsing', async () => {
    await expect(readCompareDocx({ name: 'x.doc', size: 1 } as File)).rejects.toThrow('.docx')
    await expect(
      readCompareDocx({ name: 'x.docx', size: DOCX_COMPARE_LIMITS.inputBytes + 1 } as File),
    ).rejects.toThrow('3 MiB')
    await expect(readCompareDocx(file(new Uint8Array([1, 2, 3])))).rejects.toThrow('无法读取 DOCX')
    const zip = new JSZip()
    zip.file('word/document.xml', 'x'.repeat(DOCX_COMPARE_LIMITS.entryBytes + 1))
    await expect(
      readCompareDocx(
        file(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })),
      ),
    ).rejects.toThrow('单个部件')
  })
  it('checks part counts and cumulative expansion for compressed and uncompressed files', async () => {
    const parts = new JSZip()
    for (let i = 0; i <= DOCX_COMPARE_LIMITS.parts; i++) parts.file(`part${i}.xml`, '')
    await expect(
      readCompareDocx(file(await parts.generateAsync({ type: 'uint8array' }))),
    ).rejects.toThrow('部件数')

    const cumulative = new JSZip()
    for (let i = 0; i < 5; i++)
      cumulative.file(`part${i}.xml`, 'x'.repeat(DOCX_COMPARE_LIMITS.entryBytes))
    await expect(
      readCompareDocx(
        file(await cumulative.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })),
      ),
    ).rejects.toThrow('累计解压量')

    const uncompressed = new JSZip()
    uncompressed.file('word/document.xml', 'x'.repeat(DOCX_COMPARE_LIMITS.entryBytes + 1))
    await expect(
      readCompareDocx(file(await uncompressed.generateAsync({ type: 'uint8array' }))),
    ).rejects.toThrow('单个部件')
  })
})
