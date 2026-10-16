/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { applyPptxManualFill } from '../../../../apps/server/src/services/pptx-manual-fill.js'
import type { PptxManualFill } from '@mimir/shared'
import { PptxBackgroundControls, PptxShapeFillControls } from './PptxFillControls.js'
import {
  PPTX_FILL_TEXTURES,
  pptxBackgroundFillOps,
  pptxFillDraft,
  pptxShapeFillOp,
} from './pptx-fill-presets.js'
import { pptxInsertShapeOp } from './pptx-shape-presets.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { openPptxForEdit } from '../pptx.js'
import {
  elementDurableId,
  openPptx,
  savePptx,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fixture = new Uint8Array(readFileSync(resolve(rootDir, 'tests/fixtures/title-layout.pptx')))
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
})
function click(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!button) throw new Error(`Missing ${label}`)
  act(() => button.click())
}
function input(host: HTMLElement, label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function setup(background = false) {
  let bytes: Uint8Array = fixture
  const initial = await openPptx(bytes)
  expect(
    runTxn(initial, {
      isolation: 'atomic',
      ops: [
        pptxInsertShapeOp('rect', 0, 9144000, 6858000),
        { op: 'duplicateSlide', target: { slide: 0 } },
      ],
    }).applied,
  ).toBe(true)
  bytes = await savePptx(initial)
  let session = await openPptxForEdit(bytes)
  let version = 1
  const id = elementDurableId(session.slides()[0]!.elements.at(-1)!)!
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const past: Uint8Array[] = [],
    future: Uint8Array[] = []
  const apply = vi.fn<(ops: Record<string, unknown>[]) => Promise<boolean>>(async (ops) => {
    const source = await openPptx(bytes)
    const result = runTxn(source, { isolation: 'atomic', ops: ops as Op[] })
    expect(result.failures ?? []).toEqual([])
    expect(result.applied).toBe(true)
    past.push(bytes)
    future.length = 0
    bytes = await savePptx(source)
    session = await openPptxForEdit(bytes)
    version++
    render()
    return true
  })
  const applyFill = vi.fn<(input: PptxManualFill) => Promise<boolean>>(async (fillInput) => {
    const result = await applyPptxManualFill(
      {
        documentId: 'fill',
        bytes,
        expectedVersion: version,
        action: 'manual_fill',
        ops: [fillInput],
      },
      () => ({ ext: 'png', width: 64, height: 64 }),
    )
    past.push(bytes)
    future.length = 0
    bytes = result.bytes
    session = await openPptxForEdit(bytes)
    version++
    render()
    return true
  })
  const render = () =>
    root.render(
      <ConfigProvider componentSize="small">
        {background ? (
          <PptxBackgroundControls
            slide={session.slides()[0]!}
            slideIndex={0}
            slideCount={session.slides().length}
            version={version}
            applyOps={apply}
            applyFill={applyFill}
            media={session.media}
          />
        ) : (
          <PptxShapeFillControls
            element={session.slides()[0]!.elements.find((el) => elementDurableId(el) === id)!}
            target={{ slide: 0, el: id }}
            version={version}
            applyOps={apply}
            applyFill={applyFill}
          />
        )}
      </ConfigProvider>,
    )
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => render())
  let mounted = true
  const dispose = () => {
    if (!mounted) return
    mounted = false
    act(() => root.unmount())
    host.remove()
  }
  cleanups.push(dispose)
  const wait = async () => {
    for (let tries = 0; tries < 100; tries++) {
      await act(async () => {
        await new Promise((done) => setTimeout(done, 5))
      })
      if (!host.querySelector('[aria-busy="true"]')) break
    }
    expect(host.querySelector('[aria-busy="true"]')).toBeNull()
  }
  return {
    host,
    dispose,
    async advance() {
      version++
      await act(async () => render())
    },
    apply,
    applyFill,
    id,
    wait,
    bytes: () => bytes,
    session: () => session,
    async history(redo = false) {
      const next = (redo ? future : past).pop()!
      ;(redo ? past : future).push(bytes)
      bytes = next
      session = await openPptxForEdit(bytes)
      version++
      await act(async () => render())
    },
    async saveTwice() {
      const first = await session.save()
      session.commit()
      const second = await session.save()
      const firstZip = await JSZip.loadAsync(first),
        secondZip = await JSZip.loadAsync(second)
      expect(Object.keys(secondZip.files)).toEqual(Object.keys(firstZip.files))
      for (const path of Object.keys(firstZip.files))
        if (!firstZip.files[path]!.dir)
          expect(await secondZip.file(path)!.async('uint8array')).toEqual(
            await firstZip.file(path)!.async('uint8array'),
          )
      return secondZip
    },
    async refresh() {
      await act(async () => render())
    },
  }
}
it('形状纯色/无填充、三色标路径渐变和历史始终读回源状态，保留文字与其他ZIP部件', async () => {
  const s = await setup()
  input(s.host, '填充颜色', '#ED7D3180')
  click(s.host, '应用形状填充')
  await s.wait()
  expect(s.host.textContent).toContain('纯色 #ED7D3180')
  pickSelectOption(s.host, '填充类型', '渐变')
  click(s.host, '添加渐变色标')
  input(s.host, '色标颜色', '#70AD47')
  pickSelectOption(s.host, '渐变类型', '矩形路径')
  click(s.host, '应用形状填充')
  await s.wait()
  expect(s.host.querySelector<HTMLInputElement>('input[aria-label="色标颜色"]')!.value).toBe(
    '#70AD47',
  )
  expect(
    s.host.querySelector('[aria-label="当前色标"]')?.closest('.ant-select')?.textContent,
  ).toContain('色标 2 · 50%')
  const zip = await s.saveTwice(),
    original = await JSZip.loadAsync(fixture)
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
  expect(xml).toContain('<a:path path="rect">')
  expect(xml).toContain('70AD47')
  expect(s.host.textContent).toContain('路径渐变 · 3 个色标')
  for (const path of [
    'ppt/theme/theme1.xml',
    'ppt/slideMasters/slideMaster1.xml',
    'ppt/slideLayouts/slideLayout2.xml',
  ])
    expect(await zip.file(path)!.async('uint8array')).toEqual(
      await original.file(path)!.async('uint8array'),
    )
  input(s.host, '色标颜色', '#FF0000')
  await s.refresh()
  expect(s.host.querySelector<HTMLInputElement>('input[aria-label="色标颜色"]')!.value).toBe(
    '#FF0000',
  )
  await s.history()
  expect(s.host.textContent).toContain('纯色 #ED7D3180')
  await s.history(true)
  expect(s.host.textContent).toContain('路径渐变 · 3 个色标')
  expect(s.host.querySelector<HTMLInputElement>('input[aria-label="色标颜色"]')!.value).not.toBe(
    '#FF0000',
  )
  pickSelectOption(s.host, '填充类型', '无填充')
  click(s.host, '应用形状填充')
  await s.wait()
  expect(s.host.textContent).toContain('当前填充：无填充')
  expect(s.session().slides()[0]!.elements[0]!.type).toBe('text')
  expect((await s.saveTwice()).file('ppt/slides/slide1.xml')).not.toBeNull()
})
it('背景径向渐变一次应用全部、隐藏图形与重置独立保存和撤销', async () => {
  const s = await setup(true)
  pickSelectOption(s.host, '填充类型', '渐变')
  click(s.host, '由中心向外')
  input(s.host, '色标颜色', '#FFC000')
  click(s.host, '背景应用到全部幻灯片')
  await s.wait()
  expect(s.apply).toHaveBeenCalledTimes(1)
  expect(s.apply.mock.calls[0]![0]).toHaveLength(2)
  expect(
    s
      .session()
      .slides()
      .every((slide) => slide.background?.type === 'gradient'),
  ).toBe(true)
  click(s.host, '隐藏背景图形')
  await s.wait()
  expect(s.host.textContent).toContain('已隐藏母版和版式上的背景图形')
  const beforeReset = await s.saveTwice()
  expect(await beforeReset.file('ppt/slides/slide1.xml')!.async('string')).toContain(
    'showMasterSp="0"',
  )
  click(s.host, '重置本页背景')
  await s.wait()
  expect(Boolean(s.session().slides()[0]!.bgOwn)).toBe(false)
  expect(s.session().slides()[1]!.background?.type).toBe('gradient')
  await s.history()
  expect(s.session().slides()[0]!.background?.type).toBe('gradient')
  await s.history(true)
  expect(s.host.textContent).toContain('继承母版')
})
it('8种固定原图均以原生tile写入形状/背景，并保留PNG字节与其他元素', async () => {
  expect(PPTX_FILL_TEXTURES).toHaveLength(8)
  for (const texture of PPTX_FILL_TEXTURES) {
    const bytes = readFileSync(
      resolve(rootDir, `vendor/apps/slides/src/renderer/assets/textures/${texture.id}.png`),
    )
    const hashes: Record<string, string> = {
      cork: '31c68ae8cc7155f1e5d850061e2e7bf8913d3b9c528dc9c16d86ffa33d427e05',
      paper: 'c91102652bf97632c2dd4e3dfc84aac3e6022e59d521557750eaed6e1944e158',
      parchment: 'f64b05df420bf21ebcb164aca4ef39a24d5b97792686f0a5979a83d3896619d7',
      wood: '1f3735b67b527e90dbef8e9cc6632a1779a88019050fb87ebf77bc218c8410b8',
      marble: '0434af3f2f462731f4d81944931539733bc841665a1e6548d3c4c6152fb0539c',
      denim: 'dcd536be5b70c7d264124bfa0b032bb814807d3aa29ebb78468ec9ddda2470cc',
      canvas: 'ffa409fdaf31695bad36751fd490b09a4a7d84fe06bbd8f935b031bcaca614b2',
      granite: '4504f393f0c30652310373f776ce8fd195eb0f1b2643c3ae0abcc1c1af2f7010',
    }
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(hashes[texture.id])
    const doc = await openPptx(fixture),
      el = doc.deck.slides[0]!.elements[0]!
    const draft = { ...pptxFillDraft(undefined), mode: 'texture' as const, texture: texture.id }
    const untouched = doc.deck.slides[0]!.elements[1]!.anchor.originalXml
    const result = runTxn(doc, {
      isolation: 'atomic',
      ops: [
        pptxShapeFillOp(
          draft,
          { slide: 0, el: elementDurableId(el) ?? el.id },
          bytes.toString('base64'),
        ),
        ...pptxBackgroundFillOps(draft, [0], bytes.toString('base64')),
      ] as Op[],
    })
    expect(result.failures ?? []).toEqual([])
    expect(result.applied).toBe(true)
    const saved = await savePptx(doc),
      zip = await JSZip.loadAsync(saved)
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(xml).toContain('<a:tile')
    expect(xml).toContain(untouched)
    const images = Object.keys(zip.files).filter(
      (name) => name.startsWith('ppt/media/') && name.endsWith('.png'),
    )
    expect(images.length).toBeGreaterThan(0)
    expect(await zip.file(images[0]!)!.async('uint8array')).toEqual(new Uint8Array(bytes))
    const reopened = await openPptxForEdit(saved)
    expect(reopened.slides()[0]!.background?.type).toBe('image')
    const twice = await JSZip.loadAsync(await reopened.save())
    expect(await twice.file('ppt/slides/slide1.xml')!.async('string')).toBe(xml)
  }
})
it('非法颜色与无目标禁用应用，失败保留草稿', async () => {
  const s = await setup()
  input(s.host, '填充颜色', 'bad')
  expect(s.host.querySelector<HTMLButtonElement>('[aria-label="应用形状填充"]')!.disabled).toBe(
    true,
  )
  expect(s.apply).not.toHaveBeenCalled()
  input(s.host, '填充颜色', '#7030A0')
  s.apply.mockResolvedValueOnce(false)
  click(s.host, '应用形状填充')
  await s.wait()
  expect(s.host.querySelector<HTMLInputElement>('[aria-label="填充颜色"]')!.value).toBe('#7030A0')
  expect(s.host.querySelector<HTMLButtonElement>('[aria-label="应用形状填充"]')!.disabled).toBe(
    false,
  )
})

