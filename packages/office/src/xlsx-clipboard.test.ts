import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createXlsxClipboard,
  externalClipboardOperations,
  serializeRange,
  clipboardMarker,
  type ClipboardContext,
} from './xlsx-clipboard.js'
import type { XlsxAgentHandle } from './agent/xlsx-agent.js'
import type { XlsxSheet } from './xlsx.js'
afterEach(() => vi.unstubAllGlobals())
const sheet: XlsxSheet = {
  id: 'sheet-1',
  name: '源表',
  entry: 'xl/worksheets/sheet1.xml',
  columns: [],
  rows: [
    {
      number: 1,
      height: 20,
      cells: [
        {
          col: 0,
          text: 'a\tb\n"c"',
          rowSpan: 1,
          colSpan: 1,
          format: { bold: true, fontColor: '#123456' },
        },
        { col: 1, text: 'false', boolean: true, rowSpan: 1, colSpan: 1 },
      ],
    },
  ],
}
function setup() {
  let version = 0
  const execute = vi.fn<XlsxAgentHandle['execute']>(async () => {
    version++
    return { ok: true }
  })
  const handle = {
    documentId: 'doc',
    getVersion: () => version,
    currentBytes: () => new Uint8Array([1, 2]),
    execute,
  } as unknown as XlsxAgentHandle
  const context: ClipboardContext = { documentId: 'doc', handle, sheet, range: 'A1:B1', version: 0 }
  const controller = createXlsxClipboard()
  controller.sync('source', 'doc', 0)
  return {
    controller,
    context,
    execute,
    setVersion: (v: number) => {
      version = v
    },
  }
}
describe('XLSX native range clipboard identity and transactions', () => {
  it('captures exact source and dual display payload without writing; cross-sheet cut submits exactly one move', async () => {
    const app = setup(),
      payload = app.controller.arm(app.context, 'cut')
    expect(app.execute).not.toHaveBeenCalled()
    expect(payload.plain).toBe('"a\tb\n""c"""\tFALSE')
    expect(payload.html).toContain('font-weight:bold')
    expect(clipboardMarker(payload.html)).toBe(app.controller.getSnapshot().capture!.id)
    const frozen = app.controller.getSnapshot().capture!
    expect(frozen.bytes).toEqual(new Uint8Array([1, 2]))
    const target = { ...app.context, sheet: { ...sheet, id: 'sheet-2', name: '目标' }, range: 'C3' }
    app.controller.sync('target', 'doc', 0)
    await app.controller.apply(target, payload)
    expect(app.execute).toHaveBeenCalledExactlyOnceWith(
      'propose_operations',
      {
        operations: [
          {
            op: 'move_range',
            sheetId: 'sheet-2',
            sourceSheetId: 'sheet-1',
            source: 'A1:B1',
            target: 'C3',
          },
        ],
      },
      { expectedVersion: 0, signal: expect.any(AbortSignal) },
    )
    expect(app.controller.getSnapshot().capture).toBeNull()
    expect(app.controller.getSnapshot().message).toContain('重新复制')
  })
  it('refuses stale internal marker without reinterpreting its matching plain text', async () => {
    const app = setup(),
      payload = app.controller.arm(app.context, 'cut')
    app.setVersion(1)
    app.controller.sync('target', 'doc', 1)
    await app.controller.apply({ ...app.context, range: 'D2', version: 1 }, payload)
    expect(app.execute).not.toHaveBeenCalled()
    expect(app.controller.getSnapshot().error).toContain('失效')
    expect(app.controller.getSnapshot().capture?.kind).toBe('cut')
  })
  it('retains failed cut for retry and never submits copy plus clear', async () => {
    const app = setup()
    app.controller.arm(app.context, 'cut')
    app.execute.mockRejectedValueOnce(new Error('目标已保护'))
    const target = { ...app.context, range: 'D2' }
    await app.controller.apply(target, null)
    expect(app.controller.getSnapshot().capture?.kind).toBe('cut')
    expect(app.controller.getSnapshot().error).toBe('目标已保护')
    await app.controller.apply(target, null)
    expect(app.execute).toHaveBeenCalledTimes(2)
    expect(app.controller.getSnapshot().capture).toBeNull()
  })
  it('cancels pending reads on target changes and does not resurrect A→B→A content', async () => {
    const app = setup()
    let finish!: (value: { plain: string; html: string }) => void
    const read = app.controller.read(
      app.context,
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    app.controller.sync('other', 'doc', 0)
    app.controller.sync('source', 'doc', 0)
    finish({ plain: 'old', html: '' })
    await read
    expect(app.controller.getSnapshot().payload).toBeNull()
    expect(app.controller.getSnapshot().busy).toBe(false)
  })
  it('aborts pending native paste on context change and prevents same-tick duplicate paste', async () => {
    const app = setup()
    app.controller.arm(app.context, 'copy')
    let finish!: () => void
    app.execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: true })
        }),
    )
    const first = app.controller.apply({ ...app.context, range: 'D2' }, null)
    await app.controller.apply({ ...app.context, range: 'D2' }, null)
    expect(app.execute).toHaveBeenCalledOnce()
    const signal = app.execute.mock.calls[0]![2]!.signal!
    app.controller.sync('changed', 'doc', 0)
    expect(signal.aborted).toBe(true)
    finish()
    await first
    expect(app.controller.getSnapshot().capture).not.toBeNull()
  })
  it.each(['read', 'apply'] as const)(
    'cancels pending %s when the same document reloads at the same version',
    async (kind) => {
      const app = setup()
      app.controller.sync('source', 'doc', 0, new Uint8Array([1, 2]))
      app.controller.arm(app.context, 'copy')
      let finish!: () => void
      const pending =
        kind === 'read'
          ? app.controller.read(
              app.context,
              () =>
                new Promise((resolve) => {
                  finish = () => resolve({ plain: 'old-source', html: '' })
                }),
            )
          : (() => {
              app.execute.mockImplementationOnce(
                () =>
                  new Promise((resolve) => {
                    finish = () => resolve({ ok: true })
                  }),
              )
              return app.controller.apply({ ...app.context, range: 'D2' }, null)
            })()
      app.controller.sync('source', 'doc', 0, new Uint8Array([3, 4]))
      expect(app.execute.mock.calls.map((call) => call[2]?.signal?.aborted)).toEqual(
        kind === 'apply' ? [true] : [],
      )
      finish()
      await pending
      expect(app.controller.getSnapshot()).toMatchObject({
        capture: null,
        payload: null,
        busy: false,
        message: '',
      })
    },
  )
  it.each(['read', 'apply'] as const)(
    'keeps a user draft that replaces a pending %s',
    async (kind) => {
      const app = setup()
      app.controller.arm(app.context, 'cut')
      let finish!: () => void
      const pending =
        kind === 'read'
          ? app.controller.read(
              app.context,
              () =>
                new Promise((resolve) => {
                  finish = () => resolve({ plain: 'old-reader-result', html: '' })
                }),
            )
          : (() => {
              app.execute.mockImplementationOnce(
                () =>
                  new Promise((resolve) => {
                    finish = () => resolve({ ok: true })
                  }),
              )
              return app.controller.apply({ ...app.context, range: 'D2' }, null)
            })()
      app.controller.stage({ plain: 'new user input', html: '' })
      expect(app.execute.mock.calls.map((call) => call[2]?.signal?.aborted)).toEqual(
        kind === 'apply' ? [true] : [],
      )
      finish()
      await pending
      expect(app.controller.getSnapshot().payload?.plain).toBe('new user input')
      expect(app.controller.getSnapshot().capture?.kind).toBe('cut')
      expect(app.controller.getSnapshot().busy).toBe(false)
      expect(app.controller.getSnapshot().message).not.toContain('已粘贴')
    },
  )
  it('rejects another handle/document and mismatched multi-cell target, preserving source', async () => {
    const app = setup()
    const payload = app.controller.arm(app.context, 'copy')
    await app.controller.apply({ ...app.context, range: 'D2:D8' }, payload)
    expect(app.controller.getSnapshot().error).toContain('暂不支持重复平铺')
    await app.controller.apply({ ...app.context, documentId: 'other' }, payload)
    expect(app.execute).not.toHaveBeenCalled()
  })
})
describe('bounded external clipboard interoperability', () => {
  it('exports escaped display HTML and parses explicit basic styles into one batch while keeping formula-like HTML text literal', () => {
    const payload = {
      plain: 'fallback',
      html: '<table><tr><td style="font-weight:bold;color:#123456;font-size:16px;text-align:right">=A1+1</td><td>0012<br>&lt;x&gt;</td></tr></table>',
    }
    expect(externalClipboardOperations(payload, 'sheet-2', 'C4')).toEqual([
      { op: 'set_range', sheetId: 'sheet-2', start: 'C4', values: [[null, '0012\n<x>']] },
      { op: 'set_cell', sheetId: 'sheet-2', address: 'C4', value: '=A1+1' },
      {
        op: 'format_range',
        sheetId: 'sheet-2',
        range: 'C4',
        format: { bold: true, fontColor: '#123456', fontSize: 12, horizontalAlign: 'right' },
      },
    ])
    expect(serializeRange(sheet, 'A1:B1', 'opaque').html).toContain('&quot;c&quot;')
  })
  it('requires deliberate values-only for unsupported styles and retains literal leading zeroes', () => {
    const payload = {
      plain: '1',
      html: '<table class="excel"><tr><td style="border:1px solid red">001</td></tr></table>',
    }
    expect(() => externalClipboardOperations(payload, 'sheet-1', 'C1')).toThrow('仅粘贴显示值')
    expect(externalClipboardOperations(payload, 'sheet-1', 'C1', true)).toEqual([
      { op: 'set_range', sheetId: 'sheet-1', start: 'C1', values: [['001']] },
    ])
  })
  it('rejects unsafe/ambiguous/merged/over-budget HTML, rather than silently dropping it', () => {
    for (const html of [
      '<table><tr><td rowspan="2">x</td></tr></table>',
      '<table><tr><td><img src="https://bad/x"></td></tr></table>',
      '<table><tr><td>x</td></tr></table><table></table>',
    ])
      expect(() => externalClipboardOperations({ plain: 'x', html }, 'sheet-1', 'A1')).toThrow(
        /HTML/,
      )
    expect(() =>
      externalClipboardOperations(
        {
          plain: 'x',
          html:
            '<table><tr>' +
            Array.from({ length: 50 }, () => '<td style="font-weight:bold">x</td>').join('') +
            '</tr></table>',
        },
        'sheet-1',
        'A1',
      ),
    ).toThrow('50项预算')
    expect(() => clipboardMarker('x'.repeat(1024 * 1024 + 1))).toThrow('1MiB')
  })
  it('keeps existing plain scalar and formula inference and explicit CSV import', () => {
    expect(
      externalClipboardOperations({ plain: 'true\t12\t=A1+1', html: '' }, 'sheet-1', 'A1')[0],
    ).toMatchObject({ values: [[true, 12, '=A1+1']] })
    expect(
      externalClipboardOperations(
        { plain: '"a,b",false', html: '', delimiter: ',' },
        'sheet-1',
        'A1',
      )[0],
    ).toMatchObject({ values: [['a,b', false]] })
  })
})

