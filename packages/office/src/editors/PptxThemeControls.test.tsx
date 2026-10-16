/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { openPptxForEdit } from '../pptx.js'
import { PptxHistory } from '../pptx-history.js'
import { readPptxMetadata, type PptxMetadata } from '../pptx-metadata.js'
import { PptxArchive } from '../pptx-archive.js'
import { PptxThemeControls } from './PptxDeckControls.js'
import {
  PPTX_THEME_PRESETS,
  PPTX_THEME_COLOR_KEYS,
  pptxThemeMatches,
  pptxThemePreset,
} from './pptx-theme-presets.js'
const fixture = new Uint8Array(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
  ),
)
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
function metadata(preset = PPTX_THEME_PRESETS[0]!): PptxMetadata {
  return {
    layouts: [],
    sections: [],
    comments: [],
    themes: [{ ...preset, colors: { ...preset.colors }, path: 'ppt/theme/theme1.xml' }],
  }
}
function mount(props: React.ComponentProps<typeof PptxThemeControls>) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (next: typeof props) =>
    act(() =>
      root.render(
        <ConfigProvider componentSize="small">
          <PptxThemeControls {...next} />
        </ConfigProvider>,
      ),
    )
  render(props)
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, render }
}
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(`missing ${label}`)
  return node
}
function click(node: HTMLElement) {
  act(() => {
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    node.click()
  })
}
function input(host: HTMLElement, label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function nativeApply(bytes: Uint8Array, preset: (typeof PPTX_THEME_PRESETS)[number]) {
  const opened = await openPptx(bytes)
  const result = runTxn(opened, {
    isolation: 'atomic',
    ops: [
      {
        op: 'applyTheme',
        name: preset.name,
        colors: preset.colors,
        majorFont: preset.majorFont,
        minorFont: preset.minorFont,
      },
    ],
  })
  expect(result.applied).toBe(true)
  return savePptx(opened)
}
async function entries(bytes: Uint8Array) {
  return (await PptxArchive.open(bytes)).entries
}
function unchangedThemeParts(xml: string) {
  let out = xml.replace(/(<a:clrScheme name=")[^"]*(")/, '$1$2')
  for (const key of PPTX_THEME_COLOR_KEYS) {
    out = out.replace(new RegExp(`<a:${key}>[\\s\\S]*?</a:${key}>`), '')
  }
  return out.replace(/(<a:latin[^>]*typeface=")[^"]*(")/g, '$1$2')
}
it('pins all eight full twelve-slot palettes and Latin font pairs, matches content independently of editable name', () => {
  expect(
    PPTX_THEME_PRESETS.map((p) => [
      p.id,
      p.label,
      Object.values(p.colors).join(','),
      p.majorFont,
      p.minorFont,
    ]),
  ).toEqual([
    [
      'office',
      'Office',
      '#000000,#FFFFFF,#44546A,#E7E6E6,#4472C4,#ED7D31,#A5A5A5,#FFC000,#5B9BD5,#70AD47,#0563C1,#954F72',
      'Calibri Light',
      'Calibri',
    ],
    [
      'ember',
      '红韵',
      '#2B1B14,#FFFFFF,#632B1A,#F7EBE6,#C43E1C,#E97132,#FFC000,#8A3B12,#D98F73,#A33517,#C43E1C,#954F72',
      'Trebuchet MS',
      'Calibri',
    ],
    [
      'indigo',
      '靛蓝',
      '#1F2A44,#FFFFFF,#3B4C77,#E8ECF6,#2E4FA3,#5B79C7,#8FA6DE,#E97132,#31A5A0,#7030A0,#2E4FA3,#954F72',
      'Segoe UI',
      'Segoe UI',
    ],
    [
      'forest',
      '森绿',
      '#1E2B20,#FFFFFF,#375E43,#E9F2EB,#217346,#4EA72E,#92D050,#FFC000,#3E8E8B,#70AD47,#217346,#954F72',
      'Candara',
      'Candara',
    ],
    [
      'cream',
      '米黄',
      '#3B3226,#FBF6EC,#6E5F49,#F0E7D5,#C0A062,#8A6D3B,#B65C33,#6E8B5E,#4E7CA1,#9E5D74,#8A6D3B,#954F72',
      'Georgia',
      'Georgia',
    ],
    [
      'rose',
      '蔷薇',
      '#3A1F33,#FFFFFF,#6E3A62,#F8ECF4,#B44582,#D96FA8,#E9A6C9,#7030A0,#E97132,#4E7CA1,#B44582,#954F72',
      'Trebuchet MS',
      'Calibri',
    ],
    [
      'graphite',
      '石墨',
      '#F2F2F2,#1E1E1E,#D9D9D9,#333333,#4FC3F7,#FFB74D,#81C784,#BA68C8,#E57373,#90A4AE,#4FC3F7,#954F72',
      'Segoe UI',
      'Segoe UI',
    ],
    [
      'midnight',
      '午夜',
      '#EAF2FF,#0F1C2E,#BCD0EC,#1E3350,#4A9EDE,#63C7B2,#F2C14E,#E4718D,#9B8CDE,#7FB069,#6FB3EC,#954F72',
      'Calibri Light',
      'Calibri',
    ],
  ])
  for (const preset of PPTX_THEME_PRESETS) {
    expect(Object.keys(preset.colors)).toEqual(PPTX_THEME_COLOR_KEYS)
    expect(
      pptxThemePreset({
        ...preset,
        name: '用户改名',
        colors: Object.fromEntries(
          Object.entries(preset.colors).map(([k, v]) => [k, v.toLowerCase()]),
        ),
      })?.id,
    ).toBe(preset.id)
    expect(pptxThemePreset({ ...preset, minorFont: 'Different Font' })).toBeUndefined()
    expect(
      pptxThemePreset({ ...preset, colors: { ...preset.colors, folHlink: '#123456' } }),
    ).toBeUndefined()
  }
})
it('selects a visible preview as draft, keeps all twelve custom controls and applies only on explicit action', async () => {
  const apply = vi.fn<(op: Record<string, unknown>) => Promise<boolean>>(async () => true)
  const { host } = mount({ metadata: metadata(), apply })
  expect(host.textContent).toContain('当前：Office')
  expect(button(host, '选择Office主题').getAttribute('aria-pressed')).toBe('true')
  expect(button(host, '应用整份主题').disabled).toBe(true)
  expect(button(host, '应用整份主题').textContent).toBe('应用整份主题')
  click(button(host, '选择午夜主题'))
  expect(apply).not.toHaveBeenCalled()
  expect(host.textContent).toContain('当前：Office')
  expect(button(host, '选择午夜主题').getAttribute('aria-pressed')).toBe('true')
  expect(host.querySelectorAll('.mimir-pptx-theme__card')).toHaveLength(8)
  expect(host.querySelectorAll('button[aria-label^="主题"]')).toHaveLength(12)
  expect(host.querySelector('.mimir-pptx-theme__draft')?.textContent).toContain('午夜待应用')
  expect(host.querySelector<HTMLInputElement>('[aria-label="主题标题字体"]')?.value).toBe(
    'Calibri Light',
  )
  input(host, '主题正文字体', 'Arial')
  input(host, '主题名称', '我的午夜')
  expect(host.querySelector('.mimir-pptx-theme__draft')?.textContent).toContain('自定义')
  expect(button(host, '选择午夜主题').getAttribute('aria-pressed')).toBe('false')
  await act(async () => click(button(host, '应用整份主题')))
  expect(apply).toHaveBeenCalledExactlyOnceWith({
    op: 'applyTheme',
    name: '我的午夜',
    colors: PPTX_THEME_PRESETS[7]!.colors,
    majorFont: 'Calibri Light',
    minorFont: 'Arial',
  })
})
it('disables duplicate pending writes, retains failed draft, handles source changes and does not resurrect draft after undo', async () => {
  let finish!: (ok: boolean) => void
  const apply = vi.fn<(op: Record<string, unknown>) => Promise<boolean>>(
    () =>
      new Promise<boolean>((complete) => {
        finish = complete
      }),
  )
  const a = metadata(),
    b = metadata(PPTX_THEME_PRESETS[3]!)
  const { host, render } = mount({ metadata: a, apply })
  click(button(host, '选择红韵主题'))
  click(button(host, '应用整份主题'))
  expect(button(host, '应用整份主题').disabled).toBe(true)
  expect(button(host, '选择午夜主题').disabled).toBe(true)
  expect(
    host.querySelector('[aria-label="读取原件主题"]')?.closest('.ant-select')?.classList,
  ).toContain('ant-select-disabled')
  click(button(host, '应用整份主题'))
  expect(apply).toHaveBeenCalledTimes(1)
  await act(async () => finish(false))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('未应用')
  expect(button(host, '选择红韵主题').getAttribute('aria-pressed')).toBe('true')
  render({ metadata: b, apply })
  expect(host.textContent).toContain('当前：森绿')
  render({ metadata: a, apply })
  expect(button(host, '选择Office主题').getAttribute('aria-pressed')).toBe('true')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  render({ metadata: { ...a, themes: [] }, apply })
  expect(button(host, '选择午夜主题').disabled).toBe(true)
  expect(button(host, '应用整份主题').disabled).toBe(true)
  expect(host.textContent).toContain('原件没有可用主题资源')
})
it('reports mixed source themes as custom, never claims a match from a preset name alone', () => {
  const a = metadata(),
    b = metadata(PPTX_THEME_PRESETS[3]!)
  a.themes.push({ ...b.themes[0]!, path: 'ppt/theme/theme2.xml' })
  const { host } = mount({ metadata: a, apply: async () => true })
  expect(host.textContent).toContain('当前：多个原件主题 · 自定义')
  expect(button(host, '应用整份主题').disabled).toBe(false)
  expect(host.querySelector('.mimir-pptx-theme__card-label')?.textContent).not.toContain('当前')
})
it('reads the latest selected color when opening the custom color editor', () => {
  const { host } = mount({ metadata: metadata(), apply: async () => true })
  click(button(host, '主题强调1'))
  click(button(host, '#FF0000'))
  click(button(host, '自定义主题色'))
  expect(host.querySelector<HTMLInputElement>('[aria-label="自定义色值"]')?.value).toBe('#FF0000')
})
it('applies all eight through native OOXML, preserves other resources, and survives two saves plus undo/save/redo/save', async () => {
  const original = await entries(fixture)
  for (const preset of PPTX_THEME_PRESETS) {
    const result = await nativeApply(fixture, preset)
    const session = await openPptxForEdit(result)
    const themes = session.metadata(0).themes
    expect(themes.length).toBeGreaterThan(0)
    expect(
      themes.every((theme) => pptxThemeMatches(theme, preset) && theme.name === preset.name),
    ).toBe(true)
    const after = await entries(await session.save())
    const decode = new TextDecoder()
    expect(unchangedThemeParts(decode.decode(after.get('ppt/theme/theme1.xml')))).toBe(
      unchangedThemeParts(decode.decode(original.get('ppt/theme/theme1.xml'))),
    )
    for (const [path, bytes] of original) {
      if (/^ppt\/(?:theme\/theme\d+\.xml|slides\/slide\d+\.xml)$/.test(path)) continue
      expect({ path, bytes: after.get(path) }).toEqual({ path, bytes })
    }
  }
  const session = await openPptxForEdit(fixture),
    history = new PptxHistory(session)
  const themed = await nativeApply(await session.save(), PPTX_THEME_PRESETS[7]!)
  await session.replaceFromHost(themed, session.version())
  history.record()
  const saved = await session.save()
  session.commit()
  history.synchronize()
  expect(await entries(await session.save())).toEqual(await entries(saved))
  expect(history.undo()).toBe(true)
  const reverted = await session.save()
  session.commit()
  history.synchronize()
  expect(await entries(reverted)).toEqual(original)
  expect(history.redo()).toBe(true)
  const redone = await session.save()
  session.commit()
  history.synchronize()
  expect(await entries(redone)).toEqual(await entries(saved))
  expect(pptxThemePreset(session.metadata(0).themes[0]!)?.id).toBe('midnight')
})

it('reads persisted custom palette names, falls back to resource name, and preserves the original outer theme name', async () => {
  const bytes = await nativeApply(fixture, { ...PPTX_THEME_PRESETS[4]!, name: '我的主题 & "甲"' })
  const session = await openPptxForEdit(bytes)
  expect(session.metadata(0).themes[0]?.name).toBe('我的主题 & "甲"')
  const props = {
    metadata: session.metadata(0),
    apply: vi.fn<(op: Record<string, unknown>) => Promise<boolean>>(async () => true),
  }
  const { host } = mount(props)
  expect(host.querySelector<HTMLInputElement>('[aria-label="主题名称"]')?.value).toBe(
    '我的主题 & "甲"',
  )
  expect(button(host, '选择米黄主题').getAttribute('aria-pressed')).toBe('true')
  expect(button(host, '应用整份主题').disabled).toBe(true)
  const archive = await PptxArchive.open(bytes)
  const path = 'ppt/theme/theme1.xml'
  const xml = archive.readText(path)!
  const original = await PptxArchive.open(fixture)
  const rootName = /<a:theme\b[^>]* name="([^"]*)"/.exec(original.readText(path)!)![1]!
  expect(xml).toContain(`name="${rootName}"`)
  archive.entries.set(
    path,
    new TextEncoder().encode(xml.replace(/(<a:clrScheme name=")[^"]*(")/, '$1$2')),
  )
  expect(readPptxMetadata(archive, session.slides(), 0).themes[0]?.name).toBe(rootName)
})
