// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { HtmlEditor, type HtmlAgentServices } from './HtmlEditor.js'
import { openSelect, pickSelectOption } from '../shell/antd-test-dom.js'
import type { HtmlAgentHandle } from '../agent/html-agent.js'
import { htmlPresentationDocument } from './html-output.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const PAGE =
  '\uFEFF<!doctype html>\r\n<html><head><title>测试</title></head><body><main><p id="first">Alpha</p><p>Beta</p><script>window.keep="原件"</script></main></body></html>\r\n'
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  // happy-dom retains ranges into detached CodeMirror nodes across mounts.
  window.getSelection()?.removeAllRanges()
  document.body.textContent = ''
  vi.restoreAllMocks()
})
async function tick(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}
function click(host: HTMLElement, label: string) {
  const button =
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ??
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === label,
    )
  if (!button) throw new Error(`Missing ${label}`)
  act(() => button.click())
}
function type(host: HTMLElement, label: string, value: string) {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  )!
  if (!field) throw new Error(`Missing field ${label}`)
  act(() => {
    Object.getOwnPropertyDescriptor(
      field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    )!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function boot(services?: HtmlAgentServices, onAiPreset?: (instruction: string) => void) {
  let bytes = new TextEncoder().encode(PAGE)
  let live: HtmlAgentHandle | null = null
  let root: Root
  const host = document.createElement('div')
  document.body.append(host)
  const io = {
    load: async () => bytes,
    save: async (next: Uint8Array) => {
      bytes = next.slice()
    },
  }
  const mount = async () => {
    root = createRoot(host)
    roots.push(root)
    await act(async () =>
      root.render(
        <HtmlEditor
          documentId="complete-html"
          io={io}
          agentServices={services}
          onAiPreset={onAiPreset}
          onAgentHandleChange={(handle) => {
            live = handle
          }}
        />,
      ),
    )
    await tick()
  }
  await mount()
  return {
    host,
    get handle() {
      return live!
    },
    get bytes() {
      return bytes
    },
    async reopen() {
      act(() => root.unmount())
      roots.splice(roots.indexOf(root), 1)
      await mount()
    },
    select(computed: Record<string, string> = {}) {
      const sid = live!.getDocument().map.elements.find((entry) => entry.tag === 'p')!.sid
      act(() =>
        window.dispatchEvent(
          new MessageEvent('message', {
            source: host.querySelector('iframe')!.contentWindow,
            data: {
              type: 'gx:select',
              version: live!.getVersion(),
              element: { sid, tag: 'p', className: '', computed },
            },
          }),
        ),
      )
      return sid
    },
    async save() {
      click(host, '保存到库')
      await tick()
    },
  }
}

const cases: Array<[string, Record<string, string>, string]> = [
  ['在源码中替换文字', { 要查找的原文: 'Alpha', 替换为: 'Changed' }, '<p id="first">Changed</p>'],
  ['替换整个元素', { 内容: '<article>Changed</article>' }, '<article>Changed</article>'],
  [
    '设置内部 HTML',
    { 内容: '<strong>Changed</strong>' },
    '<p id="first"><strong>Changed</strong></p>',
  ],
  ['设置纯文本', { 内容: '<safe>' }, '&lt;safe&gt;'],
  ['插入 HTML', { 内容: '<b>Added</b>' }, 'Alpha<b>Added</b>'],
  ['删除元素', {}, '<main><p>Beta</p>'],
  ['移动到另一元素旁', {}, '<p>Beta</p><p id="first">Alpha</p>'],
  ['设置或移除属性', { 属性名: 'title', '值（留空则移除）': 'Changed' }, 'title="Changed"'],
  [
    '设置或移除行内样式',
    { 'CSS 属性名': 'color', '值（留空则移除）': 'red' },
    'style="color: red"',
  ],
  ['更换标签', { 标签名: 'article' }, '<article id="first">Alpha</article>'],
  ['替换直接文本节点', { 文本节点内容: 'Changed' }, '<p id="first">Changed</p>'],
  ['包裹文本片段', { 标签名: 'strong', 结束字符偏移: '5' }, '<strong>Alpha</strong>'],
  ['去掉元素标签', {}, '<main>Alpha<p>Beta</p>'],
]
it.each(cases)(
  '%s 真实菜单到预览、BOM/CRLF原件与二次保存读回',
  async (command, fields, expected) => {
    const app = await boot()
    const { host } = app
    app.select()
    click(host, '元素编辑')
    click(host, '内容与结构')
    pickSelectOption(host, '元素命令', command)
    for (const [name, value] of Object.entries(fields)) type(host, name, value)
    if (command === '移动到另一元素旁') {
      pickSelectOption(
        host,
        '参照元素',
        `${app.handle.getDocument().map.elements.filter((entry) => entry.tag === 'p')[1]!.path} — Beta`,
      )
      pickSelectOption(host, '移动位置', '参照元素后')
    }
    click(host, '应用元素编辑')
    expect(app.handle.getDocument().text).toContain(expected)
    expect(host.querySelector('.cm-content')!.textContent).toContain(expected)
    expect(host.querySelector('iframe')!.srcdoc.replace(/ data-sid="\d+"/g, '')).toContain(expected)
    await app.save()
    const first = new TextDecoder('utf-8', { ignoreBOM: true }).decode(app.bytes)
    expect(first).toContain(expected)
    expect(first.startsWith('\uFEFF')).toBe(true)
    expect(first).toContain('\r\n')
    expect(first).toContain('window.keep="原件"')
    expect(first).not.toContain('data-sid')
    await app.reopen()
    expect(app.handle.getDocument().text).toContain(expected)
    await act(async () => {
      expect(
        (
          await app.handle.execute('apply_ops', {
            ops: [
              {
                op: 'set_attr',
                sid: app.handle.getDocument().map.elements.find((entry) => entry.tag === 'body')!
                  .sid,
                name: 'data-second-save',
                value: 'yes',
              },
            ],
          })
        ).ok,
      ).toBe(true)
    })
    await app.save()
    await app.reopen()
    expect(app.handle.getDocument().text).toContain(expected)
    expect(app.handle.getDocument().text).toContain('data-second-save="yes"')
  },
)

it('CSS 临时预览不改原文/版本/dirty，取消与关闭恢复，提交后二次保存保留', async () => {
  const app = await boot()
  const { host } = app
  const version = app.handle.getVersion()
  const original = app.handle.getDocument().text
  app.select()
  click(host, '元素编辑')
  click(host, 'CSS')
  type(host, '自定义 CSS 声明', 'color: red; padding: 8px')
  await tick(270)
  expect(host.querySelector('iframe')!.srcdoc).toContain('color: red; padding: 8px')
  expect(app.handle.getDocument().text).toBe(original)
  expect(app.handle.getVersion()).toBe(version)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.disabled).toBe(true)
  click(host, '取消 CSS 预览')
  expect(host.querySelector('iframe')!.srcdoc).not.toContain('color: red')
  type(host, '自定义 CSS 声明', 'color: blue')
  await tick(270)
  click(host, '元素编辑')
  expect(host.querySelector('iframe')!.srcdoc).not.toContain('color: blue')
  click(host, '元素编辑')
  click(host, 'CSS')
  type(host, '自定义 CSS 声明', 'color: red; padding: 8px')
  await tick(270)
  click(host, '应用自定义 CSS')
  expect(app.handle.getDocument().text).toContain('color: red; padding: 8px')
  await app.save()
  await app.reopen()
  expect(app.handle.getDocument().text).toContain('padding: 8px')
})

it('问 AI 预设经宿主回调；演示隔离且不注入预览属性；导出包含未保存内容', async () => {
  const ask = vi.fn<(instruction: string) => void>()
  const app = await boot(undefined, ask)
  const { host } = app
  click(host, '问 AI')
  click(host, '问 AI：美化页面')
  expect(ask).toHaveBeenCalledWith(expect.stringContaining('当前 HTML'))
  act(() =>
    [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find((tab) => tab.textContent === '视图')!
      .click(),
  )
  click(host, '演示页面')
  const frame = host.querySelector<HTMLIFrameElement>('iframe[title="演示页面"]')!
  expect(frame.srcdoc).toContain('Alpha')
  expect(frame.srcdoc).not.toContain('data-sid')
  expect(frame.sandbox.toString()).not.toContain('allow-same-origin')
  click(host, '退出演示')
  expect(host.querySelector('[aria-label="HTML 演示"]')).toBeNull()
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  await act(async () => {
    await app.handle.execute('apply_ops', {
      ops: [{ op: 'str_replace', old: 'Alpha', new: 'Unsaved' }],
    })
  })
  click(host, '导出 HTML')
  const blob = create.mock.calls[0]![0] as Blob
  expect(
    new TextDecoder('utf-8', { ignoreBOM: true })
      .decode(await blob.arrayBuffer())
      .startsWith('\uFEFF'),
  ).toBe(true)
  expect(await blob.text()).toContain('\r\n')
  expect(await blob.text()).toContain('Unsaved')
  expect(await blob.text()).not.toContain('data-sid')
  const popup = vi.spyOn(window, 'open').mockReturnValue(null)
  click(host, '在新窗口演示')
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('弹出窗口')
  const replace = vi.fn<(url: string) => void>()
  const opened = { opener: window, location: { replace } }
  popup.mockReturnValue(opened as unknown as Window)
  click(host, '在新窗口演示')
  expect(opened.opener).toBeNull()
  expect(replace).toHaveBeenCalledWith('blob:test')
  const wrapper = htmlPresentationDocument('<script>window.parent.document.cookie</script>')
  const parsed = new DOMParser().parseFromString(wrapper, 'text/html')
  expect(parsed.querySelector('script')).toBeNull()
  expect(parsed.querySelector('iframe')!.getAttribute('sandbox')).not.toContain('allow-same-origin')
})

const brief = {
  title: '生成',
  tone: '平实',
  audience: '读者',
  sections: [{ title: '开始', purpose: '解释' }],
}
it('生成中的逐段预览不改源码，完整页到达才写入并可两次保存', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const html = '<!doctype html><html><body><h1>流式生成完整页</h1></body></html>'
  const app = await boot({
    planPage: async () => brief,
    writeDocument: async ({ onDelta }) => {
      onDelta?.('<!doctype html><html><body><h1>流式生成')
      await gate
      onDelta?.('完整页</h1></body></html>')
      return { html, complete: true }
    },
  })
  const before = app.handle.getDocument().text
  let pending!: ReturnType<HtmlAgentHandle['execute']>
  act(() => {
    pending = app.handle.execute('write_document', { plan: '写指南' }, { roundId: 'stream' })
  })
  await tick()
  expect(app.host.querySelector('iframe')!.srcdoc).toContain('流式生成')
  expect(app.handle.getDocument().text).toBe(before)
  expect(app.host.querySelector('[aria-label="HTML 生成草稿"]')).not.toBeNull()
  await act(async () => {
    release()
    expect(await pending).toMatchObject({ ok: true, changed: true })
  })
  expect(app.handle.getDocument().text).toBe(html)
  expect(app.host.querySelector('[aria-label="HTML 生成草稿"]')).toBeNull()
  await app.save()
  await app.reopen()
  expect(app.handle.getDocument().text).toBe(html)
  await act(async () => {
    await app.handle.execute('apply_ops', {
      ops: [{ op: 'str_replace', old: '完整页', new: '完整页面' }],
    })
  })
  await app.save()
  await app.reopen()
  expect(app.handle.getDocument().text).toContain('完整页面')
})
it.each([true, false])('停止写作后明确选择保留部分草稿=%s，原文仅在保留后改变', async (keep) => {
  const partial = '<!doctype html><html><body><h1>尚未完成'
  const app = await boot({
    planPage: async () => brief,
    writeDocument: ({ onDelta, signal }) => {
      onDelta?.(partial)
      return new Promise((_, reject) =>
        signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
      )
    },
  })
  const before = app.handle.getDocument().text
  let pending!: ReturnType<HtmlAgentHandle['execute']>
  act(() => {
    pending = app.handle.execute('write_document', { plan: '写指南' }, { roundId: 'partial' })
  })
  await tick()
  click(app.host, '停止生成页面')
  await tick()
  expect(app.handle.getDocument().text).toBe(before)
  click(app.host, keep ? '保留部分 HTML 草稿' : '丢弃 HTML 草稿')
  await act(async () => {
    expect(await pending).toMatchObject({ ok: keep, changed: keep })
  })
  expect(app.handle.getDocument().text).toBe(keep ? partial : before)
  await app.save()
  await app.reopen()
  expect(app.handle.getDocument().text).toBe(keep ? partial : before)
})
it('草稿等待确认时人工改动或外部取消均不能覆盖当前原文', async () => {
  const controller = new AbortController()
  const app = await boot({
    planPage: async () => brief,
    writeDocument: async ({ onDelta }) => {
      onDelta?.('<html><body>部分')
      throw new Error('连接断开')
    },
  })
  let pending!: ReturnType<HtmlAgentHandle['execute']>
  act(() => {
    pending = app.handle.execute('write_document', { plan: '计划' }, { signal: controller.signal })
  })
  await tick()
  await act(async () => {
    await app.handle.execute('apply_ops', {
      ops: [{ op: 'str_replace', old: 'Alpha', new: '人工保留' }],
    })
  })
  expect(
    app.host.querySelector<HTMLButtonElement>('[aria-label="保留部分 HTML 草稿"]')!.disabled,
  ).toBe(true)
  await act(async () => {
    controller.abort()
    expect((await pending).ok).toBe(false)
  })
  expect(app.handle.getDocument().text).toContain('人工保留')
  expect(app.host.querySelector('[aria-label="HTML 生成草稿"]')).toBeNull()
})

it.each(['查找框 Escape', '替换框 Escape', '关闭按钮', '再次点击查找', '预览中的关闭按钮'])(
  '%s 关闭查找后回到原CodeMirror，保留源码、版本与预览实例',
  async (method) => {
    const app = await boot()
    const source = app.host.querySelector<HTMLElement>('.cm-content')!
    const frame = app.host.querySelector('iframe')!
    const original = app.handle.getDocument().text
    const version = app.handle.getVersion()
    act(() => {
      source.focus()
      source.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }))
    })
    const query = app.host.querySelector<HTMLInputElement>('[aria-label="查找内容"]')!
    await vi.waitFor(() => expect(document.activeElement).toBe(query))
    if (method === '预览中的关闭按钮') {
      click(app.host, '视图')
      act(() =>
        app.host.querySelector<HTMLElement>('[title="只看预览"]')!.closest('label')!.click(),
      )
    }
    expect(app.host.querySelector<HTMLElement>('.mimir-html-source')!.hidden).toBe(
      method === '预览中的关闭按钮',
    )
    if (method.endsWith('Escape')) {
      const field =
        method === '查找框 Escape'
          ? query
          : app.host.querySelector<HTMLInputElement>('[aria-label="替换为"]')!
      act(() => {
        field.focus()
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })
    } else {
      click(app.host, method === '再次点击查找' ? '查找和替换' : '关闭查找')
    }
    expect(app.host.querySelector('.me-find')).toBeNull()
    expect(app.host.querySelector<HTMLElement>('.mimir-html-source')!.hidden).toBe(false)
    expect(document.activeElement).toBe(source)
    expect(app.host.querySelector('.cm-content')).toBe(source)
    expect(app.host.querySelector('iframe')).toBe(frame)
    expect(app.handle.getDocument().text).toBe(original)
    expect(app.handle.getVersion()).toBe(version)
  },
)

