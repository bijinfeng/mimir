// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import type { Editor } from '@tiptap/core'
import JSZip from 'jszip'
import { afterEach, expect, it } from 'vitest'
import { DocxEditor } from './DocxEditor.js'
import { openDocx } from '../docx.js'
import { DESIGN_ATTR } from '../docx-design-save.js'
import { designFixture } from './docx-design-test-fixture.js'
import { openSelect } from '../shell/antd-test-dom.js'
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
async function settle(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2)))
  expect(done()).toBe(true)
}
async function press(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  expect(button).not.toBeNull()
  expect(button.disabled).toBe(false)
  act(() => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
  await act(async () => button.click())
}
function pick(host: HTMLElement, label: string, text: string) {
  openSelect(host, label)
  const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
    (node) => node.textContent === text,
  )!
  expect(option).not.toBeNull()
  act(() => {
    option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    option.click()
  })
}
async function parts(input: Uint8Array) {
  const zip = await JSZip.loadAsync(input)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((file) => !file.dir)
        .map(async (file) => [file.name, await file.async('uint8array')]),
    ),
  )
}
async function boot() {
  const bytes = await designFixture()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const saves: Uint8Array[] = []
  const io = {
    load: async () => bytes,
    save: async (data: Uint8Array) => {
      saves.push(data.slice())
    },
  }
  const render = async (documentId = 'design') =>
    act(async () =>
      root.render(
        <ConfigProvider componentSize="small">
          <DocxEditor documentId={documentId} io={io} />
        </ConfigProvider>,
      ),
    )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await render()
  await settle(
    () =>
      host.querySelector('[aria-label="保存到库"]')?.getAttribute('title') === '没有未保存的改动',
  )
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (node) => node.textContent === '设计',
  )!
  await act(async () => tab.click())
  const save = async (count: number) => {
    await press(host, '保存到库')
    await settle(() => saves.length === count)
    await settle(
      () => host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')?.disabled === true,
    )
  }
  return { host, editor, saves, render, save }
}
it('shows current values and real theme preview, keeps drafts local, applies once and saves native history', async () => {
  const { host, editor, saves, save } = await boot()
  const original = editor.state.doc
  await press(host, '主题与字体')
  await settle(
    () =>
      host.querySelector('.mimir-docx-design__current')?.textContent?.includes('Calibri') ?? false,
  )
  const office = [
    ...host.querySelectorAll<HTMLButtonElement>('[aria-label="主题预设"] button'),
  ].find((b) => b.textContent?.endsWith('Office'))!
  expect(office.getAttribute('aria-pressed')).toBe('true')
  const facet = [
    ...host.querySelectorAll<HTMLButtonElement>('[aria-label="主题预设"] button'),
  ].find((b) => b.textContent?.endsWith('Facet'))!
  await act(async () => facet.click())
  expect(editor.state.doc).toBe(original)
  expect(host.querySelector('[aria-label="主题方案预览"] strong')?.getAttribute('style')).toContain(
    'Trebuchet MS',
  )
  expect(host.querySelector('[aria-label="重置设计草稿"]')?.textContent).toBe('重置草稿')
  const footer = host.querySelector('.mimir-docx-design__actions')!
  expect(footer.contains(host.querySelector('[aria-label="应用设计"]'))).toBe(true)
  expect(host.querySelector('.mimir-docx-design__scroll')!.contains(footer)).toBe(false)
  let changes = 0
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) changes++
  })
  await press(host, '应用设计')
  expect(changes).toBe(1)
  await settle(
    () =>
      host
        .querySelector('.mimir-docx-theme-run')
        ?.getAttribute('style')
        ?.includes('Trebuchet MS') ?? false,
  )
  expect(host.querySelector('[aria-label="应用设计"]')?.textContent).toBe('应用设计')
  await save(1)
  expect((await openDocx(saves[0]!)).footnotes.parsed.themeColors?.accent1).toBe('90C226')
  await press(host, '恢复原件主题')
  await press(host, '应用设计')
  await save(2)
  expect((await openDocx(saves[1]!)).footnotes.parsed.themeFonts?.minor).toBe('Calibri')
  await press(host, '撤销 (Ctrl+Z)')
  await save(3)
  expect(await parts(saves[2]!)).toEqual(await parts(saves[0]!))
  await press(host, '重做 (Ctrl+Shift+Z)')
  await save(4)
  expect(await parts(saves[3]!)).toEqual(await parts(saves[1]!))
})
it('freezes the selected section while toolbar focus moves and gives explicit all-section and clear actions', async () => {
  const { host, editor, saves, save } = await boot()
  act(() => editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 2))
  await press(host, '页面颜色与边框')
  await settle(
    () =>
      host.querySelector('.mimir-docx-design__current')?.textContent?.includes('无页面底色') ??
      false,
  )
  expect(host.textContent).toContain('页面边框 · 当前第 2 节')
  pick(host, '边框', '无边框')
  // Moving only the selection must not retarget the opened Inspector.
  act(() => editor.commands.setTextSelection(2))
  await press(host, '应用设计')
  await save(1)
  expect((await openDocx(saves[0]!)).sections.map((s) => s.settings.pageBorder)).toEqual([
    true,
    false,
  ])
  pick(host, '边框应用范围', '全文 · 2 节')
  pick(host, '边框', '方框 · 0.5 磅')
  await press(host, '#FFF9E6')
  await press(host, '应用设计')
  await save(2)
  const result = await openDocx(saves[1]!)
  expect(result.sections.map((s) => s.settings.pageBorderProps?.widthPt)).toEqual([0.5, 0.5])
  await settle(
    () =>
      host.querySelector('.page-wrap')?.getAttribute('style')?.includes('--page-bg: #FFF9E6') ??
      false,
  )
  await press(host, '无页面底色')
  await press(host, '应用设计')
  await save(3)
  const zip = await JSZip.loadAsync(saves[2]!)
  expect(await zip.file('word/document.xml')!.async('string')).not.toContain('<w:background')
  const rgb = host.querySelector<HTMLInputElement>('[aria-label="页面底色自定义 RGB"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(rgb, '123abc')
    rgb.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await press(host, '使用页面底色自定义颜色')
  await press(host, '应用设计')
  await save(4)
  await expect(
    (await JSZip.loadAsync(saves[3]!)).file('word/document.xml')!.async('string'),
  ).resolves.toContain('w:color="123ABC"')
  expect(host.querySelector('.page-wrap')?.getAttribute('style')).toContain('--page-bg: #123ABC')
})
it('resets local drafts, rejects stale documents, and closes to the actual Ribbon entry with Escape', async () => {
  const { host, editor } = await boot()
  await press(host, '主题与字体')
  await settle(
    () =>
      host.querySelector('.mimir-docx-design__current')?.textContent?.includes('Calibri') ?? false,
  )
  const ion = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="主题预设"] button')].find(
    (b) => b.textContent?.endsWith('Ion'),
  )!
  await act(async () => ion.click())
  await press(host, '重置设计草稿')
  expect(editor.state.doc.attrs[DESIGN_ATTR]).toBeNull()
  expect(host.querySelector<HTMLButtonElement>('[aria-label="应用设计"]')?.disabled).toBe(true)
  await act(async () => ion.click())
  act(() => editor.commands.insertContent('manual'))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('文档已变化')
  expect(host.querySelector<HTMLButtonElement>('[aria-label="应用设计"]')?.disabled).toBe(true)
  const inspector = host.querySelector<HTMLElement>('[aria-label="主题与字体面板"]')!
  await act(async () =>
    inspector.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(host.querySelector('[aria-label="主题与字体面板"]')).toBeNull()
  await settle(() => document.activeElement?.getAttribute('aria-label') === '主题与字体')
})
