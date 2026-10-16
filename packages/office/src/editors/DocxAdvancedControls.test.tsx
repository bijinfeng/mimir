// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import type { SaveOptions } from '../../vendor/packages/docx-engine/src/patch.js'
import { openDocx, type DocxSession } from '../docx.js'
import {
  createDocxAgentHandle,
  docxAgentLiveSections,
  type DocxAgentHandle,
} from '../agent/docx-agent.js'
import { DocxEditor, DocxToolbar } from './DocxEditor.js'
import { withLiveWatermark } from '../docx-live.js'
import { endnoteItems, makeGapNotesEl } from '../footnotes.js'
import { openSelect, selectRoot } from '../shell/antd-test-dom.js'

const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
)
const mounted: (() => void)[] = []
afterEach(() => {
  mounted.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
})
interface Live {
  editor: Editor
  handle: DocxAgentHandle
  options: { current: SaveOptions }
  notice: string
}
function Harness({ session, ready }: { session: DocxSession; ready: (live: Live) => void }) {
  const editor = useEditor({ extensions: editorExtensions, content: session.content as never })
  const [options] = useState<{ current: SaveOptions }>(() => ({ current: {} }))
  const handle = useRef<DocxAgentHandle | null>(null)
  const [snapshot, setSnapshot] = useState<SaveOptions>({})
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!editor) return
    const agent = createDocxAgentHandle(editor, 'advanced-docx', {
      session,
      saveOptions: options,
      isDirty: () => true,
      onDirtyChange: () => {},
      onSaveOptionsChange: () => setSnapshot(structuredClone(options.current)),
    })
    handle.current = agent
    ready({ editor, handle: agent, options, notice: '' })
    return () => agent.dispose()
  }, [editor, session, options, ready])
  return (
    <>
      <DocxToolbar
        editor={editor}
        disabled={!editor}
        headingLevels={session.headingLevels}
        findOpen={false}
        onToggleFind={() => {}}
        onNotice={setNotice}
        noteVersion={() => handle.current?.getVersion() ?? -1}
        advanced={
          editor
            ? {
                session,
                options: snapshot,
                sections: docxAgentLiveSections(editor, session, snapshot),
                execute: async (tool, args, expectedVersion) => {
                  try {
                    return await handle.current!.execute(tool, args, {
                      ...(expectedVersion >= 0 ? { expectedVersion } : {}),
                      roundId: 'manual-test',
                    })
                  } catch (error) {
                    setNotice(error instanceof Error ? error.message : String(error))
                    return null
                  }
                },
              }
            : undefined
        }
      />
      <EditorContent editor={editor} />
      <div role="status">{notice}</div>
    </>
  )
}
async function boot(input?: Uint8Array) {
  const session = await openDocx(input ?? new Uint8Array(readFileSync(FIXTURE)))
  let current: Live | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <Harness
        session={session}
        ready={(value) => {
          current = value
        }}
      />,
    ),
  )
  mounted.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return {
    host,
    session,
    live: () => current!,
    save: async () => session.save(current!.editor.getJSON() as never, current!.options.current),
  }
}
function press(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!button) throw new Error(`缺少 ${label}`)
  act(() => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    button.click()
  })
}
function tab(host: HTMLElement, label: string) {
  act(() =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('[role=tab]'))
      .find((item) => item.textContent === label)!
      .click(),
  )
}
function type(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  )
  if (!input) throw new Error(`缺少输入 ${label}`)
  act(() => {
    const prototype =
      input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function apply(host: HTMLElement, label: string) {
  await act(async () => {
    press(host, label)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
function pick(host: HTMLElement, label: string, text: string) {
  selectRoot(host, label)
  openSelect(host, label)
  const option = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option')).find(
    (item) => item.textContent === text,
  )
  expect(option).toBeTruthy()
  act(() => {
    option!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    option!.click()
  })
}
async function confirm(label: string) {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.ant-popconfirm button'),
  ).find((item) => item.textContent === label)
  expect(button).toBeTruthy()
  await act(async () => {
    button!.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
async function xml(bytes: Uint8Array, path = 'word/document.xml') {
  return (await JSZip.loadAsync(bytes)).file(path)!.async('string')
}

async function settle(done: () => boolean) {
  for (let i = 0; i < 60 && !done(); i++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2))
    })
}

describe('DOCX 高级手动工具', () => {
  it('管理样式通过真实控件创建、应用并再次修改定义，保存后独立读回', async () => {
    const { host, live, save } = await boot()
    const target = live()
      .handle.getContext()
      .blocks.find((block) => block.type === 'docParagraph' && block.text.length > 0)!.index
    let at = 0
    live().editor.state.doc.forEach((node, offset, index) => {
      if (index === target) at = offset + 1
    })
    act(() => live().editor.commands.setTextSelection(at))
    press(host, '管理样式')
    pick(host, '选择文档样式', '新建样式')
    type(host, '样式标识', 'MimirUI')
    type(host, '样式名称', '手动样式')
    type(host, '文字颜色', 'C00000')
    await apply(host, '创建样式定义')
    await settle(() => host.querySelector('button[aria-label="更新样式定义"]') !== null)
    const applyButton = () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="应用样式到选区"]')
    await settle(() => applyButton()?.disabled === false)
    await apply(host, '应用样式到选区')
    expect(live().editor.state.doc.child(target).attrs.styleId).toBe('MimirUI')
    const first = await openDocx(await save())
    expect(first.blocks[target]?.styleId).toBe('MimirUI')
    expect(first.footnotes.parsed.styles.get('MimirUI')?.display?.color).toBe('C00000')
    type(host, '文字颜色', '123456')
    await apply(host, '更新样式定义')
    await settle(
      () => host.querySelector<HTMLInputElement>('[aria-label="文字颜色"]')?.value === '123456',
    )
    const second = await openDocx(await save())
    expect(second.footnotes.parsed.styles.get('MimirUI')?.display?.color).toBe('123456')
  })

  it('图表按钮插入多系列、画布可见、修改选中图表后连续两次保存重开', async () => {
    const { host, live, save } = await boot()
    tab(host, '插入')
    press(host, '图表')
    type(host, '图表标题', '销售 & 增长')
    press(host, '添加图表系列')
    type(host, '系列 2 名称', '目标')
    type(host, '系列 2 数值（每行一项）', '15\n30')
    await apply(host, '插入图表到文档')
    expect(
      live()
        .editor.getJSON()
        .content?.some((node) => node.attrs?.chartDisplay?.title === '销售 & 增长'),
    ).toBe(true)
    expect(live().editor.view.dom.textContent).toContain('销售 & 增长')
    const first = await save()
    const opened = await openDocx(first)
    expect(
      (opened.content as JSONContent).content?.find((node) => node.attrs?.chartDisplay)?.attrs
        ?.chartDisplay.series,
    ).toHaveLength(2)
    press(host, '图表')
    let chartPos = -1
    live().editor.state.doc.forEach((node, offset) => {
      if (node.attrs.chartDisplay) chartPos = offset
    })
    act(() => {
      live().editor.commands.setNodeSelection(chartPos)
    })
    press(host, '图表')
    type(host, '图表标题', '更新图表')
    type(host, '系列 1 数值（每行一项）', '42\n84')
    await apply(host, '应用图表修改')
    expect(live().editor.view.dom.textContent).toContain('更新图表')
    const second = await save()
    const reopened = await openDocx(second)
    const chart = (reopened.content as JSONContent).content?.find(
      (node) => node.attrs?.chartDisplay,
    )?.attrs?.chartDisplay
    expect(chart.title).toBe('更新图表')
    expect(chart.series[0].values).toEqual([42, 84])
    expect(chart.series[1].values).toEqual([15, 30])
    const third = await reopened.save(reopened.content)
    expect(
      ((await openDocx(third)).content as JSONContent).content?.find(
        (node) => node.attrs?.chartDisplay,
      )?.attrs?.chartDisplay.title,
    ).toBe('更新图表')
  })
  it('文本框、文字水印、页面与节均经真实执行器并保存重开', async () => {
    const { host, live, session, save } = await boot()
    tab(host, '插入')
    press(host, '文本框')
    type(host, '文本框内容', '文本框内容 & 中文')
    await apply(host, '插入文本框到文档')
    expect(live().editor.view.dom.textContent).toContain('文本框内容 & 中文')
    tab(host, '布局')
    press(host, '水印')
    type(host, '水印文字', '内部草稿')
    await apply(host, '应用文字水印')
    const preview = withLiveWatermark(
      session.headerFooter,
      live().options.current.watermark,
      session.sections,
    )
    expect(preview.header?.images?.find((image) => image.wordArt)?.wordArt?.text).toBe('内部草稿')
    press(host, '水印')
    press(host, '页面与节')
    const pageWidth = () =>
      (host.querySelector('[aria-label="纸张宽度（磅）"]') as HTMLInputElement).value
    const pageHeight = () =>
      (host.querySelector('[aria-label="纸张高度（磅）"]') as HTMLInputElement).value
    const initialWidth = pageWidth()
    const initialHeight = pageHeight()
    pick(host, '纸张方向', '横向')
    expect(pageWidth()).toBe(initialHeight)
    expect(pageHeight()).toBe(initialWidth)
    pick(host, '纸张方向', '横向')
    expect(pageWidth()).toBe(initialHeight)
    expect(pageHeight()).toBe(initialWidth)
    pick(host, '纸张方向', '纵向')
    expect(pageWidth()).toBe(initialWidth)
    expect(pageHeight()).toBe(initialHeight)
    pick(host, '纸张方向', '横向')
    await apply(host, '应用页面设置')
    expect(
      docxAgentLiveSections(live().editor, session, live().options.current)[0]?.settings
        .orientation,
    ).toBe('landscape')
    await apply(host, '在当前段后插入分节符')
    const first = await save()
    const reopened = await openDocx(first)
    expect(reopened.footnotes.parsed.watermarkText).toBe('内部草稿')
    expect(reopened.sections).toHaveLength(session.sections.length + 1)
    expect(reopened.sections.some((section) => section.settings.orientation === 'landscape')).toBe(
      true,
    )
    expect(await xml(first)).toContain('文本框内容 &amp; 中文')
    const second = await reopened.save(reopened.content)
    expect(await xml(second)).toContain('文本框内容 &amp; 中文')
    expect((await openDocx(second)).footnotes.parsed.watermarkText).toBe('内部草稿')
    tab(host, '布局')
    press(host, '页面与节')
    press(host, '水印')
    await apply(host, '移除文档水印')
    expect(
      withLiveWatermark(
        preview,
        live().options.current.watermark,
        session.sections,
      ).header?.images?.some((image) => image.wordArt),
    ).toBe(false)
  })
  it('批注修改、回复、解决、重开讨论和删除保留锚点并保存两次', async () => {
    const { host, live, save } = await boot()
    const target = live()
      .handle.getContext()
      .blocks.find((block) => block.type === 'docParagraph' && block.text.length > 0)!
    await act(async () => {
      await live().handle.execute('add_comment', {
        blockIndex: target.index,
        comment: '初始批注',
        author: '用户',
      })
    })
    tab(host, '审阅')
    press(host, '管理批注')
    pick(host, '选择批注', '用户：初始批注')
    type(host, '批注正文', '修改后的批注')
    await apply(host, '保存批注修改')
    type(host, '批注回复', '回复内容')
    await apply(host, '回复当前批注')
    await apply(host, '解决当前批注')
    pick(host, '选择批注', '回复 · 用户：回复内容')
    await apply(host, '重新打开批注讨论')
    expect(host.querySelector('button[aria-label="重新打开批注讨论"]')).toBeNull()
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="解决当前批注"]')!.disabled,
    ).toBe(false)
    const first = await save()
    const reopened = await openDocx(first)
    const comment = reopened.footnotes.parsed.comments.find((item) => item.text === '修改后的批注')!
    expect(comment).toBeTruthy()
    expect(comment.done).not.toBe(true)
    expect(
      reopened.footnotes.parsed.comments.find((item) => item.parentId === comment.id)?.author,
    ).toBe('用户')
    expect(await xml(first)).toContain(`w:id="${comment.id}"`)
    const second = await reopened.save(reopened.content)
    expect(
      (await openDocx(second)).footnotes.parsed.comments.find((item) => item.id === comment.id)
        ?.text,
    ).toBe('修改后的批注')
    pick(host, '选择批注', '用户：修改后的批注')
    press(host, '删除当前批注')
    await confirm('删除批注')
    expect(
      (await openDocx(await save())).footnotes.parsed.comments.some(
        (item) => item.id === comment.id || item.parentId === comment.id,
      ),
    ).toBe(false)
  })
  it('脚注与尾注管理修改及删除；尾注正文使用 endnote 编号渲染', async () => {
    const { host, live, session, save } = await boot()
    const target = live()
      .handle.getContext()
      .blocks.find((block) => block.type === 'docParagraph' && block.text.length > 0)!
    await act(async () => {
      await live().handle.execute('insert_endnote', { blockIndex: target.index, text: '原始尾注' })
    })
    tab(host, '审阅')
    press(host, '管理脚注与尾注')
    const notes = (await live().handle.execute('read_notes', {})).data as {
      kind: string
      id: string
      text: string
    }[]
    const added = notes.find((item) => item.text === '原始尾注')!
    pick(host, '选择脚注或尾注', `尾注 ${added.id}：原始尾注`)
    type(host, '查找注释文字', '原始')
    type(host, '替换注释文字为', '更新')
    await apply(host, '应用注释修改')
    const definitions = live().options.current.endnotes!
    const entries = endnoteItems(
      session.footnotes.parsed,
      definitions,
      session.sections[0]!.settings,
    )
    const dom = makeGapNotesEl(entries, 500)
    expect(
      dom.querySelector(`[data-note-kind=endnote][data-note-id="${added.id}"]`)?.textContent,
    ).toContain('更新尾注')
    const first = await save()
    const reopened = await openDocx(first)
    expect(reopened.footnotes.parsed.endnotes.find((item) => item.id === added.id)?.text).toBe(
      '更新尾注',
    )
    const second = await reopened.save(reopened.content)
    expect(
      (await openDocx(second)).footnotes.parsed.endnotes.find((item) => item.id === added.id)?.text,
    ).toBe('更新尾注')
    press(host, '删除当前注释')
    await confirm('删除注释')
    expect(
      (await openDocx(await save())).footnotes.parsed.endnotes.some((item) => item.id === added.id),
    ).toBe(false)
  })
  it('完整编辑器画布显示未保存的水印和尾注，移除水印后保留正文', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: () => ({
        width: 200,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 200,
        actualBoundingBoxAscent: 80,
        actualBoundingBoxDescent: 20,
      }),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const index = this.parentElement?.classList.contains('ProseMirror')
        ? Array.from(this.parentElement.children).indexOf(this)
        : 0
      if (this.classList.contains('mimir-compact-toolbar__commands'))
        return DOMRect.fromRect({ width: 624, height: 56 })
      if (this.dataset.sectionKey) return DOMRect.fromRect({ width: 160, height: 56 })
      if (this.classList.contains('doc-page'))
        return DOMRect.fromRect({ x: 0, y: 0, width: 816, height: 1056 })
      if (this.classList.contains('ProseMirror'))
        return DOMRect.fromRect({ x: 96, y: 96, width: 624, height: this.children.length * 24 })
      return DOMRect.fromRect({ x: 96, y: 96 + index * 24, width: 624, height: 24 })
    })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let handle: DocxAgentHandle | null = null
    await act(async () =>
      root.render(
        <DocxEditor
          documentId="canvas-advanced"
          io={{ load: async () => new Uint8Array(readFileSync(FIXTURE)), save: async () => {} }}
          onAgentHandleChange={(value) => {
            handle = value
          }}
        />,
      ),
    )
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })

    await settle(() => handle !== null)
    tab(host, '布局')
    press(host, '水印')
    type(host, '水印文字', '画布水印')
    await apply(host, '应用文字水印')
    await settle(
      () => host.querySelector('.mimir-page-images')?.textContent?.includes('画布水印') === true,
    )
    expect(host.querySelector('.mimir-page-images')?.textContent).toContain('画布水印')
    tab(host, '审阅')
    await apply(host, '撤销上次结构操作')
    await settle(() => !host.querySelector('.mimir-page-images')?.textContent?.includes('画布水印'))
    expect(host.querySelector('.mimir-page-images')?.textContent ?? '').not.toContain('画布水印')
    tab(host, '布局')
    press(host, '水印')
    type(host, '水印文字', '画布水印')
    await apply(host, '应用文字水印')

    const current = handle! as DocxAgentHandle
    const target = current
      .getContext()
      .blocks.find((block) => block.type === 'docParagraph' && block.text.length > 0)!
    await act(async () => {
      await current.execute('insert_endnote', { blockIndex: target.index, text: '画布尾注正文' })
    })
    await settle(() => host.querySelector('.page-gap-note[data-note-kind=endnote]') !== null)
    expect(host.querySelector('.page-gap-note[data-note-kind=endnote]')?.textContent).toContain(
      '画布尾注正文',
    )
    let footId = ''
    await act(async () => {
      const inserted = await current.execute('insert_footnote', {
        blockIndex: target.index,
        text: '旧脚注',
      })
      footId = (inserted.data as { id: string }).id
    })
    await settle(
      () =>
        host
          .querySelector(`.page-gap-note[data-note-kind=footnote][data-note-id="${footId}"]`)
          ?.textContent?.includes('旧脚注') === true,
    )
    await act(async () => {
      await current.execute('edit_note', {
        kind: 'footnote',
        id: footId,
        find: '旧',
        replace: '新',
      })
    })
    await settle(
      () =>
        host
          .querySelector(`.page-gap-note[data-note-kind=footnote][data-note-id="${footId}"]`)
          ?.textContent?.includes('新脚注') === true,
    )
    expect(
      host.querySelector(`.page-gap-note[data-note-kind=footnote][data-note-id="${footId}"]`)
        ?.textContent,
    ).toContain('新脚注')
    press(host, '水印')
    press(host, '水印')
    await apply(host, '移除文档水印')
    await settle(() => !host.querySelector('.mimir-page-images')?.textContent?.includes('画布水印'))
    expect(host.querySelector('.mimir-page-images')?.textContent ?? '').not.toContain('画布水印')
    expect(host.querySelector('.ProseMirror')?.textContent).toContain(target.text)
  })

  it('保存等待期间的新结构修改保留未保存状态和可用回退', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let handle: DocxAgentHandle | null = null
    const saved: Uint8Array[] = []
    let finishSave: (() => void) | undefined
    const io = {
      load: async () => new Uint8Array(readFileSync(FIXTURE)),
      save: async (bytes: Uint8Array) => {
        saved.push(bytes)
        if (saved.length === 1)
          await new Promise<void>((resolve) => {
            finishSave = resolve
          })
      },
    }
    await act(async () =>
      root.render(
        <DocxEditor
          documentId="saving-advanced"
          io={io}
          onAgentHandleChange={(value) => {
            handle = value
          }}
        />,
      ),
    )
    mounted.push(() => {
      act(() => root.unmount())
      host.remove()
    })
    await settle(() => handle !== null)
    tab(host, '布局')
    press(host, '水印')
    type(host, '水印文字', '保存前')
    await apply(host, '应用文字水印')
    press(host, '保存到库')
    await settle(() => !!finishSave)
    type(host, '水印文字', '保存中修改')
    await apply(host, '应用文字水印')
    await act(async () => {
      finishSave!()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await settle(() => !!host.querySelector('button[aria-label="保存到库"]'))
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="保存到库"]')!.disabled).toBe(
      false,
    )
    tab(host, '审阅')
    await apply(host, '撤销上次结构操作')
    await apply(host, '保存到库')
    await settle(() => saved.length === 2)
    expect((await openDocx(saved[0]!)).footnotes.parsed.watermarkText).toBe('保存前')
    expect((await openDocx(saved[1]!)).footnotes.parsed.watermarkText).toBe('保存前')
  })

  it('面板打开后正文另有修改时拒绝过期操作并保留草稿', async () => {
    const { host, live } = await boot()
    tab(host, '插入')
    press(host, '文本框')
    type(host, '文本框内容', '保留输入草稿')
    act(() => {
      live().editor.commands.insertContent('人工修改')
    })
    await apply(host, '插入文本框到文档')
    expect(host.textContent).toContain('请重新读取后再操作')
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="文本框内容"]')?.value).toBe(
      '保留输入草稿',
    )
    expect(live().editor.view.dom.textContent).not.toContain('保留输入草稿')
  })
})
