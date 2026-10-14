// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { HtmlEditor } from './HtmlEditor.js'
import type { HtmlAgentHandle } from '../agent/html-agent.js'

// The upstream dialogs own the canvas pixel algorithm. This verifies their PNG result crosses
// the HTML canvas/version boundary and reaches real saved bytes.
vi.mock('../../vendor/packages/ui/src/image-dialogs.js', () => ({
  CropDialog: ({ onApply }: { onApply: (png: string) => void }) => (
    <div role="dialog" aria-label="裁切图片">
      <button type="button" onClick={() => onApply('AA==')}>
        应用模拟 PNG
      </button>
    </div>
  ),
  CutoutDialog: ({ onApply }: { onApply: (png: string) => void }) => (
    <div role="dialog" aria-label="去除图片背景">
      <button type="button" onClick={() => onApply('AQ==')}>
        应用模拟 PNG
      </button>
    </div>
  ),
}))

const ORIGINAL =
  '<!doctype html><html><body><img src="data:image/png;base64,Ag=="><p>说明</p></body></html>'

it('裁切 PNG 结果进入 HTML 原件，版本变化则拒绝过期像素', async () => {
  let saved: Uint8Array | null = null
  let agent: HtmlAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(
      <HtmlEditor
        documentId="picture-html"
        io={{
          load: async () => new TextEncoder().encode(ORIGINAL),
          save: async (bytes) => {
            saved = bytes
          },
        }}
        onAgentHandleChange={(handle) => {
          agent = handle
        }}
      />,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const handle = agent as HtmlAgentHandle | null
  if (!handle) throw new Error('HTML Agent 句柄未挂载')
  const imgSid = handle.getDocument().map.elements.find((entry) => entry.tag === 'img')?.sid
  const pSid = handle.getDocument().map.elements.find((entry) => entry.tag === 'p')?.sid
  if (imgSid === undefined || pSid === undefined) throw new Error('测试元素未解析')
  const selectImage = () =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'gx:select',
            version: handle.getVersion(),
            element: {
              sid: imgSid,
              tag: 'img',
              className: '',
              computed: { image: { src: 'data:image/png;base64,Ag==' } },
            },
          },
          source: host.querySelector('iframe')!.contentWindow,
        }),
      )
    })
  selectImage()
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="元素编辑"]')!.click())
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[aria-label="裁切图片像素"]')!.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(host.querySelector('[role="dialog"][aria-label="裁切图片"]')).not.toBeNull()
  await act(async () => {
    await handle.execute('apply_ops', { ops: [{ op: 'set_text', sid: pSid, text: '期间改动' }] })
  })
  act(() => host.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click())
  expect(handle.getDocument().text).toContain('data:image/png;base64,Ag==')
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('已变化')
  selectImage()
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[aria-label="裁切图片像素"]')!.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  act(() => host.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click())
  expect(handle.getDocument().text).toContain('data:image/png;base64,AA==')
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.click())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const reopened = new TextDecoder().decode(saved!)
  expect(reopened).toBe(handle.getDocument().text)
  expect(reopened).not.toContain('data-sid')
  act(() => root.unmount())
  host.remove()
})
