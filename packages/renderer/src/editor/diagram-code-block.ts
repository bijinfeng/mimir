import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { diagramLanguage, renderDiagram } from './diagram-render'

/** Keep codeBlock + language and its original Markdown serializer as the document truth. */
export const DiagramCodeBlock = CodeBlockLowlight.extend({
  addStorage() {
    return { diagramLanguages: ['mermaid', 'wavedrom'] }
  },
  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('div')
      const preview = document.createElement('div')
      preview.className = 'mimir-diagram__preview'
      preview.contentEditable = 'false'
      preview.setAttribute('aria-live', 'polite')
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      pre.append(code)
      dom.append(preview, pre)
      let revision = 0
      let disposed = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let lastSource: string | undefined
      let lastLanguage: string | null = null

      function update(current: typeof node) {
        const language = diagramLanguage(current.attrs.language)
        const source = current.textContent
        if (source === lastSource && language === lastLanguage) return
        lastSource = source
        lastLanguage = language
        const currentRevision = ++revision
        clearTimeout(timer)
        dom.className = language ? 'mimir-diagram' : ''
        code.className =
          typeof current.attrs.language === 'string' ? `language-${current.attrs.language}` : ''
        preview.hidden = !language
        pre.hidden = false
        if (!language) {
          delete dom.dataset.diagramLanguage
          return
        }
        dom.dataset.diagramLanguage = language
        preview.textContent = '正在绘制图形…'
        preview.setAttribute('aria-busy', 'true')
        timer = setTimeout(() => {
          void renderDiagram(language, source).then((result) => {
            if (disposed || revision !== currentRevision) return
            preview.removeAttribute('aria-busy')
            preview.replaceChildren()
            preview.classList.toggle('mimir-diagram__error', !result.ok)
            if (result.ok) {
              const image = document.createElement('img')
              image.alt = language === 'mermaid' ? 'Mermaid 图表' : 'WaveDrom 时序图'
              image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`
              preview.append(image)
              pre.hidden = !editor.isEditable
            } else {
              preview.textContent = `无法绘制图形：${result.error}`
            }
          })
        }, 180)
      }
      update(node)
      return {
        dom,
        contentDOM: code,
        update(nextNode) {
          if (nextNode.type !== node.type) return false
          update(nextNode)
          return true
        },
        ignoreMutation: (mutation) =>
          mutation.type !== 'selection' && !code.contains(mutation.target),
        destroy() {
          disposed = true
          clearTimeout(timer)
        },
      }
    }
  },
})
