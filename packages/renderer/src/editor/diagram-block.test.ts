// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, expect, it, vi } from 'vitest'
import { createExtensions } from './extensions'
import { renderDiagram, sanitizeDiagramSvg } from './diagram-render'
import { runOps } from '../../../office/src/agent/markdown-ops'
import {
  MarkdownSlash,
  markdownSlashItems,
  type MarkdownSlashState,
} from '../../../office/src/editors/markdown-slash'

vi.mock('pele/lazy', { spy: true })

const editors: Editor[] = []
const mounts: HTMLElement[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
  mounts.splice(0).forEach((mount) => mount.remove())
  vi.restoreAllMocks()
})

function open(markdown: string, editable = true) {
  const mount = document.createElement('div')
  document.body.append(mount)
  mounts.push(mount)
  let menu: MarkdownSlashState | null = null
  const editor = new Editor({
    element: mount,
    extensions: [
      ...createExtensions(),
      MarkdownSlash.configure({
        controller: {
          open: (state) => {
            menu = state
          },
          update: (state) => {
            menu = state
          },
          keyDown: () => false,
          close: () => {
            menu = null
          },
        },
      }),
    ],
    content: markdown,
    contentType: 'markdown',
    editable,
  })
  editors.push(editor)
  return { editor, mount, menu: () => menu }
}

it('renders real WaveJSON including JSON5, timing signals and local SVG uses', async () => {
  const result = await renderDiagram(
    'wavedrom',
    "{signal: [{name: 'clk', wave: 'p..'}, {name: 'data', wave: 'x34', data: ['head', 'tail']}]}",
  )
  if (!result.ok) throw new Error(result.error)
  expect(result.svg).toContain('<svg')
  expect(result.svg).toContain('clk')
  expect(result.svg).toContain('head')
  expect(result.svg).toContain('href="#')
})

it('renders real Mermaid compatibility output when Pele fails and reports malformed diagrams', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  const pele = await import('pele/lazy')
  vi.mocked(pele.renderAsync).mockRejectedValueOnce(new Error('Pele unavailable'))
  // jsdom has no SVG layout engine; supply only the text measurement the renderer needs.
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value() {
      return { x: 0, y: 0, width: 80, height: 24 }
    },
  })
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value() {
      return 80
    },
  })
  try {
    const result = await renderDiagram('mermaid', 'flowchart LR\n  A[Start] --> B[Done]')
    if (!result.ok) throw new Error(result.error)
    expect(result.svg).toContain('Start')
    expect(result.svg).toContain('Done')
    expect(result.svg).not.toContain('foreignObject')
    expect((await renderDiagram('mermaid', 'not a diagram')).ok).toBe(false)
  } finally {
    Reflect.deleteProperty(SVGElement.prototype, 'getBBox')
    Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength')
  }
}, 15_000)

it.each([
  ['wavedrom', "{signal: [{name:'clk', wave:'p...'}]}"],
  ['mermaid', 'flowchart LR\nA[开始] --> B[完成]'],
])(
  'keeps normal code highlighting and %s fenced source while rendering diagram previews',
  async (language, source) => {
    const { editor, mount } = open(
      `前文\n\n\`\`\`${language}\n${source}\n\`\`\`\n\n\`\`\`js\nconst x = 1\n\`\`\``,
    )
    expect(editor.state.doc.child(1).type.name).toBe('codeBlock')
    expect(mount.querySelector('code .hljs-keyword')).not.toBeNull()
    await vi.waitFor(() => expect(mount.querySelector('.mimir-diagram img')).not.toBeNull())
    expect(mount.querySelector('.mimir-diagram pre')?.hasAttribute('hidden')).toBe(false)
    const saved = editor.getMarkdown()
    const reopened = open(saved, false)
    expect(reopened.editor.getMarkdown()).toBe(saved)
    await vi.waitFor(() =>
      expect(reopened.mount.querySelector('.mimir-diagram img')).not.toBeNull(),
    )
    expect((reopened.mount.querySelector('.mimir-diagram pre') as HTMLElement).hidden).toBe(true)
  },
)

it.each([
  ['wavedrom', '{signal: []}', "{signal: [{name:'clk',wave:'p...'}]}"],
  ['mermaid', 'not a diagram', 'flowchart LR\nA[开始] --> B[完成]'],
])(
  'edits the same %s code block through Agent operations and keeps errors recoverable',
  async (language, source, fixedSource) => {
    const markdown = `\`\`\`${language}\n${source}\n\`\`\``
    const { editor, mount } = open(markdown)
    await vi.waitFor(() =>
      expect(mount.querySelector('.mimir-diagram__error')?.textContent).toContain('无法绘制图形'),
    )
    expect(editor.getMarkdown()).toBe(markdown)
    expect((mount.querySelector('.mimir-diagram pre') as HTMLElement).hidden).toBe(false)
    const result = runOps(
      editor,
      [
        {
          op: 'replaceText',
          target: { start: 0 },
          find: source,
          replace: fixedSource,
        },
      ],
      { source: 'ai' },
    )
    expect(result.applied).toBe(1)
    await vi.waitFor(() => expect(mount.querySelector('.mimir-diagram img')).not.toBeNull())
    expect(editor.getMarkdown()).toContain(fixedSource)
    expect(mount.querySelector('.mimir-diagram__error')).toBeNull()
    expect(editor.commands.undo()).toBe(true)
    expect(editor.state.doc.firstChild?.textContent).toBe(source)
    expect(editor.getMarkdown().trimEnd()).toBe(markdown)
  },
)

it.each([
  ['mermaid', 'diagram'],
  ['wavedrom', 'waveform'],
])('offers and inserts /%s through the shared operation', async (query, id) => {
  const { editor, menu } = open('')
  expect(markdownSlashItems(editor, query).map((item) => item.id)).toEqual([id])
  editor.commands.insertContent(`/${query}`)
  await vi.waitFor(() => expect(menu()?.items.some((item) => item.id === id)).toBe(true))
  menu()?.command(menu()!.items.find((item) => item.id === id)!)
  expect(editor.getMarkdown()).toContain(`\`\`\`${query}\n`)
  expect(editor.getMarkdown()).not.toContain(`/${query}`)
})

it('sanitizes SVG event handlers and external resources while retaining fragment references', () => {
  const svg = sanitizeDiagramSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" onload="alert(1)"><script>alert(1)</script><image href="https://example.com/pixel"/><use href="#signal"/><use href="https://example.com/x"/><path fill="url(#gradient)"/><style>@import url(https://example.com/x); text{fill:red}</style></svg>',
  )
  expect(svg).not.toMatch(/onload|script|https:\/\//)
  expect(svg).toContain('href="#signal"')
  expect(svg).toContain('url(#gradient)')
  expect(svg).toContain('width="20"')
  expect(svg).toContain('height="10"')
})

it('rejects empty, executable and malformed diagram sources without evaluating them', async () => {
  for (const source of ['', '{signal: []}', '{signal: (() => alert(1))()}', 'not JSON']) {
    const result = await renderDiagram('wavedrom', source)
    expect(result.ok).toBe(false)
  }
})