it('元素Inspector支持键盘分类、Escape回焦与不抢外部焦点', async () => {
  const app = await boot()
  app.select()
  const trigger = app.host.querySelector<HTMLButtonElement>('[aria-label="元素编辑"]')!
  act(() => trigger.focus())
  click(app.host, '元素编辑')
  const panel = app.host.querySelector<HTMLElement>('[aria-label="HTML 元素属性"]')!
  expect(document.activeElement).toBe(panel)
  expect(panel.textContent).not.toContain('sid=')
  const style = [...panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (tab) => tab.textContent === '文字样式',
  )!
  act(() => {
    style.focus()
    style.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  })
  expect(document.activeElement?.textContent).toBe('内容与结构')
  expect(panel.querySelector('[aria-label="内容"]')).not.toBeNull()
  act(() =>
    panel
      .querySelector('textarea')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(app.host.querySelector('[aria-label="HTML 元素属性"]')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  click(app.host, '元素编辑')
  click(app.host, '关闭元素属性')
  expect(document.activeElement).toBe(trigger)
  click(app.host, '元素编辑')
  const outside = document.createElement('button')
  document.body.append(outside)
  act(() => outside.focus())
  click(app.host, '关闭元素属性')
  expect(document.activeElement).toBe(outside)
})

it('Inspector显示带单位的计算尺寸，未修改提交保留原件百分比，修改后保存真实尺寸', async () => {
  const app = await boot()
  const sid = app.select()
  await act(async () => {
    await app.handle.execute('apply_ops', {
      ops: [{ op: 'set_style', sid, styles: { width: '50%', height: 'auto' } }],
    })
  })
  app.select({ width: '477', height: '56' })
  click(app.host, '元素编辑')
  expect(app.host.querySelector<HTMLInputElement>('[aria-label="宽度"]')!.value).toBe('477px')
  expect(app.host.querySelector<HTMLInputElement>('[aria-label="高度"]')!.value).toBe('56px')
  const version = app.handle.getVersion()
  click(app.host, '设置宽度')
  click(app.host, '设置高度')
  expect(app.handle.getVersion()).toBe(version)
  expect(app.handle.getDocument().text).toContain('width: 50%; height: auto')
  expect(app.host.querySelector('.mimir-html-inspector__feedback')?.textContent).toContain(
    '尺寸未更改',
  )
  type(app.host, '宽度', '320px')
  click(app.host, '设置宽度')
  expect(app.handle.getDocument().text).toContain('width: 320px; height: auto')
  expect(
    [...app.host.querySelectorAll('.me-property-field__label')].filter(
      (label) => label.textContent === '文字颜色',
    ),
  ).toHaveLength(1)
  await app.save()
  await app.reopen()
  expect(app.handle.getDocument().text).toContain('width: 320px; height: auto')
})

it('Inspector下拉框Escape只关闭选项，再次Escape关闭属性面板', async () => {
  const app = await boot()
  app.select()
  click(app.host, '元素编辑')
  click(app.host, '内容与结构')
  openSelect(app.host, '元素命令')
  const input = app.host.querySelector<HTMLInputElement>('[aria-label="元素命令"]')!
  expect(input.getAttribute('aria-expanded')).toBe('true')
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      }),
    ),
  )
  expect(app.host.querySelector('[aria-label="HTML 元素属性"]')).not.toBeNull()
  await tick()
  expect(input.getAttribute('aria-expanded')).toBe('false')
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      }),
    ),
  )
  expect(app.host.querySelector('[aria-label="HTML 元素属性"]')).toBeNull()
})

