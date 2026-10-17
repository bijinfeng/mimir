// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import type { Editor } from '@tiptap/core'
import JSZip from 'jszip'
import { afterEach, expect, it } from 'vitest'
import { DocxEditor } from './DocxEditor.js'
import { openDocx } from '../docx.js'
import { openSelect } from '../shell/antd-test-dom.js'
import { referenceSources } from './docx-references.js'

const bytes = new Uint8Array(
  readFileSync(
    join(
      import.meta.dirname,
      '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
    ),
  ),
)
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
function visibleSourceAction(host: HTMLElement, label: string, text: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  expect(button).not.toBeNull()
  expect(button.textContent).toBe(text)
  expect(button.querySelector('svg')).not.toBeNull()
}
function type(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  expect(input).not.toBeNull()
  act(() => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function pick(host: HTMLElement, label: string, text: string) {
  openSelect(host, label)
  const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
    (node) => node.textContent === text,
  )!
  expect(option).toBeTruthy()
  act(() => {
    option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    option.click()
  })
}
async function parts(data: Uint8Array) {
  const zip = await JSZip.loadAsync(data)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((file) => !file.dir)
        .map(async (file) => [file.name, await file.async('uint8array')]),
    ),
  )
}
async function boot() {
  const saves: Uint8Array[] = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const io = {
    load: async () => bytes,
    save: async (data: Uint8Array) => {
      saves.push(data.slice())
    },
  }
  const render = async (documentId = 'references') =>
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
  act(() => editor.commands.setTextSelection({ from: 2, to: 4 }))
  act(() =>
    [...host.querySelectorAll<HTMLElement>('[role=tab]')]
      .find((node) => node.textContent === '引用')!
      .click(),
  )
  const save = async (count: number) => {
    await press(host, '保存到库')
    await settle(() => saves.length === count)
    await settle(
      () => host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')?.disabled === true,
    )
  }
  return { host, editor, saves, save, render }
}

it('real Ribbon contains full References entries; source and citation apply once with final input, native save/undo/redo exact entries', async () => {
  const { host, editor, saves, save } = await boot()
  for (const label of ['目录与更新', '题注', '引文与来源', '索引', '原生域'])
    expect(host.querySelector(`button[aria-label="${label}"]`)).not.toBeNull()
  await press(host, '引文与来源')
  const original = editor.state.doc
  type(host, '唯一标签', 'Browser2026')
  type(host, '作者', '李四')
  type(host, '标题', '界面与原生引用')
  type(host, '年份', '2026')
  expect(editor.state.doc).toBe(original)
  const scroll = host.querySelector('.mimir-docx-references__scroll')!
  const footer = host.querySelector('.mimir-docx-references__actions')!
  expect(scroll.contains(footer)).toBe(false)
  expect(footer.querySelectorAll('button')).toHaveLength(1)
  await press(host, '保存来源并插入引文')
  expect(editor.state.doc.textContent).toContain('(李四, 2026)')
  await save(1)
  const session = await openDocx(saves[0]!)
  expect(session.footnotes.parsed.sources[0]).toMatchObject({
    tag: 'Browser2026',
    author: '李四',
    title: '界面与原生引用',
    year: '2026',
  })
  await press(host, '撤销 (Ctrl+Z)')
  await save(2)
  expect(await parts(saves[1]!)).toEqual(await parts(bytes))
  await press(host, '重做 (Ctrl+Shift+Z)')
  await save(3)
  expect(await parts(saves[2]!)).toEqual(await parts(saves[0]!))
})

it('source current values reopen, edits are drafts, cancel returns actual trigger, manual change locks all Selects', async () => {
  const { host, editor } = await boot()
  await press(host, '引文与来源')
  visibleSourceAction(host, '新建来源', '新建来源')
  type(host, '唯一标签', 'Current')
  type(host, '作者', '当前作者')
  type(host, '标题', '当前标题')
  await press(host, '保存来源并插入引文')
  await press(host, '关闭文档属性面板')
  await press(host, '引文与来源')
  visibleSourceAction(host, '新建来源', '新建来源')
  visibleSourceAction(host, '编辑当前来源', '编辑来源')
  const sourceTools = host.querySelector('.mimir-docx-references__source-tools')!
  const sourceRow = sourceTools.querySelector('.mimir-docx-references__row')!
  expect(sourceTools.querySelector('[aria-label="当前来源"]')).not.toBeNull()
  expect(sourceRow.contains(sourceTools.querySelector('[aria-label="当前来源"]'))).toBe(false)
  await press(host, '编辑当前来源')
  visibleSourceAction(host, '收起来源编辑', '收起编辑')
  await press(host, '收起来源编辑')
  visibleSourceAction(host, '编辑当前来源', '编辑来源')
  await press(host, '编辑当前来源')
  expect(host.querySelector<HTMLInputElement>('input[aria-label="作者"]')!.value).toBe('当前作者')
  const original = editor.state.doc
  type(host, '标题', '取消草稿')
  const panel = host.querySelector<HTMLElement>('.mimir-docx-inspector')!
  act(() => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(host.querySelector('.mimir-docx-inspector')).toBeNull()
  expect(document.activeElement).toBe(host.querySelector('[aria-label="引文与来源"]'))
  expect(editor.state.doc).toBe(original)
  await press(host, '引文与来源')
  pick(host, '引用工具', '管理来源')
  visibleSourceAction(host, '新建来源', '新建来源')
  expect(host.querySelector<HTMLInputElement>('input[aria-label="标题"]')!.value).toBe('当前标题')
  act(() => editor.commands.insertContent('手动编辑'))
  expect(host.querySelector<HTMLButtonElement>('[aria-label="保存来源"]')!.disabled).toBe(true)
  for (const select of host.querySelectorAll('.mimir-docx-references .ant-select'))
    expect(select.classList.contains('ant-select-disabled')).toBe(true)
})

it('caption, field and index show correct previews and native actions without stealing current selected text; document switch closes the stale panel', async () => {
  const { host, editor, saves, save, render } = await boot()
  await press(host, '题注')
  pick(host, '标签', '表')
  type(host, '题注说明', '季度统计')
  expect(host.querySelector('.mimir-docx-references__sample')!.textContent).toBe('表 1 季度统计')
  await press(host, '插入题注')
  expect(editor.state.doc.child(1).attrs.genXml).toContain('SEQ 表')
  await press(host, '关闭文档属性面板')
  await press(host, '原生域')
  pick(host, '域类型', '文件名 FILENAME')
  expect(host.querySelector<HTMLInputElement>('input[aria-label="当前显示文字"]')!.value).toBe('')
  type(host, '当前显示文字', '报告.docx')
  await press(host, '插入原生域')
  await save(1)
  const native = await (await JSZip.loadAsync(saves[0]!)).file('word/document.xml')!.async('string')
  expect(native).toContain('FILENAME')
  expect(native).toContain('报告.docx')
  expect(native).toContain('季度统计')
  await render('different-document')
  await settle(() => !host.querySelector('.mimir-docx-inspector'))
  const current = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  expect(referenceSources(current.state.doc, await openDocx(bytes))).toEqual([])
})
