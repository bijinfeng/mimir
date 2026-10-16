import { Node, type MarkdownToken } from '@tiptap/core'
import { renderToString } from 'katex'
import 'katex/dist/katex.min.css'

const MATH_FENCE = /^\$\$[ \t]*\n([\s\S]*?)\n\$\$(?=\n|$)/

function renderFormula(target: HTMLElement, latex: string) {
  try {
    target.innerHTML = renderToString(latex, {
      displayMode: true,
      throwOnError: true,
      trust: false,
      output: 'htmlAndMathml',
    })
    target.classList.remove('mimir-math-block__error')
  } catch {
    target.textContent = latex || '空公式'
    target.classList.add('mimir-math-block__error')
  }
}

/** A fenced $$ block is one Markdown node in both the editor and read-only body. */
export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { latex: { default: '' } }
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-mimir-math-block]',
        getAttrs: (element) => ({ latex: (element as HTMLElement).dataset.latex ?? '' }),
      },
    ]
  },
  renderHTML({ node }) {
    return ['div', { 'data-mimir-math-block': '', 'data-latex': node.attrs.latex as string }]
  },
  markdownTokenizer: {
    name: 'mathBlock',
    level: 'block',
    start: (source: string) => source.indexOf('$$'),
    tokenize: (source: string): MarkdownToken | undefined => {
      const match = MATH_FENCE.exec(source)
      if (!match) return undefined
      return { type: 'mathBlock', raw: match[0], text: match[1] }
    },
  },
  parseMarkdown(token) {
    return { type: 'mathBlock', attrs: { latex: token.text ?? '' } }
  },
  renderMarkdown(node) {
    return `$$\n${String(node.attrs?.latex ?? '')}\n$$`
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      dom.className = 'mimir-math-block'
      dom.dataset.mimirMathBlock = ''
      const preview = document.createElement('div')
      preview.className = 'mimir-math-block__preview'
      dom.append(preview)
      const source = document.createElement('textarea')
      source.className = 'mimir-math-block__source'
      source.setAttribute('aria-label', '数学公式 LaTeX 源码')
      source.spellcheck = false
      source.rows = 2
      source.value = String(node.attrs.latex ?? '')
      if (editor.isEditable) dom.append(source)
      renderFormula(preview, source.value)
      source.addEventListener('input', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (typeof pos !== 'number') return
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { latex: source.value }))
      })
      return {
        dom,
        update(nextNode) {
          if (nextNode.type.name !== 'mathBlock') return false
          const latex = String(nextNode.attrs.latex ?? '')
          if (source.value !== latex) source.value = latex
          renderFormula(preview, latex)
          return true
        },
        stopEvent: (event) => event.target === source,
        ignoreMutation: () => true,
      }
    }
  },
})