it('Inspector失败保留草稿，外部修改阻止过期应用，刷新后使用当前版本', async () => {
  const app = await boot()
  app.select()
  click(app.host, '元素编辑')
  click(app.host, '内容与结构')
  pickSelectOption(app.host, '元素命令', '设置或移除属性')
  click(app.host, '应用元素编辑')
  expect(app.host.querySelector('.mimir-html-inspector__feedback')?.textContent).toContain('补全')
  type(app.host, '属性名', 'title')
  type(app.host, '值（留空则移除）', '旧草稿')
  await act(async () => {
    await app.handle.execute('apply_ops', {
      ops: [{ op: 'str_replace', old: 'Alpha', new: '新正文' }],
    })
  })
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="应用元素编辑"]')!.disabled).toBe(
    true,
  )
  expect(app.host.querySelector('[aria-label="HTML 元素属性"]')?.textContent).toContain(
    '文档已更新',
  )
  click(app.host, '应用元素编辑')
  expect(app.handle.getDocument().text).not.toContain('旧草稿')
  click(app.host, '刷新元素属性')
  click(app.host, '内容与结构')
  pickSelectOption(app.host, '元素命令', '设置或移除属性')
  type(app.host, '属性名', 'title')
  type(app.host, '值（留空则移除）', '新草稿')
  click(app.host, '应用元素编辑')
  expect(app.handle.getDocument().text).toContain('title="新草稿"')
  expect(app.handle.getDocument().text).toContain('新正文')
  await app.save()
  await app.reopen()
  expect(app.handle.getDocument().text).toContain('title="新草稿"')
})

