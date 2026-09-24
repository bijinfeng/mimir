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

    /**
     * **`destroyed` 这个旗子是必需的，不是防御性写法。**
     *
     * `@tiptap/core` 是动态 import 的（它不小，而首屏不一定有只读正文）。
     * 于是「实例创建」发生在**下一次微任务**里，而清理函数可能先跑——
     * StrictMode 的双次挂载正好是这种情况：
     *
     * ```
     * effect ① 跑 → 开始 import（还没 resolve）
     * cleanup ① 跑 → editor 仍是 null，什么也没销毁
     * effect ② 跑 → 又 import 一次
     * 两个 import 都 resolve → 同一个挂载点上出现两个 ProseMirror
     * ```
     *
     * 现场证据：右栏一次渲染出 **2 个 `.ProseMirror`**（内容完全一样），
     * 而界面看起来是正常的——只是内容重复了一遍，且大纲锚点序号错位。
     * 只在开发期的 StrictMode 下出现，所以它很容易活到线上却查不出来。
     */
    let destroyed = false
    let editor: { destroy: () => void } | null = null

    void (async () => {
      const [{ Editor }, { createExtensions }] = await Promise.all([
        import('@tiptap/core'),
        import('@/editor/extensions'),
      ])

      // import 期间组件已经被卸载：连实例都不建，避免「建完立刻销毁」的闪烁
      if (destroyed) return

      editor = new Editor({
        element: mount,
        extensions: createExtensions(),
        content: body,
        contentType: 'markdown',
        editable: false,
      })
    })()

    return () => {
      destroyed = true
      editor?.destroy()
      editor = null
    }
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
