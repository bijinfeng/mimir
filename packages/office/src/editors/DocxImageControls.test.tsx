// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { openDocx } from '../docx.js'
import { createDocxAgentHandle } from '../agent/docx-agent.js'
import { DocxImageControls } from './DocxImageControls.js'
import { DocxTocControls } from './DocxTocControls.js'
import { DocxToolbar } from './DocxEditor.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'

const mocked = vi.hoisted(() => ({
  process:
    vi.fn<
      (
        url: string,
        operation: unknown,
        signal: AbortSignal,
      ) => Promise<{ dataUrl: string; width: number; height: number }>
    >(),
}))
vi.mock('./docx-image.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./docx-image.js')>()),
  processDocxImage: mocked.process,
}))
const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
)
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNioAAAAASUVORK5CYII='
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
  mocked.process.mockReset()
})

async function boot(
  kind: 'image' | 'toc' | 'toolbar' = 'image',
  noHeadings = false,
  imageAttrs?: Record<string, unknown>,
) {
  const fixtureZip = await JSZip.loadAsync(new Uint8Array(readFileSync(FIXTURE)))
  fixtureZip.file(
    'word/media/image1.png',
    Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAPAAAACgCAYAAAAy2+FlAAAEGElEQVR4nO3csXEYVxBEQQaBSBgEgqCtQBQZw6HNDKASfFi4Kgz2tbFntjWvvnc/Xl5e3pxz3/N+/P/5+/r62PH2vNffvx473pYn4IC3PECegHkCznoCDnjLA+QJmCfgrCfggLc8QJ6AeQLOegIOeMsD5AmYJ+CsJ+CAtzxAnoB5As56Ag54ywPkCZgn4Kwn4IC3PECegHkCznoCDnjLA+QJmCfgrCfggLc8QJ6AeQLOeu8BO+e+53mBA97yC8J74AVeHyBPwDwBZ73lAfIEzBNw1hNwwFseIE/APAFnPQEHvOUB8gTME3DWE3DAWx4gT8A8AWc9AQe85QHyBMwTcNYTcMBbHiBPwDwBZz0BB7zlAfIEzBNw1hNwwFseIE/APAFnPQEHvOUB8h4I2Dn3Pc8LHPCWXxDeAy/w+gB5AuYJOOstD5AnYJ6As56AA97yAHkC5gk46wk44C0PkCdgnoCznoAD3vIAeQLmCTjrCTjgLQ+QJ2CegLOegAPe8gB5AuYJOOsJOOAtD5AnYJ6As56AA97yAHkC5gk46wk44C0PkPdAwM6573le4IC3/ILwHniB1wfIEzBPwFlveYA8AfMEnPUEHPCWB8gTME/AWU/AAW95gDwB8wSc9QQc8JYHyBMwT8BZT8ABb3mAPAHzBJz1BBzwlgfIEzBPwFlPwAFveYA8AfMEnPUEHPCWB8gTME/AWU/AAW95gLzPB/yvO31v7u69B/z398/Hjjfnvf38589jx9vyBHzfmx4gT8A8AWc9Ad/3pgfIEzBPwFlPwPe96QHyBMwTcNYT8H1veoA8AfMEnPUEfN+bHiBPwDwBZz0B3/emB8gTME/AWU/A973pAfIEzBNw1hPwfW96gDwB8wSc9QR835seIE/APAFnvfeA3en78v82Of/E4nmBeR+9wOMD5AmYJ+CsNz1AnoB5As56Ar7vTQ+QJ2CegLOegO970wPkCZgn4Kwn4Pve9AB5AuYJOOsJ+L43PUCegHkCznoCvu9ND5AnYJ6As56A73vTA+QJmCfgrCfg+970AHkC5gk46wn4vjc9QN4DAbvT9+X/bXL+icXzAvM+eoHHB8gTME/AWW96gDwB8wSc9QR835seIE/APAFnPQHf96YHyBMwT8BZT8D3vekB8gTME3DWE/B9b3qAPAHzBJz1BHzfmx4gT8A8AWc9Ad/3pgfIEzBPwFlPwPe96QHyBMwTcNYT8H1veoC8BwJ2p+/L/9vk/BOL5wXmffQCjw+QJ2CegLPe9AB5AuYJOOsJ+L43PUCegHkCznoCvu9ND5AnYJ6As56A73vTA+QJmCfgrCfg+970AHkC5gk46wn4vjc9QJ6AeQLOegK+700PkCdgnoCznoDve9MD5AmYJ+CsJ+D73vQAeZ+7/wA9VoS5LWxMlQAAAABJRU5ErkJggg==',
      ),
      (char) => char.charCodeAt(0),
    ),
  )
  const bytes = await fixtureZip.generateAsync({ type: 'uint8array' })
  const session = await openDocx(bytes)
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: session.content as never,
  })
  if (noHeadings)
    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'docParagraph', content: [{ type: 'text', text: '没有标题的正文' }] }],
    })
  let pos = 0
  editor.state.doc.forEach((node, offset) => {
    if (node.attrs.blockType === 'image') pos = offset
  })
  if (kind === 'image') {
    editor.commands.setNodeSelection(pos)
    if (imageAttrs)
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(pos, undefined, {
          ...editor.state.doc.nodeAt(pos)!.attrs,
          ...imageAttrs,
        }),
      )
  } else editor.commands.setTextSelection(1)
  const handle = createDocxAgentHandle(editor, 'manual-picture', {
    session,
    saveOptions: { current: {} },
    isDirty: () => false,
    onDirtyChange: () => {},
  })
  const execute = vi.fn<DocxAdvancedContext['execute']>(async (tool, args, version) => {
    try {
      return await handle.execute(tool, args, { expectedVersion: version })
    } catch {
      return null
    }
  })
  const context: DocxAdvancedContext = {
    editor,
    session,
    version: handle.getVersion(),
    options: {},
    sections: session.sections,
    execute,
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const render = async () =>
    act(async () =>
      root.render(
        <ConfigProvider componentSize="small">
          {kind === 'image' ? (
            <DocxImageControls context={context} />
          ) : kind === 'toc' ? (
            <DocxTocControls context={context} />
          ) : (
            <DocxToolbar
              editor={editor}
              disabled={false}
              headingLevels={session.headingLevels}
              findOpen={false}
              onToggleFind={() => {}}
              onNotice={() => {}}
              advanced={context}
              noteVersion={() => handle.getVersion()}
            />
          )}
        </ConfigProvider>,
      ),
    )
  await render()
  let unmounted = false
  const unmount = () => {
    if (!unmounted) {
      act(() => root.unmount())
      host.remove()
      unmounted = true
    }
  }
  cleanups.push(() => {
    unmount()
    handle.dispose()
    editor.destroy()
  })
  return { host, editor, session, bytes, execute, context, handle, unmount, pos, render }
}
function button(host: HTMLElement, label: string) {
  const result = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!result) throw new Error(`缺少按钮 ${label}`)
  return result
}
async function press(host: HTMLElement, label: string) {
  const target = button(host, label)
  act(() => target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
  await act(async () => target.click())
}
function type(host: HTMLElement, label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  act(() => {
    field.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function parts(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.keys(zip.files).map(async (name) => [
        name,
        await zip.files[name]!.async('uint8array'),
      ]),
    ),
  )
}

describe('DOCX compact picture Inspector', () => {
  it('reads current values; first apply commits latest number draft and a single undo/redo restores native file', async () => {
    const { host, editor, session, pos, bytes } = await boot()
    const original = editor.state.doc
    expect(host.querySelector<HTMLInputElement>('input[aria-label="图片宽度"]')!.value).toBe('2.54')
    expect(button(host, '应用图片格式').disabled).toBe(true)
    expect(button(host, '应用图片格式').textContent).toBe('应用图片格式')
    type(host, '图片宽度', '5.08')
    await press(host, '图片向右旋转90度')
    await press(host, '图片水平翻转')
    expect(editor.state.doc).toBe(original)
    expect(button(host, '图片水平翻转').getAttribute('aria-pressed')).toBe('true')
    await press(host, '应用图片格式')
    expect(editor.state.doc.nodeAt(pos)!.attrs).toMatchObject({
      imageWidthPx: 192,
      imageHeightPx: 192,
      imageRotDeg: 90,
      imageFlipH: true,
    })
    const first = await session.save(editor.getJSON() as never)
    expect((await openDocx(first)).blocks.find((node) => node.type === 'image')).toMatchObject({
      imageWidthPx: 192,
      imageRotDeg: 90,
      imageFlipH: true,
    })
    expect(await parts(await session.save(editor.getJSON() as never))).toEqual(await parts(first))
    act(() => {
      editor.commands.undo()
    })
    expect(await session.save(editor.getJSON() as never)).toEqual(bytes)
    act(() => {
      editor.commands.redo()
    })
    expect(await parts(await session.save(editor.getJSON() as never))).toEqual(await parts(first))
  })

  it('supports unlocked dimensions, resets drafts, and discards all unsubmitted work on close', async () => {
    const { host, editor, unmount } = await boot()
    const original = editor.getJSON()
    await press(host, '锁定图片纵横比')
    type(host, '图片宽度', '5.08')
    await press(host, '图片垂直翻转')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="图片高度"]')!.value).toBe('2.54')
    await press(host, '重置图片修改草稿')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="图片宽度"]')!.value).toBe('2.54')
    await press(host, '图片向左旋转90度')
    unmount()
    expect(editor.getJSON()).toEqual(original)
  })

  it('applies crop once; cutout preparation remains draft-only and cancellation rejects late pixels', async () => {
    const { host, editor, session, bytes, handle } = await boot()
    const original = editor.state.doc
    const version = handle.getVersion()
    mocked.process.mockResolvedValueOnce({ dataUrl: PNG, width: 50, height: 25 })
    await press(host, '裁切选中图片')
    expect(button(host, '应用图片裁切').textContent).toBe('应用图片裁切')
    type(host, '左侧裁去', '25')
    await press(host, '应用图片裁切')
    expect(mocked.process).toHaveBeenLastCalledWith(
      expect.stringContaining('data:image/'),
      { kind: 'crop', insets: { left: 25, right: 0, top: 0, bottom: 0 } },
      expect.any(AbortSignal),
    )
    expect(editor.state.doc).not.toBe(original)
    expect(button(host, '应用图片格式').disabled).toBe(true)
    expect(
      (await openDocx(await session.save(editor.getJSON() as never))).blocks.find(
        (node) => node.type === 'image',
      ),
    ).toMatchObject({ imageWidthPx: 96, imageHeightPx: 48 })
    const cropped = await parts(await session.save(editor.getJSON() as never))
    const saved = editor.state.doc
    let resolve: ((output: { dataUrl: string; width: number; height: number }) => void) | undefined
    mocked.process.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await press(host, '去除选中图片背景')
    await press(host, '预览图片去背景')
    const signal = mocked.process.mock.calls.at(-1)![2]
    await press(host, '取消图片处理')
    expect(signal.aborted).toBe(true)
    await act(async () => resolve?.({ dataUrl: PNG, width: 1, height: 1 }))
    expect(editor.state.doc).toBe(saved)
    expect(button(host, '预览图片去背景')).toBeDefined()
    expect(handle.getVersion()).toBe(version + 1)
    act(() => {
      editor.commands.undo()
    })
    expect(await session.save(editor.getJSON() as never)).toEqual(bytes)
    act(() => {
      editor.commands.redo()
    })
    expect(await parts(await session.save(editor.getJSON() as never))).toEqual(cropped)
  })

  it('rejects other edits while asynchronous image work is running, and aborts on close', async () => {
    const { host, editor, unmount } = await boot()
    let resolve: ((output: { dataUrl: string; width: number; height: number }) => void) | undefined
    mocked.process.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await press(host, '去除选中图片背景')
    await press(host, '预览图片去背景')
    const signal = mocked.process.mock.calls.at(-1)![2]
    act(() => {
      editor.commands.insertContentAt(1, 'keep manual text')
    })
    const edited = editor.getJSON()
    await act(async () => resolve?.({ dataUrl: PNG, width: 1, height: 1 }))
    expect(host.textContent).toContain('文档已变化')
    expect(editor.getJSON()).toEqual(edited)
    unmount()
    expect(signal.aborted).toBe(true)
    const another = await boot()
    mocked.process.mockImplementationOnce(() => new Promise(() => {}))
    await press(another.host, '去除选中图片背景')
    await press(another.host, '预览图片去背景')
    const pendingSignal = mocked.process.mock.calls.at(-1)![2]
    another.unmount()
    expect(pendingSignal.aborted).toBe(true)
  })
  it('opening/full-region apply and Escape are no-op; native crop defaults survive untouched', async () => {
    const { host, editor, bytes, session } = await boot()
    const original = editor.state.doc
    await press(host, '裁切选中图片')
    await press(host, '应用图片裁切')
    expect(mocked.process).not.toHaveBeenCalled()
    expect(editor.state.doc).toBe(original)
    expect(await session.save(editor.getJSON() as never)).toEqual(bytes)
    await press(host, '裁切选中图片')
    type(host, '左侧裁去', '25')
    act(() =>
      host
        .querySelector('input')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(button(host, '裁切选中图片')).toBeDefined()
    expect(document.activeElement).toBe(button(host, '裁切选中图片'))
    expect(editor.state.doc).toBe(original)
  })

  it('selection change during decode aborts without publishing', async () => {
    const { host, editor, handle } = await boot()
    let resolve: ((output: { dataUrl: string; width: number; height: number }) => void) | undefined
    mocked.process.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await press(host, '裁切选中图片')
    type(host, '左侧裁去', '25')
    await press(host, '应用图片裁切')
    const version = handle.getVersion()
    const signal = mocked.process.mock.calls.at(-1)![2]
    act(() => editor.commands.setTextSelection(1))
    expect(signal.aborted).toBe(true)
    await act(async () => resolve?.({ dataUrl: PNG, width: 120, height: 80 }))
    expect(handle.getVersion()).toBe(version)
    expect(host.textContent).toContain('文档已变化')
  })
  it('shows real native crop percentages and preserves rotation/flip when the region is untouched', async () => {
    const { host, editor } = await boot('image', false, {
      imageCrop: { l: 0.1, t: 0.05, r: 0.15, b: 0.2 },
      imageRotDeg: 30,
      imageFlipH: true,
    })
    const before = editor.state.doc
    await press(host, '裁切选中图片')
    for (const [label, value] of [
      ['左侧裁去', '10'],
      ['顶部裁去', '5'],
      ['右侧裁去', '15'],
      ['底部裁去', '20'],
    ]) {
      expect(
        Number(host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!.value),
      ).toBe(Number(value))
    }
    await press(host, '应用图片裁切')
    expect(editor.state.doc).toBe(before)
    expect(mocked.process).not.toHaveBeenCalled()
  })

  it('keeps rejected crop draft editable and reports failure rather than successful application', async () => {
    const { host, editor } = await boot()
    editor.registerPlugin(new Plugin({ filterTransaction: (tr) => !tr.docChanged }))
    const before = editor.state.doc
    mocked.process.mockResolvedValueOnce({ dataUrl: PNG, width: 120, height: 80 })
    await press(host, '裁切选中图片')
    type(host, '左侧裁去', '25')
    await press(host, '应用图片裁切')
    expect(editor.state.doc).toBe(before)
    expect(host.textContent).toContain('未被编辑器接受')
    expect(button(host, '应用图片裁切').disabled).toBe(false)
    expect(host.textContent).not.toContain('已应用图片修改')
  })
  it('source options changing during decode cancel the late result before any publication', async () => {
    const { host, editor, handle, context, render } = await boot()
    let resolve: ((output: { dataUrl: string; width: number; height: number }) => void) | undefined
    mocked.process.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await press(host, '裁切选中图片')
    type(host, '左侧裁去', '25')
    await press(host, '应用图片裁切')
    const version = handle.getVersion()
    const before = editor.state.doc
    const signal = mocked.process.mock.calls.at(-1)![2]
    context.options = { ...context.options, comments: [] }
    await render()
    expect(signal.aborted).toBe(true)
    await act(async () => resolve?.({ dataUrl: PNG, width: 120, height: 80 }))
    expect(editor.state.doc).toBe(before)
    expect(handle.getVersion()).toBe(version)
  })
})

describe('DOCX manual TOC entry', () => {
  it('inserts genuine TOC fields through existing Agent/version executor and survives save/history', async () => {
    const { host, editor, session, bytes, execute } = await boot('toc')
    expect(host.querySelector('[aria-label="目录标题预览"]')!.textContent).toContain('第一章 概述')
    expect(button(host, '插入目录到文档').textContent).toBe('插入目录到文档')
    const scroll = host.querySelector('.mimir-docx-toc-tools__scroll')!
    const footer = host.querySelector('.mimir-docx-toc-tools__actions')!
    expect(scroll.contains(host.querySelector('[aria-label="目录标题预览"]'))).toBe(true)
    expect(scroll.contains(button(host, '插入目录到文档'))).toBe(false)
    expect(footer.contains(button(host, '插入目录到文档'))).toBe(true)
    await press(host, '插入目录到文档')
    expect(footer.querySelector('[role="status"]')?.textContent).toContain('已插入目录字段')
    expect(scroll.querySelector('[role="status"]')).toBeNull()
    expect(execute).toHaveBeenCalledWith(
      'apply_ops',
      { ops: [{ op: 'insertToc', afterBlockIndex: -1 }] },
      expect.any(Number),
    )
    expect(editor.state.doc.firstChild!.attrs.fieldDisplay.kind).toBe('tocLine')
    const first = await session.save(editor.getJSON() as never)
    expect(
      await (await JSZip.loadAsync(first)).file('word/document.xml')!.async('string'),
    ).toContain(' TOC \\o ')
    expect(await parts(await session.save(editor.getJSON() as never))).toEqual(await parts(first))
    act(() => {
      editor.commands.undo()
    })
    expect(await session.save(editor.getJSON() as never)).toEqual(bytes)
    act(() => {
      editor.commands.redo()
    })
    expect(await parts(await session.save(editor.getJSON() as never))).toEqual(await parts(first))
    expect(button(host, '插入目录到文档').disabled).toBe(true)
  })

  it('disables without headings and rejects stale menu position without changing current document', async () => {
    const empty = await boot('toc', true)
    expect(button(empty.host, '插入目录到文档').disabled).toBe(true)
    expect(empty.host.textContent).toContain('请先将正文段落设置为标题')
    const current = await boot('toc')
    act(() => {
      current.editor.commands.insertContentAt(1, 'new manual edit')
    })
    const edited = current.editor.getJSON()
    await press(current.host, '插入目录到文档')
    expect(current.editor.getJSON()).toEqual(edited)
    expect(
      current.host.querySelector('.mimir-docx-toc-tools__actions [role="status"]')?.textContent,
    ).toContain('未能插入目录')
  })

  it('has named compact entry and a picture context tab only for real object selection', async () => {
    const { host, editor, pos } = await boot('toolbar')
    const insert = Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]')).find(
      (tab) => tab.textContent === '插入',
    )!
    await act(async () => insert.click())
    expect(button(host, '图片格式').disabled).toBe(true)
    expect(button(host, '目录').disabled).toBe(false)
    act(() => {
      editor.commands.setNodeSelection(pos)
    })
    expect(button(host, '图片格式').disabled).toBe(false)
    expect(
      Array.from(host.querySelectorAll('[role=tab]')).some((tab) => tab.textContent === '图片格式'),
    ).toBe(true)
  })
})