it.each(['version', 'unmount'])(
  '纹理读取期间%s改变后不提交旧目标，连点只读取一次',
  async (kind) => {
    const s = await setup()
    const deferred: { finish?: (value: Response) => void } = {}
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise<Response>((done) => {
        deferred.finish = done
      }),
    )
    pickSelectOption(s.host, '填充类型', '纹理')
    click(s.host, '纹理：木纹')
    click(s.host, '应用形状填充')
    click(s.host, '应用形状填充')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    if (kind === 'version') await s.advance()
    else s.dispose()
    await act(async () => {
      deferred.finish!({
        ok: true,
        arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
      } as Response)
      await new Promise((done) => setTimeout(done, 10))
    })
    await s.wait()
    expect(s.apply).not.toHaveBeenCalled()
    expect(s.applyFill).not.toHaveBeenCalled()
  },
)
it('纹理读取失败的迟到结果不污染新版本，当前版本失败仍可重试', async () => {
  const s = await setup()
  let rejectTexture!: (cause: Error) => void
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
    new Promise<Response>((_, reject) => {
      rejectTexture = reject
    }),
  )
  pickSelectOption(s.host, '填充类型', '纹理')
  click(s.host, '应用形状填充')
  await s.advance()
  await act(async () => rejectTexture(new Error('旧版本纹理载入失败')))
  await s.wait()
  expect(s.host.querySelector('[role="alert"]')).toBeNull()
  expect(s.apply).not.toHaveBeenCalled()
  pickSelectOption(s.host, '填充类型', '纹理')
  fetchMock.mockRejectedValueOnce(new Error('当前纹理载入失败'))
  click(s.host, '应用形状填充')
  await s.wait()
  expect(s.host.querySelector('[role="alert"]')?.textContent).toContain('当前纹理载入失败')
  expect(s.host.querySelector<HTMLButtonElement>('[aria-label="应用形状填充"]')!.disabled).toBe(
    false,
  )
})
it('复杂原背景可直接保真应用全部，显式转换双色仍建立独立草稿', async () => {
  const session = await openPptxForEdit(fixture)
  const slide = {
    ...session.slides()[0]!,
    background: {
      type: 'gradient' as const,
      stops: [
        { pos: 0, color: '#4472C4' },
        { pos: 0.5, color: '#70AD47' },
        { pos: 1, color: '#FFFFFF' },
      ],
      angle: 5400000,
    },
    bgOwn: true,
  }
  const apply = vi
    .fn<(ops: Record<string, unknown>[]) => Promise<boolean>>()
    .mockResolvedValue(true)
  const applyFill = vi.fn<(input: PptxManualFill) => Promise<boolean>>().mockResolvedValue(true)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () =>
    root.render(
      <ConfigProvider>
        <PptxBackgroundControls
          slide={slide}
          slideIndex={0}
          slideCount={2}
          version={1}
          applyOps={apply}
          applyFill={applyFill}
        />
      </ConfigProvider>,
    ),
  )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  expect(host.textContent).toContain('完整保留原有设置')
  expect(
    host.querySelector<HTMLButtonElement>('[aria-label="背景应用到全部幻灯片"]')!.disabled,
  ).toBe(false)
  expect(apply).not.toHaveBeenCalled()
  expect(applyFill).not.toHaveBeenCalled()
  await act(async () => {
    click(host, '背景应用到全部幻灯片')
    await new Promise((done) => setTimeout(done, 5))
  })
  expect(applyFill).toHaveBeenCalledExactlyOnceWith({
    kind: 'copy-current-background',
    slide: 0,
    allSlides: true,
  })
  expect(apply).not.toHaveBeenCalled()
  click(host, '改为双色渐变')
  expect(host.querySelector('[aria-label="待应用填充预览"]')).not.toBeNull()
  await act(async () => {
    click(host, '背景应用到全部幻灯片')
    await new Promise((done) => setTimeout(done, 5))
  })
  expect(apply.mock.calls[0]![0]).toEqual(
    [0, 1].map((slideIndex) => ({
      op: 'setBackground',
      target: { slide: slideIndex },
      kind: 'gradient',
      from: '#4472C4',
      to: '#FFFFFF',
      angleDeg: 90,
    })),
  )
})
it('纹理面板成功写入后当前值可切换拉伸/平铺，并将原图片应用全部而不再读取文件', async () => {
  const s = await setup(true)
  const bytes = readFileSync(
    resolve(rootDir, 'vendor/apps/slides/src/renderer/assets/textures/wood.png'),
  )
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as Response)
  pickSelectOption(s.host, '填充类型', '纹理')
  click(s.host, '纹理：木纹')
  click(s.host, '应用本页背景')
  await s.wait()
  expect(s.host.textContent).toContain('图片 · 平铺')
  click(s.host, '拉伸当前图片')
  await s.wait()
  expect(s.host.textContent).toContain('图片 · 拉伸')
  click(s.host, '背景应用到全部幻灯片')
  await s.wait()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(
    s
      .session()
      .slides()
      .every((slide) => slide.background?.type === 'image' && slide.background.mode === 'stretch'),
  ).toBe(true)
  await s.saveTwice()
})
