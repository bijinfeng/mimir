import { useEffect, useRef } from 'react'
import type { Heading } from '@/components/document/headings'

/**
 * 资料的只读正文。
 *
 * 这里**不做 Markdown 渲染**，而是让 Tiptap 以只读模式渲染——
 * 两端都渲染同一份 Markdown 才能保证「编辑时看到的」和「只读时看到的」
 * 是同一个规范形。若这里换一个 Markdown 渲染库，两边的表格/代码块
 * 表现必然有差异，而这种差异只会在用户眼里出现，代码里看不出来。
 */
export function MarkdownBody({ body, headings }: { body: string; headings: Heading[] }) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let editor: { destroy: () => void } | null = null
    void (async () => {
      const [{ Editor }, { createExtensions }] = await Promise.all([
        import('@tiptap/core'),
        import('@/editor/extensions'),
      ])
      editor = new Editor({
        element: mount,
        extensions: createExtensions(),
        content: body,
        contentType: 'markdown',
        editable: false,
      })
    })()

    return () => editor?.destroy()
  }, [body])

  // 大纲锚点：Tiptap 渲染出的标题拿不到自定义 id，所以在挂载后补上。
  // 序号规则与 extractHeadings 完全一致
  useEffect(() => {
    const mount = mountRef.current
    if (!mount || headings.length === 0) return

    const nodes = mount.querySelectorAll('h1, h2, h3, h4, h5, h6')
    nodes.forEach((node, index) => {
      const heading = headings[index]
      if (heading) node.id = heading.id
    })
  }, [headings])

  return <div ref={mountRef} />
}
