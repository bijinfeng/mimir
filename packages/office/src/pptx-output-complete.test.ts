/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { openPptxForEdit } from './pptx.js'
import { renderDeck } from './pptx-render.js'
import {
  buildPptxCopy,
  buildPptxOutput,
  pptxCopyFilename,
  pptxOutputIndices,
  pptxPrintDocument,
  pptxPrintPageCount,
  pptxPrintPageSize,
  printPptx,
} from './pptx-output.js'
const fixture = (name = 'title-layout.pptx') =>
  new Uint8Array(
    readFileSync(pathResolve(dirname(fileURLToPath(import.meta.url)), `../tests/fixtures/${name}`)),
  )
afterEach(() => vi.restoreAllMocks())
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
function popup(ready: Promise<void>) {
  let printed = document.implementation.createHTMLDocument()
  const fake = {
    closed: false,
    opener: window,
    document: {
      open: vi.fn<(...args: unknown[]) => void>(),
      close: vi.fn<(...args: unknown[]) => void>(),
      write: vi.fn<(html: string) => void>((html) => {
        printed = new DOMParser().parseFromString(html, 'text/html')
      }),
      fonts: { ready },
      images: [],
      querySelectorAll: (selector: string) => printed.querySelectorAll(selector),
      createElement: vi.fn<(tag: 'img') => HTMLImageElement>((tag) => document.createElement(tag)),
    },
    addEventListener: vi.fn<(...args: unknown[]) => void>(),
    focus: vi.fn<(...args: unknown[]) => void>(),
    print: vi.fn<(...args: unknown[]) => void>(),
    close: vi.fn<() => void>(() => {
      fake.closed = true
    }),
  }
  vi.spyOn(window, 'open').mockReturnValue(fake as unknown as Window)
  return fake
}
describe('PPTX native copy and print completeness', () => {
  it('serializes unsaved native text and preserves every unrelated package entry and media relationship', async () => {
    const original = fixture('image-deck.pptx')
    const session = await openPptxForEdit(original)
    const text = session.slides()[0]!.elements.find((el) => el.type === 'text')!
    session.setText(0, text.id, [{ runs: [{ text: '当前未保存的副本' }] }])
    const controller = new AbortController()
    const save = vi.fn<(options: { signal: AbortSignal }) => Promise<Uint8Array>>(
      async ({ signal }) => {
        expect(signal).toBe(controller.signal)
        return session.save()
      },
    )
    const copy = await buildPptxCopy(save, '客户审阅.PPTX', {
      signal: controller.signal,
      isCurrent: () => true,
    })
    expect(copy.name).toBe('客户审阅.pptx')
    const source = await JSZip.loadAsync(original),
      result = await JSZip.loadAsync(copy.bytes)
    expect(Object.keys(result.files).toSorted()).toEqual(Object.keys(source.files).toSorted())
    for (const [path, entry] of Object.entries(source.files)) {
      if (entry.dir || path === session.slides()[0]!.path) continue
      expect(await result.file(path)!.async('uint8array')).toEqual(await entry.async('uint8array'))
    }
    expect(await result.file(session.slides()[0]!.path)!.async('string')).toContain(
      '当前未保存的副本',
    )
    expect(
      (await openPptxForEdit(copy.bytes)).slides()[0]!.elements.some((el) => el.type === 'picture'),
    ).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('validates filenames before serialization and rejects late/cancelled or failed native bytes', async () => {
    expect(pptxCopyFilename('  报告 .pptx ')).toBe('报告.pptx')
    for (const name of ['', '../report', 'bad\\name', 'x?.pptx', '.'])
      expect(() => pptxCopyFilename(name)).toThrow('文件名')
    const controller = new AbortController()
    const pending = deferred<Uint8Array>()
    const save = vi.fn<() => Promise<Uint8Array>>(() => pending.promise)
    let current = true
    const result = buildPptxCopy(save, 'draft', {
      signal: controller.signal,
      isCurrent: () => current,
    })
    current = false
    pending.resolve(new Uint8Array([1]))
    await expect(result).rejects.toThrow('文稿已更改')
    const another = new AbortController(),
      later = deferred<Uint8Array>()
    const cancelled = buildPptxCopy(() => later.promise, 'copy', { signal: another.signal })
    another.abort()
    await expect(cancelled).rejects.toThrow(/abort/i)
    later.resolve(new Uint8Array([1]))
    await expect(
      buildPptxCopy(
        async () => {
          throw new Error('真实序列化失败')
        },
        'copy',
        { signal: controller.signal },
      ),
    ).rejects.toThrow('真实序列化失败')
  })
  it('keeps ordered ranges and creates full/notes/2/3/6 print sheets with A4 orientation and escaped notes', async () => {
    const session = await openPptxForEdit(fixture())
    for (let i = 0; i < 6; i++) session.duplicate(0)
    const pages = renderDeck(session.view(), { fitWidthPx: 320, svgIdPrefix: 'output-test' })
    expect(pptxOutputIndices('7,1-3,2', 7)).toEqual([0, 1, 2, 6])
    for (const [layout, count] of [
      ['full', 7],
      ['notes', 7],
      ['handout2', 4],
      ['handout3', 3],
      ['handout6', 2],
    ] as const) {
      const html = pptxPrintDocument(pages, 720, 405, {
        layout,
        notes: ['<script>alert("x")</script>\nA&B'],
        orientation: 'landscape',
        frame: true,
      })
      const doc = new DOMParser().parseFromString(html, 'text/html')
      expect(doc.querySelectorAll('section.page')).toHaveLength(count)
      expect(pptxPrintPageCount(7, layout)).toBe(count)
      expect(doc.querySelectorAll('.slide svg')).toHaveLength(7)
      expect([...doc.querySelectorAll('svg')].map((el) => el.id)).toEqual(
        pages.map(
          (page) => new DOMParser().parseFromString(page.svg, 'text/html').querySelector('svg')!.id,
        ),
      )
      expect(doc.querySelectorAll('script')).toHaveLength(0)
      expect(doc.querySelector('.note')?.textContent ?? '').toBe(
        layout === 'notes' ? '<script>alert("x")</script>\nA&B' : '',
      )
      expect(doc.querySelectorAll('.rules')).toHaveLength(layout === 'handout3' ? 7 : 0)
      expect(html).toContain(
        layout === 'full'
          ? '@page{size:720pt 405pt;margin:0}'
          : '@page{size:841.68pt 595.44pt;margin:0}',
      )
    }
    expect(pptxPrintPageSize(720, 405)).toEqual({ width: 720, height: 405 })
    expect(pptxPrintPageSize(720, 405, { layout: 'notes' })).toEqual({
      width: 595.44,
      height: 841.68,
    })
    expect(() => pptxPrintPageSize(NaN, 0)).toThrow('尺寸')
  })
  it('freezes all render pages before asynchronous rasterization and rejects an output invalidated mid-flight', async () => {
    const session = await openPptxForEdit(fixture())
    session.duplicate(0)
    const pending = deferred<Uint8Array<ArrayBuffer>>()
    const seen: string[] = []
    const result = buildPptxOutput(
      session.view(),
      { format: 'png', indices: [0, 1], width: 1280 },
      async (svg) => {
        seen.push(svg)
        return seen.length === 1 ? pending.promise : new Uint8Array([2])
      },
    )
    const text = session.slides()[1]!.elements.find((el) => el.type === 'text')!
    session.setText(1, text.id, [{ runs: [{ text: '不能混入旧输出' }] }])
    pending.resolve(new Uint8Array([1]))
    await result
    expect(seen).toHaveLength(2)
    expect(seen[1]).not.toContain('不能混入旧输出')
    let current = true
    await expect(
      buildPptxOutput(
        session.view(),
        { format: 'png', indices: [0], width: 1280, isCurrent: () => current },
        async () => {
          current = false
          return new Uint8Array([1])
        },
      ),
    ).rejects.toThrow('文稿已更改')
  })
  it('opens a real print job only after readiness and closes cancelled/stale/error popups without printing', async () => {
    const session = await openPptxForEdit(fixture())
    const ready = deferred<void>(),
      fake = popup(ready.promise)
    const controller = new AbortController()
    const result = printPptx(session.view(), [0], {
      signal: controller.signal,
      layout: 'notes',
      notes: ['备注 <img>'],
    })
    expect(fake.document.write).toHaveBeenCalledWith(expect.stringContaining('备注 &lt;img&gt;'))
    expect(fake.print).not.toHaveBeenCalled()
    controller.abort()
    await expect(result).rejects.toThrow(/abort/i)
    expect(fake.close).toHaveBeenCalledTimes(1)
    ready.resolve()
    await Promise.resolve()
    expect(fake.print).not.toHaveBeenCalled()
    const ready2 = deferred<void>(),
      fake2 = popup(ready2.promise)
    let current = true
    const stale = printPptx(session.view(), [0], { isCurrent: () => current })
    current = false
    ready2.resolve()
    await expect(stale).rejects.toThrow('文稿已更改')
    expect(fake2.print).not.toHaveBeenCalled()
    expect(fake2.close).toHaveBeenCalledTimes(1)
    const failed = popup(Promise.reject(new Error('字体载入失败')))
    await expect(printPptx(session.view(), [0])).rejects.toThrow('字体载入失败')
    expect(failed.print).not.toHaveBeenCalled()
    const success = popup(Promise.resolve())
    await printPptx(session.view(), [0])
    expect(success.print).toHaveBeenCalledTimes(1)
    expect(success.focus).toHaveBeenCalledTimes(1)
  })
  it('waits for embedded SVG media omitted by document.images and closes on decode failure', async () => {
    const session = await openPptxForEdit(fixture('image-deck.pptx'))
    const media = deferred<void>(),
      fake = popup(Promise.resolve())
    const image = document.createElement('img')
    const decode = vi.spyOn(image, 'decode').mockReturnValue(media.promise)
    fake.document.createElement.mockReturnValue(image)
    const result = printPptx(session.view(), [0])
    expect(fake.document.querySelectorAll('svg image').length).toBeGreaterThan(0)
    expect(fake.document.images).toHaveLength(0)
    expect(decode).toHaveBeenCalledTimes(1)
    expect(image.src).toMatch(/^data:image\//)
    await Promise.resolve()
    expect(fake.print).not.toHaveBeenCalled()
    media.resolve()
    await result
    expect(fake.print).toHaveBeenCalledTimes(1)

    const failed = popup(Promise.resolve())
    const broken = document.createElement('img')
    vi.spyOn(broken, 'decode').mockRejectedValue(new Error('图片解码失败'))
    failed.document.createElement.mockReturnValue(broken)
    await expect(printPptx(session.view(), [0])).rejects.toThrow('图片解码失败')
    expect(failed.print).not.toHaveBeenCalled()
    expect(failed.close).toHaveBeenCalledTimes(1)
  })
})