it('writes both supported system MIME types and retains internal source if permission is denied', async () => {
  class Item {
    constructor(readonly payload: Record<string, Blob>) {}
  }
  const write = vi.fn<(_items: Item[]) => Promise<void>>(async () => {})
  vi.stubGlobal('ClipboardItem', Item)
  vi.stubGlobal('navigator', { clipboard: { write } })
  const app = setup()
  await app.controller.copy(app.context, 'copy')
  expect(Object.keys(write.mock.calls[0]![0][0]!.payload)).toEqual(['text/plain', 'text/html'])
  expect(app.controller.getSnapshot().message).toContain('HTML基础格式子集')
  write.mockRejectedValueOnce(new Error('系统权限拒绝'))
  await app.controller.copy(app.context, 'cut')
  expect(app.controller.getSnapshot().capture?.kind).toBe('cut')
  expect(app.controller.getSnapshot().error).toBe('系统权限拒绝')
  expect(app.execute).not.toHaveBeenCalled()
})
it('rejects protected cut source/target while allowing read-only copy and cancels a read after workbook version changes', async () => {
  const app = setup(),
    protectedContext = {
      ...app.context,
      sheet: { ...sheet, extras: { protected: true } },
    } as ClipboardContext
  expect(() => app.controller.arm(protectedContext, 'cut')).toThrow('剪切源工作表已保护')
  app.controller.arm(protectedContext, 'copy')
  await app.controller.apply({ ...protectedContext, range: 'D2' }, null)
  expect(app.controller.getSnapshot().error).toBe('目标工作表已保护')
  expect(app.execute).not.toHaveBeenCalled()
  let finish!: (payload: { plain: string; html: string }) => void
  const read = app.controller.read(
    app.context,
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  app.setVersion(1)
  app.controller.sync('source', 'doc', 1)
  finish({ plain: 'old', html: '' })
  await read
  expect(app.controller.getSnapshot().payload).toBeNull()
  expect(app.controller.getSnapshot().stale).toBe(true)
})
