/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxEditor } from './PptxEditor.js'
import { openPptxForEdit } from '../pptx.js'
import { pptxInsertShapeOp } from './pptx-shape-presets.js'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import type { PptxAgentHandle, PptxHostApply } from '../agent/pptx-agent.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { PPTX_FILL_TEXTURES } from './pptx-fill-presets.js'
import { pptxManualFillSchema } from '@mimir/shared'
vi.mock('../../../../apps/server/src/services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'fill-doc'
      ? {
          id,
          kind: 'file',
          fileExtension: 'pptx',
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }
      : null,
}))
// This unrelated model service is never used by the manual fill test.
vi.mock('../../../../apps/server/src/services/pptx-agent-services.js', () => ({
  applyPptxService: () => {
    throw new Error('Unexpected model service')
  },
}))
import { applyPptxOpsOnHost } from '../../../../apps/server/src/services/pptx-agent-host.js'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const load = () =>
  new Uint8Array(readFileSync(resolve(rootDir, 'tests/fixtures/title-layout.pptx')))
const textureBytes = (id: string) =>
  new Uint8Array(
    readFileSync(resolve(rootDir, `vendor/apps/slides/src/renderer/assets/textures/${id}.png`)),
  )
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((close) => close())
  vi.restoreAllMocks()
})
async function settle(done: () => boolean) {
  for (let tries = 0; tries < 500 && !done(); tries++)
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 3))
    })
  expect(done()).toBe(true)
}
function click(node: Element) {
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(label)
  return node
}
function panel(host: HTMLElement, tab: string, name: string) {
  click([...host.querySelectorAll('[role="tab"]')].find((node) => node.textContent === tab)!)
  click(button(host, name))
}
async function mount(background?: string) {
  const opened = await openPptx(load())
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [pptxInsertShapeOp('rect', 0, 9144000, 6858000)] as Op[],
    }).applied,
  ).toBe(true)
  const session = await openPptxForEdit(await savePptx(opened))
  session.duplicate(0)
  let initial = await session.save()
  if (background) {
    const zip = await JSZip.loadAsync(initial)
    const path = session.slides()[0]!.path
    const xml = await zip.file(path)!.async('string')
    const pattern = /<p:bg\b[^>]*(?:\/>|>[\s\S]*?<\/p:bg>)/
    zip.file(
      path,
      pattern.test(xml)
        ? xml.replace(pattern, () => background)
        : xml.replace(/<p:cSld\b[^>]*>/, (tag) => tag + background),
    )
    initial = await zip.generateAsync({ type: 'uint8array' })
  }
  const saved: Uint8Array[] = []
  const hostApply = vi.fn<PptxHostApply>(applyPptxOpsOnHost)
  let handle: PptxAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <PptxEditor
        documentId="fill-doc"
        io={{
          load: async () => initial,
          save: async (bytes) => {
            saved.push(bytes)
          },
        }}
        hostApply={hostApply}
        onAgentHandleChange={(next) => {
          handle = next
        }}
      />,
    ),
  )
  await settle(() => !!handle && !!host.querySelector('.mimir-pptx-slide svg'))
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const id = String(url).match(
      /(paper|canvas|wood|marble|granite|denim|cork|parchment)\.png/,
    )?.[1]
    if (!id) throw new Error(`Unexpected fetch ${String(url)}`)
    const bytes = textureBytes(id)
    return {
      ok: true,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as Response
  })
  async function action(label: string) {
    const before = handle!.getVersion()
    click(button(host, label))
    await settle(
      () =>
        handle!.getVersion() === before + 1 &&
        !host.querySelector('.mimir-pptx-fill-editor[aria-busy="true"]'),
    )
    expect(host.textContent).not.toContain('不对 Agent 开放')
  }
  async function save() {
    const before = saved.length
    await settle(() => !button(host, '保存到库').disabled)
    click(button(host, '保存到库'))
    await settle(() => saved.length === before + 1 && button(host, '保存到库').disabled)
    return saved.at(-1)!
  }
  return { host, initial, hostApply, handle: () => handle!, action, save, fetchMock }
}
it('真实Editor→handle→受控host：八纹理形状、当前图片模式、背景all一次事务历史及双保存保真', async () => {
  const app = await mount()
  const elements = [...app.host.querySelectorAll('.mimir-pptx-slide [data-element-id]')]
  click(elements.at(-1)!)
  panel(app.host, '对象', '形状填充')
  for (const texture of PPTX_FILL_TEXTURES) {
    pickSelectOption(app.host, '填充类型', '纹理')
    click(button(app.host, `纹理：${texture.label}`))
    await app.action('应用形状填充')
    expect(app.host.textContent).toContain('图片 · 平铺')
    expect(app.hostApply.mock.calls.at(-1)![0].action).toBe('manual_fill')
  }
  await app.action('拉伸当前图片')
  expect(app.host.textContent).toContain('图片 · 拉伸')
  await app.action('平铺当前图片')
  const once = await app.save(),
    zip = await JSZip.loadAsync(once)
  const shapeXml = await zip.file('ppt/slides/slide1.xml')!.async('string')
  expect(shapeXml).toContain('<a:tile')
  const source = await JSZip.loadAsync(app.initial)
  for (const path of [
    'ppt/theme/theme1.xml',
    'ppt/slideMasters/slideMaster1.xml',
    'ppt/slideLayouts/slideLayout2.xml',
  ])
    expect(await zip.file(path)!.async('uint8array')).toEqual(
      await source.file(path)!.async('uint8array'),
    )
  click(button(app.host, '关闭幻灯片属性面板'))
  panel(app.host, '幻灯片', '设置背景')
  pickSelectOption(app.host, '填充类型', '纹理')
  click(button(app.host, '纹理：木纹'))
  const before = app.hostApply.mock.calls.length
  await app.action('背景应用到全部幻灯片')
  expect(app.hostApply).toHaveBeenCalledTimes(before + 1)
  expect(app.hostApply.mock.calls.at(-1)![0].ops).toEqual([
    {
      kind: 'background',
      slide: 0,
      allSlides: true,
      source: {
        kind: 'texture',
        id: 'wood',
        png: Buffer.from(textureBytes('wood')).toString('base64'),
      },
      tile: true,
    },
  ])
  const bgSaved = await app.save(),
    bg = await openPptxForEdit(bgSaved)
  expect(
    bg
      .slides()
      .every((slide) => slide.background?.type === 'image' && slide.background.mode === 'tile'),
  ).toBe(true)
  await app.action('拉伸当前图片')
  await app.action('背景应用到全部幻灯片')
  expect(app.hostApply.mock.calls.at(-1)![0].ops).toEqual([
    { kind: 'copy-current-background', slide: 0, allSlides: true },
  ])
  const final = await app.save(),
    reopened = await openPptxForEdit(final)
  expect(
    reopened
      .slides()
      .every((slide) => slide.background?.type === 'image' && slide.background.mode === 'stretch'),
  ).toBe(true)
  const twice = await JSZip.loadAsync(await reopened.save()),
    finalZip = await JSZip.loadAsync(final)
  for (const path of Object.keys(finalZip.files).filter((name) => !finalZip.files[name]!.dir))
    expect(await twice.file(path)!.async('uint8array')).toEqual(
      await finalZip.file(path)!.async('uint8array'),
    )
  const media = [...reopened.media.keys()]
  expect(media.length).toBeGreaterThan(0)
  expect(
    Object.keys(finalZip.files).filter(
      (path) => path.startsWith('ppt/media/') && path.endsWith('.png'),
    ).length,
  ).toBe(2)
  const embedded = await Promise.all(
    Object.keys(finalZip.files)
      .filter((path) => path.startsWith('ppt/media/') && path.endsWith('.png'))
      .map((path) => finalZip.file(path)!.async('uint8array')),
  )
  expect(embedded).toEqual(
    expect.arrayContaining([textureBytes('wood'), textureBytes('parchment')]),
  )
  expect(app.fetchMock).toHaveBeenCalledTimes(9)
  // The latest apply-all is a single history item: one undo restores page 2 tile while page 1 stays stretch.
  click([...app.host.querySelectorAll('[role="tab"]')].find((node) => node.textContent === '开始')!)
  await app.action('撤销')
  const undone = await openPptxForEdit(await app.save())
  const [firstFill, secondFill] = undone.slides().map((slide) => slide.background)
  expect(firstFill?.type === 'image' && firstFill.mode).toBe('stretch')
  expect(secondFill?.type === 'image' && secondFill.mode).toBe('tile')
})
it('真实host仍拒绝模型setImageFill，manual_fill仅接受固定纹理/当前fill，取消与非法目标原子拒绝', async () => {
  const bytes = load(),
    base = { documentId: 'fill-doc', bytes, expectedVersion: 0 }
  await expect(
    applyPptxOpsOnHost({
      ...base,
      action: 'apply_ops',
      ops: [
        {
          op: 'setImageFill',
          target: { slide: 0, el: 'e_2' },
          source: { mediaPath: 'ppt/media/image1.png' },
        },
      ],
    }),
  ).rejects.toThrow('不对 Agent 开放')
  expect(
    pptxManualFillSchema.safeParse({
      kind: 'background',
      slide: 0,
      allSlides: true,
      tile: true,
      source: { kind: 'current', mediaPath: '/etc/passwd' },
    }).success,
  ).toBe(false)
  await expect(
    applyPptxOpsOnHost({
      ...base,
      action: 'manual_fill',
      ops: [
        {
          kind: 'background',
          slide: 0,
          allSlides: true,
          tile: true,
          source: {
            kind: 'texture',
            id: 'wood',
            png: Buffer.from(textureBytes('paper')).toString('base64'),
          },
        },
      ],
    }),
  ).rejects.toThrow('内容不匹配')
  await expect(
    applyPptxOpsOnHost({
      ...base,
      action: 'manual_fill',
      ops: [
        {
          kind: 'background',
          slide: 999,
          allSlides: true,
          tile: true,
          source: { kind: 'current' },
        },
      ],
    }),
  ).rejects.toThrow('页面已失效')
  await expect(
    applyPptxOpsOnHost({
      ...base,
      action: 'manual_fill',
      signal: AbortSignal.abort(),
      ops: [
        { kind: 'background', slide: 0, allSlides: true, tile: true, source: { kind: 'current' } },
      ],
    }),
  ).rejects.toThrow('已取消')
  expect(
    new Uint8Array(readFileSync(resolve(rootDir, 'tests/fixtures/title-layout.pptx'))),
  ).toEqual(bytes)
})
it('真实复杂背景Inspector直接保真应用全部→保存→撤销保存→重做保存，单次宿主和history，保留所有native色标/path/alpha', async () => {
  const background =
    '<p:bg><p:bgPr><a:gradFill rotWithShape="0"><a:gsLst><a:gs pos="0"><a:srgbClr val="112233"><a:alpha val="40000"/></a:srgbClr></a:gs><a:gs pos="35000"><a:srgbClr val="556677"/></a:gs><a:gs pos="100000"><a:srgbClr val="AABBCC"/></a:gs></a:gsLst><a:path path="rect"><a:fillToRect l="12000" t="23000" r="34000" b="45000"/></a:path><a:tileRect l="-1000" t="2000" r="3000" b="4000"/></a:gradFill><a:effectLst/></p:bgPr></p:bg>'
  const app = await mount(background)
  const first = (await openPptxForEdit(app.initial)).slides()[0]!.background
  const originalSecond = (await openPptxForEdit(app.initial)).slides()[1]!.background
  panel(app.host, '幻灯片', '设置背景')
  expect(app.host.textContent).toContain('完整保留原有设置')
  expect(button(app.host, '应用本页背景').disabled).toBe(true)
  const before = app.hostApply.mock.calls.length
  await app.action('背景应用到全部幻灯片')
  expect(app.hostApply).toHaveBeenCalledTimes(before + 1)
  expect(app.hostApply.mock.calls.at(-1)![0]).toMatchObject({
    action: 'manual_fill',
    ops: [{ kind: 'copy-current-background', slide: 0, allSlides: true }],
  })
  const copied = await app.save()
  const reopened = await openPptxForEdit(copied)
  expect(reopened.slides().map((slide) => slide.background)).toEqual([first, first])
  const archive = await JSZip.loadAsync(copied)
  for (const slide of reopened.slides()) {
    const xml = await archive.file(slide.path)!.async('string')
    expect(xml).toContain('<a:alpha val="40000"/>')
    expect(xml).toContain('<a:path path="rect">')
    expect(xml).toContain('<a:tileRect l="-1000" t="2000" r="3000" b="4000"/>')
  }
  click([...app.host.querySelectorAll('[role="tab"]')].find((node) => node.textContent === '开始')!)
  await app.action('撤销')
  const undone = await openPptxForEdit(await app.save())
  expect(undone.slides().map((slide) => slide.background)).toEqual([first, originalSecond])
  await app.action('重做')
  const redone = await openPptxForEdit(await app.save())
  expect(redone.slides().map((slide) => slide.background)).toEqual([first, first])
  expect(app.fetchMock).not.toHaveBeenCalled()
})

it('unchanged background copy creates no phantom object-undo round or edit step', async () => {
  const app = await mount(
    '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>',
  )
  panel(app.host, '幻灯片', '设置背景')
  await app.action('背景应用到全部幻灯片')
  await app.save()
  await app.action('撤销')
  await app.save()
  await app.action('重做')
  await app.save()
  // Redo clears the legacy object-undo shortcut. Copying an identical background
  // must not invent a fresh shortcut for a transaction that did not change bytes.
  const version = app.handle().getVersion()
  const calls = app.hostApply.mock.calls.length
  click(button(app.host, '背景应用到全部幻灯片'))
  await settle(
    () =>
      app.hostApply.mock.calls.length === calls + 1 &&
      !app.host.querySelector('.mimir-pptx-fill-editor[aria-busy="true"]'),
  )
  expect(app.handle().getVersion()).toBe(version)
  expect(button(app.host, '保存到库').disabled).toBe(true)
  panel(app.host, '对象', '对象与幻灯片操作')
  expect(app.host.textContent).not.toContain('撤销上一次对象操作')
  expect(button(app.host, '重做').disabled).toBe(true)
})
