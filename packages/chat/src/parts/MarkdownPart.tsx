import { Markdown } from '@tanstack/markdown/react'
import { streamingMarkdownExtension } from '@tanstack/markdown/extensions/streaming'
import type { MarkdownComponents } from '@tanstack/markdown/react'
import { CodeBlock } from './CodeBlock.js'

/**
 * 消息正文的 Markdown。
 *
 * ## 为什么还是 @tanstack/markdown
 *
 * 官方（assistant-ui）的那份 markdown 组件会带进 react-markdown 与一整套
 * radix 依赖，而本仓现有的**流式解析与样式覆写**都长在 `@tanstack/markdown`
 * 上（`ChatPanel.style.ts` 的 `[data-role='assistant']` 那一大段）。
 * 换掉它等于把那些覆写重写一遍，只为了换一个渲染器。
 *
 * ## 组件表必须在模块级
 *
 * `Markdown` 的 `components` 是**普通对象**，每次渲染新建一个会让它
 * 内部的重建判断失效（等于每次消息更新都重挂整棵子树）。提到模块级常量，
 * 身份稳定。
 *
 * ## 流式那一份 extension 不能省
 *
 * `streamingMarkdownExtension()` 让「还没写完的 markdown」也能渲染——
 * 少了它，一个刚写到一半的 `**加粗` 会在界面上闪出星号。这是流的常态，
 * 不是边界情况。
 */
const STREAMING = [streamingMarkdownExtension()]

const COMPONENTS: MarkdownComponents = {
  pre: CodeBlock,
}

export function MarkdownPart({ text }: { text: string }) {
  return (
    <Markdown frontmatter={false} headingIds={false} extensions={STREAMING} components={COMPONENTS}>
      {text}
    </Markdown>
  )
}
