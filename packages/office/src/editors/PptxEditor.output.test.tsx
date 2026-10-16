/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ConfigProvider } from 'antd'
import { PptxEditor } from './PptxEditor.js'
import { openPptxForEdit, textOfElement } from '../pptx.js'
import * as output from '../pptx-output.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose())
  vi.restoreAllMocks()
})
const click = (element: Element) =>
  act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`没有按钮：${label}`)
  return found
}
function edit(host: HTMLElement, value: string) {
  const field = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="文本框文字"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function settle(done: () => boolean) {
  for (let i = 0; i < 80 && !done(); i++)
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 5))
    })
  expect(done()).toBe(true)
}
async function text(bytes: Uint8Array) {
  const session = await openPptxForEdit(bytes)
  return session
    .slides()[0]!
    .elements.flatMap((element) =>
      (textOfElement(element)?.paragraphs ?? []).flatMap((paragraph) =>
        paragraph.runs.map((run) => run.text),
      ),
    )
    .join('')
}
it('downloads the live native copy without persistence or history reset, then saves and undoes/redoes subsequent edits', async () => {
  const fixture = new Uint8Array(
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
    ),
  )
  const saved: Uint8Array[] = []
  const download = vi.spyOn(output, 'downloadPptxOutput').mockImplementation(() => {})
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await act(async () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PptxEditor
          documentId="copy-history"
          io={{
            load: async () => fixture,
            save: async (bytes) => {
              saved.push(bytes)
            },
          }}
        />
      </ConfigProvider>,
    ),
  )
  await settle(() => host.querySelector('.mimir-pptx-slide svg') !== null)
  click(host.querySelector('.mimir-pptx-slide [data-element-id]')!)
  edit(host, '副本中的未保存文字')
  const viewTab = [...host.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.textContent === '视图',
  )!
  click(viewTab)
  click(button(host, '导出与打印'))
  click(button(host, '下载 PPTX 副本'))
  await settle(() => download.mock.calls.length === 1)
  expect(saved).toHaveLength(0)
  expect(await text(download.mock.calls[0]![0].bytes)).toContain('副本中的未保存文字')
  expect(button(host, '保存到库').disabled).toBe(false)
  expect(button(host, '撤销').disabled).toBe(false)
  click(button(host, '关闭幻灯片属性面板'))
  edit(host, '副本后继续修改')
  const save = async () => {
    const count = saved.length
    click(button(host, '保存到库'))
    await settle(() => saved.length === count + 1 && button(host, '保存到库').disabled)
    return text(saved.at(-1)!)
  }
  expect(await save()).toContain('副本后继续修改')
  click(button(host, '撤销'))
  expect(await save()).toContain('副本中的未保存文字')
  click(button(host, '重做'))
  expect(await save()).toContain('副本后继续修改')
  expect(download).toHaveBeenCalledTimes(1)
})
