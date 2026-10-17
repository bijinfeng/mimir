// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import JSZip from 'jszip'
import { afterEach, expect, it } from 'vitest'
import { DocxEditor } from './DocxEditor.js'
import { openDocx } from '../docx.js'

const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
)
const CUSTOM_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
  '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="MimirHistorySentinel"><vt:lpwstr>Preserve exactly &amp; 原件属性</vt:lpwstr></property></Properties>'
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

async function parts(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map(async (entry) => [entry.name, await entry.async('uint8array')]),
    ),
  )
}
async function settle(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2)))
  expect(done()).toBe(true)
}
async function press(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(button).not.toBeNull()
  expect(button!.disabled).toBe(false)
  await act(async () => {
    button!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    button!.click()
  })
}

it('real DOCX editor preserves every custom-property entry through picture save → undo/save → redo/save', async () => {
  const zip = await JSZip.loadAsync(new Uint8Array(readFileSync(FIXTURE)))
  zip.file('docProps/custom.xml', CUSTOM_XML)
  zip.file(
    '_rels/.rels',
    (await zip.file('_rels/.rels')!.async('string')).replace(
      '</Relationships>',
      '<Relationship Id="mimirHistoryCustom" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>',
    ),
  )
  zip.file(
    '[Content_Types].xml',
    (await zip.file('[Content_Types].xml')!.async('string')).replace(
      '</Types>',
      '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>',
    ),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  const baseline = await parts(bytes)
  const saved: Uint8Array[] = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await act(async () =>
    root.render(
      <DocxEditor
        documentId="picture-custom-history"
        io={{
          load: async () => bytes,
          save: async (next) => {
            saved.push(next.slice())
          },
        }}
      />,
    ),
  )
  await settle(
    () =>
      host.querySelector('button[aria-label="保存到库"]')?.getAttribute('title') ===
      '没有未保存的改动',
  )
  // Tiptap attaches the actual mounted instance to its editable DOM element.
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  let picturePos = -1
  editor.state.doc.forEach((node, pos) => {
    if (node.attrs.blockType === 'image') picturePos = pos
  })
  expect(picturePos).toBeGreaterThanOrEqual(0)
  act(() => editor.commands.setNodeSelection(picturePos))
  await act(async () => {
    Array.from(host.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find((tab) => tab.textContent === '图片格式')!
      .click()
  })
  await press(host, '图片格式')
  const rotation = host.querySelector<HTMLInputElement>('[aria-label="图片旋转角度"]')!
  act(() => {
    rotation.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(rotation, '30')
    rotation.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await press(host, '图片水平翻转')
  await press(host, '应用图片格式')
  const save = async (count: number) => {
    await press(host, '保存到库')
    await settle(() => saved.length === count)
    await settle(
      () => host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')?.disabled === true,
    )
    return parts(saved[count - 1]!)
  }
  const first = await save(1)
  expect(Object.keys(first).toSorted()).toEqual(Object.keys(baseline).toSorted())
  expect(
    Object.keys(first).filter(
      (name) => !Buffer.from(first[name]!).equals(Buffer.from(baseline[name]!)),
    ),
  ).toEqual(['word/document.xml'])
  expect((await openDocx(saved[0]!)).blocks.find((block) => block.type === 'image')).toMatchObject({
    imageRotDeg: 30,
    imageFlipH: true,
  })
  await press(host, '撤销 (Ctrl+Z)')
  expect(await save(2)).toEqual(baseline)
  await press(host, '重做 (Ctrl+Shift+Z)')
  expect(await save(3)).toEqual(first)
  // Repeated saved state also preserves the exact property bytes and package links.
  expect(new TextDecoder().decode(first['docProps/custom.xml'])).toBe(CUSTOM_XML)
})