it('CSS切换分类与过期文档均清除临时预览，不污染源码', async () => {
  const app = await boot()
  app.select()
  click(app.host, '元素编辑')
  click(app.host, 'CSS')
  type(app.host, '自定义 CSS 声明', 'padding: 17px')
  await tick(270)
  expect(app.host.querySelector('iframe')!.srcdoc).toContain('padding: 17px')
  click(app.host, '文字样式')
  expect(app.host.querySelector('iframe')!.srcdoc).not.toContain('padding: 17px')
  click(app.host, 'CSS')
  type(app.host, '自定义 CSS 声明', 'padding: 19px')
  await tick(270)
  await act(async () => {
    await app.handle.execute('apply_ops', {
      ops: [{ op: 'str_replace', old: 'Alpha', new: 'New' }],
    })
  })
  await tick(270)
  expect(app.host.querySelector('iframe')!.srcdoc).not.toContain('padding: 19px')
  expect(app.handle.getDocument().text).not.toContain('padding:')
})

it('void元素保留全部命令可发现性并明确禁用内部内容操作', async () => {
  const app = await boot()
  await act(async () => {
    await app.handle.execute('apply_ops', {
      ops: [
        {
          op: 'insert_html',
          sid: app.handle.getDocument().map.elements.find((entry) => entry.tag === 'p')!.sid,
          position: 'after',
          html: '<img alt="图" src="https://example.com/a.png">',
        },
      ],
    })
  })
  const sid = app.handle.getDocument().map.elements.find((entry) => entry.tag === 'img')!.sid
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: app.host.querySelector('iframe')!.contentWindow,
        data: {
          type: 'gx:select',
          version: app.handle.getVersion(),
          element: { sid, tag: 'img', className: '' },
        },
      }),
    ),
  )
  click(app.host, '元素编辑')
  expect(app.host.querySelector('[aria-label="图片替代文字"]')).not.toBeNull()
  click(app.host, '内容与结构')
  const before = app.handle.getDocument().text
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="应用元素编辑"]')!.disabled).toBe(
    true,
  )
  expect(app.host.querySelector('[aria-label="HTML 元素属性"]')!.textContent).toContain(
    '此元素没有内部内容',
  )
  pickSelectOption(app.host, '元素命令', '插入 HTML')
  type(app.host, '内容', '<b>After</b>')
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="应用元素编辑"]')!.disabled).toBe(
    true,
  )
  pickSelectOption(app.host, '插入位置', '元素后')
  click(app.host, '应用元素编辑')
  expect(app.handle.getDocument().text).toContain('src="https://example.com/a.png"><b>After</b>')
  expect(app.handle.getDocument().text.length).toBeGreaterThan(before.length)
  await app.save()
  await app.reopen()
  expect(app.handle.getDocument().text).toContain('<b>After</b>')
})
