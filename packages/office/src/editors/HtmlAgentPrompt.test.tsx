// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { HtmlAgentPrompt, type HtmlPromptRequest } from './HtmlAgentPrompt.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'

type AnswerQuestions = Extract<HtmlPromptRequest, { kind: 'questions' }>['resolve']
type ConfirmBrief = Extract<HtmlPromptRequest, { kind: 'brief' }>['resolve']

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})
function mount(request: HtmlPromptRequest) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const launcher = document.createElement('button')
  launcher.textContent = '页面规划'
  const host = document.createElement('div')
  host.className = 'mimir-editor'
  document.body.append(launcher, host)
  launcher.focus()
  const root = createRoot(host)
  const close = vi.fn<() => void>(() => root.render(null))
  act(() => root.render(<HtmlAgentPrompt request={request} onClose={close} />))
  cleanups.push(() => act(() => root.unmount()))
  return { host, launcher, close }
}
function click(host: HTMLElement, label: string) {
  act(() => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click())
}
function field(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  )!
  const type = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement
  act(() => {
    Object.getOwnPropertyDescriptor(type.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
it('keeps multiple choices in option order, permits deselection, and returns arrays alongside the compatible answer summary', () => {
  const resolve = vi.fn<AnswerQuestions>()
  const { host, launcher, close } = mount({
    id: 1,
    kind: 'questions',
    resolve,
    questions: [
      { id: 'sections', label: '需要哪些内容', multi: true, options: ['介绍', '案例', '联系'] },
      { id: 'tone', label: '语气', options: ['平实', '活泼'] },
    ],
  })
  const checkboxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  act(() => {
    checkboxes[1]!.click()
    checkboxes[0]!.click()
    checkboxes[2]!.click()
    checkboxes[2]!.click()
  })
  pickSelectOption(host, '语气', '平实')
  field(host, '其他补充说明', '保留中文')
  const submit = host.querySelector<HTMLButtonElement>('button[aria-label="提交页面选择"]')!
  expect(submit.textContent).toBe('提交页面选择')
  expect(submit.closest('footer')).not.toBeNull()
  expect(submit.closest('.mimir-html-inspector__scroll')).toBeNull()
  click(host, '提交页面选择')
  expect(resolve).toHaveBeenCalledExactlyOnceWith({
    answers: '需要哪些内容: 介绍、案例\n语气: 平实\n其他：保留中文',
    selections: { sections: ['介绍', '案例'], tone: ['平实'] },
  })
  expect(close).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(launcher)
})
it('returns empty selection arrays as AI defaults and preserves the original single-choice response shape', () => {
  const multi = vi.fn<AnswerQuestions>()
  const first = mount({
    id: 2,
    kind: 'questions',
    resolve: multi,
    questions: [{ id: 'parts', label: '内容', multi: true, options: ['正文'] }],
  })
  click(first.host, '提交页面选择')
  expect(multi).toHaveBeenCalledExactlyOnceWith({
    answers: '内容: 由 AI 决定',
    selections: { parts: [] },
  })
  const single = vi.fn<AnswerQuestions>()
  const second = mount({
    id: 3,
    kind: 'questions',
    resolve: single,
    questions: [{ id: 'parts', label: '内容', options: ['正文'] }],
  })
  click(second.host, '提交页面选择')
  expect(single).toHaveBeenCalledExactlyOnceWith({ answers: '内容: 由 AI 决定' })
})
it.each(['Escape', '关闭页面规划', '跳过页面问题'])(
  'cancels questions explicitly via %s and returns focus without submitting choices',
  (method) => {
    const resolve = vi.fn<AnswerQuestions>()
    const { host, launcher } = mount({
      id: 4,
      kind: 'questions',
      resolve,
      questions: [{ id: 'parts', label: '内容', multi: true, options: ['正文'] }],
    })
    if (method === 'Escape')
      act(() =>
        host
          .querySelector('aside')!
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      )
    else click(host, method)
    expect(resolve).toHaveBeenCalledExactlyOnceWith({ answers: '', cancelled: true })
    expect(document.activeElement).toBe(launcher)
  },
)
it('confirms edited brief fields from the same fixed-action Inspector and leaves external focus alone on cancellation', () => {
  const resolve = vi.fn<ConfirmBrief>()
  const brief = {
    title: '旧标题',
    audience: '读者',
    tone: '简洁',
    sections: [{ title: '一', purpose: '介绍' }],
  }
  const { host } = mount({ id: 5, kind: 'brief', brief, mode: 'new', resolve })
  field(host, '页面标题', '新标题')
  field(host, '章节 1 标题', '概述')
  field(host, '章节 1 用途', '说明')
  click(host, '添加页面章节')
  field(host, '章节 2 标题', '案例')
  field(host, '章节 2 用途', '实证')
  expect(host.querySelector('button[aria-label="确认页面提纲"]')!.textContent).toBe('确认页面提纲')
  click(host, '确认页面提纲')
  expect(resolve).toHaveBeenCalledExactlyOnceWith({
    kind: 'confirmed',
    brief: expect.objectContaining({
      ...brief,
      title: '新标题',
      sections: [
        { title: '概述', purpose: '说明' },
        { title: '案例', purpose: '实证' },
      ],
      user_edited: expect.arrayContaining(['meta.title', 'sections']),
    }),
  })
  const cancel = vi.fn<ConfirmBrief>()
  const second = mount({ id: 6, kind: 'brief', brief, mode: 'restyle', resolve: cancel })
  const external = document.createElement('input')
  document.body.append(external)
  external.focus()
  click(second.host, '取消页面提纲')
  expect(cancel).toHaveBeenCalledExactlyOnceWith(null)
  expect(document.activeElement).toBe(external)
})

it.each(['__proto__', 'constructor', 'toString'])(
  'accepts the legal question ID %s without reading inherited properties',
  (id) => {
    const resolve = vi.fn<AnswerQuestions>()
    const { host } = mount({
      id: 7,
      kind: 'questions',
      resolve,
      questions: [{ id, label: '内容', multi: true, options: ['介绍', '联系'] }],
    })
    act(() => host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!.click())
    click(host, '提交页面选择')
    expect(resolve).toHaveBeenCalledExactlyOnceWith({
      answers: '内容: 联系',
      selections: Object.fromEntries([[id, ['联系']]]),
    })
  },
)

it('chooses an alternative, records edits, and returns redo without confirming source changes', () => {
  const resolve = vi.fn<ConfirmBrief>()
  const brief = {
    title: '页面',
    audience: '读者',
    tone: '平实',
    style: {
      tone: '平实',
      palette: { bg: '#F0F0F0' },
      typography: { body: 'Georgia' },
      tokens: { shadow: '0 2px 4px #0002' },
      layout: '两栏',
      docx_friendly: true,
    },
    sections: [{ title: '概述', purpose: '说明' }],
    user_edited: ['meta.language'],
    alternatives: [{ name: '紧凑', tone: '简洁', palette: { primary: '#123456' }, typography: {} }],
  }
  const { host } = mount({ id: 8, kind: 'brief', brief, mode: 'new', resolve })
  click(host, '选择视觉方向：紧凑')
  click(host, '确认页面提纲')
  expect(resolve).toHaveBeenCalledExactlyOnceWith({
    kind: 'confirmed',
    brief: expect.objectContaining({
      tone: '简洁',
      style: { name: '紧凑', tone: '简洁', palette: { primary: '#123456' }, typography: {} },
      user_edited: ['meta.language', 'style'],
    }),
  })
  const redo = vi.fn<ConfirmBrief>()
  const second = mount({ id: 9, kind: 'brief', brief, mode: 'restyle', resolve: redo })
  field(second.host, '重新拟定说明', '保留内容，减少留白')
  click(second.host, '重新拟定页面提纲')
  expect(redo).toHaveBeenCalledExactlyOnceWith({ kind: 'redo', note: '保留内容，减少留白' })
})
